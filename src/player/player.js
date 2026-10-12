import { PlaybackReporter, resolvePlayback, TICKS_PER_SECOND } from '../jellyfin/playback.js';

const PROGRESS_INTERVAL_MS = 10_000;
const MAX_HLS_RECOVERIES = 3;
const MAX_VOLUME = 1.5;
const LOAD_POLICY = {
	maxTimeToFirstByteMs: 30_000,
	maxLoadTimeMs: 120_000,
	timeoutRetry: { maxNumRetry: 4, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
	errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000, backoff: 'exponential' },
};

/**
 * Owns the <video> element and the playback session of one item at a time.
 *
 * Events (dispatched on the player itself):
 * - `statechange`: anything visible changed (play/pause, item, tracks…)
 * - `timeupdate`: position changed
 * - `subtitle`: { detail: { text } } the subtitle line to display ('' to clear)
 * - `ended`: the item finished
 * - `outro`: the end credits started (needs media segments on the server)
 * - `error`: { detail: { error } }
 */
export class Player extends EventTarget {
	constructor() {
		super();
		this.video = document.createElement('video');
		this.video.crossOrigin = 'anonymous';
		this.video.playsInline = true;
		this.video.preload = 'auto';
		this.video.style.display = 'none';
		document.body.appendChild(this.video);

		this.hls = null;
		this.api = null;
		this.userId = null;
		this.item = null;
		this.source = null;
		this.reporter = null;
		this.progressTimer = null;
		this.subtitleIndex = -1;
		this.subtitleTrack = null;
		this.loading = false;
		this.outroStart = null;
		this.outroReached = false;
		this.sources = null;
		// Volume goes through Web Audio: the Quest Browser ignores video.volume.
		this.volume = 1;
		this.audio = null;

		const v = this.video;
		v.addEventListener('play', () => this.report('Unpause'));
		v.addEventListener('pause', () => {
			if (!v.ended) this.report('Pause');
		});
		v.addEventListener('seeked', () => this.report('TimeUpdate'));
		v.addEventListener('volumechange', () => this.report('VolumeChange'));
		v.addEventListener('timeupdate', () => {
			this.emit('timeupdate');
			if (this.outroStart !== null && !this.outroReached && v.currentTime >= this.outroStart) {
				this.outroReached = true;
				this.emit('outro', { item: this.item });
			}
		});
		v.addEventListener('ended', () => this.onEnded());
		v.addEventListener('error', () => {
			// Errors while loading are handled by load(); this catches later failures.
			if (this.reporter) this.fail(new Error(`Video error: ${v.error?.message || v.error?.code}`));
		});
		for (const type of ['play', 'pause', 'loadedmetadata', 'waiting', 'playing']) {
			v.addEventListener(type, () => this.emit('statechange'));
		}

		window.addEventListener('pagehide', () => this.reporter?.stopOnUnload(this.state()));
	}

	/** @param {ReturnType<import('../jellyfin/library.js').createSources>} sources */
	setSession(api, userId, sources) {
		this.api = api;
		this.userId = userId;
		this.sources = sources;
	}

	emit(type, detail) {
		this.dispatchEvent(new CustomEvent(type, { detail }));
	}

	state() {
		return {
			position: this.video.currentTime || 0,
			paused: this.video.paused,
			muted: this.video.muted,
			volume: Math.min(1, this.volume),
		};
	}

	get isActive() {
		return this.item !== null;
	}

	get duration() {
		if (Number.isFinite(this.video.duration)) return this.video.duration;
		return (this.item?.RunTimeTicks ?? 0) / TICKS_PER_SECOND;
	}

