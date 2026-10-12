import { getMediaInfoApi } from '@jellyfin/sdk/lib/utils/api/media-info-api';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';
import { buildDeviceProfile } from './device-profile.js';

export const TICKS_PER_SECOND = 10_000_000;

// Transcode reasons that mean the *video* is re-encoded (expensive). Anything
// else (container, audio…) only needs a remux / audio transcode.
const VIDEO_TRANSCODE_REASONS = new Set([
	'VideoCodecNotSupported', 'VideoProfileNotSupported', 'VideoLevelNotSupported',
	'VideoResolutionNotSupported', 'VideoBitDepthNotSupported', 'VideoFramerateNotSupported',
	'RefFramesNotSupported', 'VideoRangeTypeNotSupported', 'VideoBitrateNotSupported',
	'ContainerBitrateExceedsLimit', 'AnamorphicVideoNotSupported', 'InterlacedVideoNotSupported',
	'VideoCodecTagNotSupported', 'SubtitleCodecNotSupported',
]);

/**
 * @typedef {object} PlaybackSource
 * @property {string} url Media URL (progressive file or HLS playlist).
 * @property {boolean} isHls
 * @property {'DirectPlay' | 'Transcode'} playMethod What Jellyfin expects in reports.
 * @property {'direct' | 'remux' | 'transcode'} mode What actually happens on the server.
 * @property {string[]} transcodeReasons
 * @property {string} playSessionId
 * @property {object} mediaSource
 * @property {number | undefined} audioStreamIndex
 * @property {Array<{ index: number, label: string, language?: string, isDefault: boolean, isForced: boolean, url: string, kind: 'text' | 'pgs' }>} subtitles
 * @property {Array<{ index: number, label: string, isDefault: boolean }>} audioTracks
 */

/**
 * Asks Jellyfin how to play an item on this device.
 * @param {import('@jellyfin/sdk').Api} api
 * @param {object} options
 * @param {object} options.item
 * @param {string} options.userId
 * @param {number} [options.audioStreamIndex]
 * @param {string} [options.mediaSourceId]
 * @returns {Promise<PlaybackSource>}
 */
export async function resolvePlayback(api, { item, userId, audioStreamIndex, mediaSourceId, allowDirectPlay = true }) {
	const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
		itemId: item.Id,
		playbackInfoDto: {
			UserId: userId,
			DeviceProfile: buildDeviceProfile(),
			MediaSourceId: mediaSourceId,
			AudioStreamIndex: audioStreamIndex,
			EnableDirectPlay: allowDirectPlay,
			EnableDirectStream: true,
			EnableTranscoding: true,
			AllowVideoStreamCopy: true,
			AllowAudioStreamCopy: true,
			AutoOpenLiveStream: true,
		},
	});
	if (data.ErrorCode) throw new Error(`Jellyfin cannot play this item (${data.ErrorCode}).`);
	const mediaSource = data.MediaSources?.find((source) => !mediaSourceId || source.Id === mediaSourceId) ?? data.MediaSources?.[0];
	if (!mediaSource) throw new Error('This item has no playable media source.');

	const playSessionId = data.PlaySessionId;
	const common = {
		playSessionId,
		mediaSource,
		audioStreamIndex: audioStreamIndex ?? mediaSource.DefaultAudioStreamIndex ?? undefined,
		subtitles: listSubtitles(api, item, mediaSource),
		audioTracks: listAudioTracks(mediaSource),
	};

	// A browser can't choose among a file's audio tracks: playing a non-default
	// track needs a remux with that track (video is still copied, not re-encoded).
	const wantsOtherAudio = audioStreamIndex != null && audioStreamIndex !== mediaSource.DefaultAudioStreamIndex;
	if (mediaSource.SupportsDirectPlay && wantsOtherAudio && allowDirectPlay) {
		return resolvePlayback(api, { item, userId, audioStreamIndex, mediaSourceId: mediaSource.Id, allowDirectPlay: false });
	}

	if (mediaSource.SupportsDirectPlay && allowDirectPlay) {
		const url = api.getUri(`/Videos/${item.Id}/stream.${mediaSource.Container}`, {
			Static: true,
			mediaSourceId: mediaSource.Id,
			deviceId: api.deviceInfo.id,
			PlaySessionId: playSessionId,
			Tag: mediaSource.ETag,
			api_key: api.accessToken,
		});
		return { ...common, url, isHls: false, playMethod: 'DirectPlay', mode: 'direct', transcodeReasons: [] };
	}

	if (mediaSource.TranscodingUrl) {
		const url = new URL(api.basePath + mediaSource.TranscodingUrl);
		const transcodeReasons = (url.searchParams.get('TranscodeReasons') ?? '').split(',').filter(Boolean);
		const reencodesVideo = transcodeReasons.some((reason) => VIDEO_TRANSCODE_REASONS.has(reason));
		return {
			...common,
			url: url.toString(),
			isHls: mediaSource.TranscodingSubProtocol === 'hls' || url.pathname.endsWith('.m3u8'),
			playMethod: 'Transcode',
			mode: reencodesVideo ? 'transcode' : 'remux',
			transcodeReasons,
		};
	}

	throw new Error('Jellyfin found no way to stream this item to this device.');
}