	/**
	 * Plays an item, resuming where the user left off.
	 * @param {object} item BaseItemDto
	 * @param {object} [options]
	 * @param {number} [options.startPosition] seconds; defaults to the saved resume point
	 * @param {number} [options.audioStreamIndex]
	 * @param {number} [options.subtitleIndex]
	 * @param {string} [options.mediaSourceId] version to play
	 */
	async play(item, { startPosition, audioStreamIndex, subtitleIndex, mediaSourceId } = {}) {
		this.loading = true;
		await this.stop();
		this.item = item;
		this.emit('statechange');
		try {
			const outroStart = this.sources?.outroStart(item.Id) ?? Promise.resolve(null);
			let source = await resolvePlayback(this.api, { item, userId: this.userId, audioStreamIndex, mediaSourceId });
			if (this.item !== item) return; // Another play() started meanwhile.
			const start = startPosition ?? (item.UserData?.PlaybackPositionTicks ?? 0) / TICKS_PER_SECOND;
			try {
				await this.load(source, start);
			} catch (error) {
				if (source.mode !== 'direct') throw error;
				// The browser over-promised (e.g. canPlayType "maybe" for MKV): fall back
				// to a remux, which still copies the video stream.
				console.warn('[player] direct play failed, retrying as remux', error);
				this.hls?.destroy();
				this.hls = null;
				source = await resolvePlayback(this.api, { item, userId: this.userId, audioStreamIndex, mediaSourceId, allowDirectPlay: false });
				if (this.item !== item) return;
				await this.load(source, start);
			}
			this.selectSubtitle(subtitleIndex ?? this.defaultSubtitleIndex(source));
			this.reporter = new PlaybackReporter(this.api, item, source);
			this.reporter.subtitleStreamIndex = this.subtitleIndex;
			await this.reporter.start(this.state());
			await this.video.play().catch((error) => console.warn('[player] autoplay blocked', error));
			this.progressTimer = setInterval(() => this.report('TimeUpdate'), PROGRESS_INTERVAL_MS);
			const outro = await outroStart;
			if (this.item === item) {
				this.outroStart = outro;
				// Resuming inside the credits must not trigger the prompt right away.
				this.outroReached = outro !== null && start >= outro;
			}
			console.info(`[player] ${source.mode}`, source.transcodeReasons.join(', ') || '', source.url);
		} catch (error) {
			this.fail(error);
		} finally {
			this.loading = false;
			this.emit('statechange');
		}
	}

	/** @param {import('../jellyfin/playback.js').PlaybackSource} source */
	async load(source, start) {
		this.source = source;
		// hls.js is only needed for remuxed/transcoded streams: load it lazily.
		const Hls = source.isHls ? (await import('hls.js')).default : null;
		const v = this.video;
		return new Promise((resolve, reject) => {
			const onReady = () => {
				cleanup();
				// Seek before resolving, so the start report has the resume position.
				if (start > 0) v.currentTime = start;
				resolve();
			};
			const onError = () => {
				cleanup();
				reject(new Error(`Could not load the video (${v.error?.message || 'unsupported format'}).`));
			};
			const cleanup = () => {
				v.removeEventListener('loadedmetadata', onReady);
				v.removeEventListener('error', onError);
			};
			v.addEventListener('loadedmetadata', onReady);
			v.addEventListener('error', onError);

			if (Hls?.isSupported()) {
				const hls = new Hls({
					startPosition: start,
					maxBufferLength: 60,
					// A weak server can take a while to produce the first remuxed
					// segments (and to restart after a seek): be patient.
					fragLoadPolicy: { default: LOAD_POLICY },
					playlistLoadPolicy: { default: LOAD_POLICY },
					manifestLoadPolicy: { default: LOAD_POLICY },
				});
				this.hls = hls;
				let recoveries = 0;
				let loaded = false;
				v.addEventListener('loadedmetadata', () => { loaded = true; }, { once: true });
				hls.on(Hls.Events.ERROR, (_, data) => {
					if (!data.fatal || this.hls !== hls) return;
					// The usual hls.js recovery: reload after network errors, reset the
					// decoder after media errors. Give up after a few attempts.
					if (recoveries < MAX_HLS_RECOVERIES) {
						recoveries++;
						console.warn(`[player] streaming error (${data.details}), recovering (${recoveries}/${MAX_HLS_RECOVERIES})`);
						if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
						else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
						else recoveries = MAX_HLS_RECOVERIES;
						if (recoveries < MAX_HLS_RECOVERIES) return;
					}
					const error = new Error(`Streaming error: ${data.details}`);
					if (loaded) this.fail(error);
					else {
						cleanup();
						reject(error);
					}
				});
				hls.on(Hls.Events.FRAG_BUFFERED, () => { recoveries = 0; });
				this.hls.loadSource(source.url);
				this.hls.attachMedia(v);
			} else {
				v.src = source.url;
			}
		});
	}

	defaultSubtitleIndex(source) {
		const tracks = source.subtitles;
		const forced = tracks.find((t) => t.isForced);
		const preferred = tracks.find((t) => t.isDefault);
		return (preferred ?? forced)?.index ?? -1;
	}

	/** @param {number} index Jellyfin stream index, -1 to disable */
	selectSubtitle(index) {
		this.subtitleTrack?.remove();
		this.subtitleTrack = null;
		this.subtitleIndex = index;
		this.emit('subtitle', { text: '' });
		const sub = this.source?.subtitles.find((s) => s.index === index);
		if (sub) {
			const track = document.createElement('track');
			track.kind = 'subtitles';
			track.src = sub.url;
			track.srclang = sub.language ?? '';
			this.video.appendChild(track);
			track.track.mode = 'hidden';
			track.addEventListener('cuechange', () => {
				const text = [...(track.track.activeCues ?? [])].map((cue) => cleanCueText(cue.text)).join('\n');
				this.emit('subtitle', { text });
			});
			track.addEventListener('error', () => console.warn('[player] subtitle failed to load', sub.url));
			this.subtitleTrack = track;
		}
		if (this.reporter) {
			this.reporter.subtitleStreamIndex = index;
			this.report('SubtitleTrackChange');
		}
		this.emit('statechange');
	}

	/** Switching audio needs a new stream: browsers can't pick tracks of a file. */
	async selectAudio(index) {
		if (!this.item || index === this.source?.audioStreamIndex) return;
		await this.play(this.item, {
			startPosition: this.video.currentTime,
			audioStreamIndex: index,
			subtitleIndex: this.subtitleIndex,
			mediaSourceId: this.source?.mediaSource.Id,
		});
	}

	togglePlay() {
		if (!this.item) return;
		if (this.video.paused) this.video.play();
		else this.video.pause();
	}

	seek(seconds) {
		if (!this.item) return;
		this.video.currentTime = Math.max(0, Math.min(seconds, this.duration - 1));
		this.emit('timeupdate');
	}

	seekBy(delta) {
		this.seek(this.video.currentTime + delta);
	}

	/** @param {number} volume 0 to MAX_VOLUME (above 1 boosts quiet films) */
	setVolume(volume) {
		this.volume = Math.round(Math.max(0, Math.min(MAX_VOLUME, volume)) * 10) / 10;
		this.video.muted = false;
		try {
			this.ensureAudioGraph();
			this.audio.gain.gain.value = this.volume;
		} catch (error) {
			// No Web Audio: fall back to the element volume (ignored on some browsers).
			console.warn('[player] Web Audio unavailable', error);
			this.video.volume = Math.min(1, this.volume);
		}
		this.report('VolumeChange');
	}

	/**
	 * Routes the video's audio through a gain node. Created on the first volume
	 * change (a user gesture, so the AudioContext may start); once created, the
	 * element's audio only plays through it, for the rest of the session.
	 */
	ensureAudioGraph() {
		if (this.audio) {
			if (this.audio.context.state === 'suspended') this.audio.context.resume();
			return;
		}
		const context = new AudioContext();
		const source = context.createMediaElementSource(this.video);
		const gain = context.createGain();
		source.connect(gain).connect(context.destination);
		this.audio = { context, gain };
		context.resume();
	}

	report(eventName) {
		this.reporter?.progress(this.state(), eventName).catch((error) => console.warn('[player] progress report failed', error));
		this.emit('statechange');
	}

	async onEnded() {
		const item = this.item;
		await this.stop();
		this.emit('ended', { item });
	}

	fail(error) {
		console.error('[player]', error);
		this.emit('error', { error });
		this.stop();
	}

	/** Stops playback and reports it, so Jellyfin saves the resume point. */
	async stop() {
		clearInterval(this.progressTimer);
		this.progressTimer = null;
		const reporter = this.reporter;
		const state = this.state();
		this.reporter = null;
		this.item = null;
		this.source = null;
		this.outroStart = null;
		this.outroReached = false;
		this.subtitleTrack?.remove();
		this.subtitleTrack = null;
		this.subtitleIndex = -1;
		this.hls?.destroy();
		this.hls = null;
		this.video.pause();
		this.video.removeAttribute('src');
		this.video.load();
		this.emit('subtitle', { text: '' });
		this.emit('statechange');
		if (reporter) {
			try {
				await reporter.stop(state);
			} catch (error) {
				console.warn('[player] stop report failed', error);
			}
		}
	}
}

/** WebVTT cue text may contain markup (<i>, <c.color>…) that we render as plain text. */
function cleanCueText(text) {
	return text
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ');
}