function streamLabel(stream) {
	return stream.DisplayTitle || stream.Title || stream.Language || `Track ${stream.Index}`;
}

function listAudioTracks(mediaSource) {
	return (mediaSource.MediaStreams ?? [])
		.filter((stream) => stream.Type === 'Audio')
		.map((stream) => ({ index: stream.Index, label: streamLabel(stream), isDefault: stream.IsDefault }));
}

const isPgs = (stream) => /^(pgssub|pgs|hdmv_pgs_subtitle)$/i.test(stream.Codec ?? '');

function listSubtitles(api, item, mediaSource) {
	return (mediaSource.MediaStreams ?? [])
		.filter((stream) => stream.Type === 'Subtitle' && (stream.IsTextSubtitleStream || isPgs(stream)))
		.map((stream) => {
			const kind = stream.IsTextSubtitleStream ? 'text' : 'pgs';
			// DeliveryUrl is set when the profile's External rule applied; build it
			// ourselves otherwise (text converts to WebVTT, PGS is sent as-is).
			const path = stream.DeliveryMethod === 'External' && stream.DeliveryUrl && !stream.IsExternalUrl
				? stream.DeliveryUrl
				: `/Videos/${item.Id}/${mediaSource.Id}/Subtitles/${stream.Index}/0/Stream.${kind === 'text' ? 'vtt' : 'pgssub'}`;
			const url = new URL(stream.IsExternalUrl ? stream.DeliveryUrl : api.basePath + path);
			url.searchParams.set('api_key', api.accessToken);
			return {
				index: stream.Index,
				label: streamLabel(stream),
				language: stream.Language,
				isDefault: stream.IsDefault,
				isForced: stream.IsForced,
				url: url.toString(),
				kind,
			};
		});
}

/**
 * Keeps Jellyfin informed of the playback state, so resume points and
 * "played" status stay in sync with the rest of the library.
 */
export class PlaybackReporter {
	/**
	 * @param {import('@jellyfin/sdk').Api} api
	 * @param {object} item
	 * @param {PlaybackSource} source
	 */
	constructor(api, item, source) {
		this.api = api;
		this.item = item;
		this.source = source;
		this.subtitleStreamIndex = -1;
		this.stopped = false;
	}

	base(state) {
		return {
			ItemId: this.item.Id,
			MediaSourceId: this.source.mediaSource.Id,
			PlaySessionId: this.source.playSessionId,
			PositionTicks: Math.round(state.position * TICKS_PER_SECOND),
		};
	}

	full(state) {
		return {
			...this.base(state),
			AudioStreamIndex: this.source.audioStreamIndex,
			SubtitleStreamIndex: this.subtitleStreamIndex,
			IsPaused: state.paused,
			IsMuted: state.muted,
			VolumeLevel: Math.round(state.volume * 100),
			PlayMethod: this.source.playMethod,
			CanSeek: true,
		};
	}

	async start(state) {
		await getSessionApi(this.api).reportPlaybackStart({ playbackStartInfo: this.full(state) });
	}

	async progress(state, eventName = 'TimeUpdate') {
		if (this.stopped) return;
		await getSessionApi(this.api).reportPlaybackProgress({
			playbackProgressInfo: { ...this.full(state), EventName: eventName },
		});
	}

	async stop(state) {
		if (this.stopped) return;
		this.stopped = true;
		await getSessionApi(this.api).reportPlaybackStopped({ playbackStopInfo: this.base(state) });
		if (this.source.isHls) {
			// Free the server immediately instead of waiting for the job to time out.
			await this.api.axiosInstance.delete(`${this.api.basePath}/Videos/ActiveEncodings`, {
				params: { deviceId: this.api.deviceInfo.id, playSessionId: this.source.playSessionId },
				headers: { Authorization: this.api.authorizationHeader },
			});
		}
	}

	/** Best effort stop report while the page is being closed. */
	stopOnUnload(state) {
		if (this.stopped) return;
		this.stopped = true;
		fetch(`${this.api.basePath}/Sessions/Playing/Stopped`, {
			method: 'POST',
			keepalive: true,
			headers: { 'Content-Type': 'application/json', Authorization: this.api.authorizationHeader },
			body: JSON.stringify(this.base(state)),
		}).catch(() => {});
	}
}
