// Lap-height control panel: title, clock and end time, seek bar, transport
// buttons, track menus (with the subtitle timing). Bound to a Player with
// `bind(player)`. Emits `stop-request` and `activity`.

import * as THREE from 'three';
import { describeItem } from '../jellyfin/library.js';
import { getSetting, setSetting, SETTING_DEFINITIONS } from '../settings.js';
import { truncate } from './text.js';
import { COLORS, entity, loadTexture, setInteractiveVisible, whenLoaded } from './widgets.js';

const PREVIEW_WIDTH = 0.2;

const WIDTH = 0.82;
const HEIGHT = 0.25;
const BAR_WIDTH = 0.52;
const BUTTON_SIZE = 0.068;
const MENU_ROWS = 8;

const MODE_LABELS = {
	direct: { text: 'Direct play', color: '#7bd88f' },
	remux: { text: 'Remux (no video transcode)', color: '#e6c76e' },
	transcode: { text: 'Transcoding', color: '#ff6b7a' },
};

export function formatTime(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
	const s = Math.floor(seconds % 60).toString().padStart(2, '0');
	const m = Math.floor((seconds / 60) % 60);
	const h = Math.floor(seconds / 3600);
	return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Time of day, as the headset's locale writes it ("21:14", "9:14 PM"). */
function formatClock(date) {
	const options = getSetting('clockFormat') === '12h'
		? { hour: 'numeric', minute: '2-digit', hour12: true }
		: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
	return date.toLocaleTimeString([], options);
}

const SUBTITLE_OFFSET = SETTING_DEFINITIONS.find((setting) => setting.name === 'subtitleOffset');

AFRAME.registerComponent('player-controls', {
	init() {
		this.player = null;
		this.visible = false;
		this.menu = null;
		const top = HEIGHT / 2;
		const left = -WIDTH / 2 + 0.035;
		const right = WIDTH / 2 - 0.035;

		// The background is a pointing target too, so the panel can be grabbed.
		this.background = entity({ 'ui-rect': `width: ${WIDTH}; height: ${HEIGHT}; radius: 0.025; opacity: 0.94` });
		this.background.dataset.interactive = '';
		// Grab handle: a hint that the panel can be moved (hold grip).
		this.handle = entity({ position: `0 ${top - 0.012} 0.002`, 'ui-rect': `width: 0.1; height: 0.008; radius: 0.004; color: ${COLORS.muted}` });
		this.title = entity({ position: `${left} ${top - 0.04} 0.002`, 'ui-text': `fontSize: 0.026; weight: bold; anchorX: left; maxWidth: ${WIDTH * 0.62}` });
		this.subtitle = entity({ position: `${left} ${top - 0.073} 0.002`, 'ui-text': `fontSize: 0.018; color: ${COLORS.muted}; anchorX: left` });
		this.mode = entity({ position: `${right} ${top - 0.04} 0.002`, 'ui-text': 'fontSize: 0.016; anchorX: right' });
		this.tooltip = entity({ position: `${right} ${top - 0.073} 0.002`, 'ui-text': `fontSize: 0.018; color: ${COLORS.accent2}; anchorX: right` });
		// Clock and end time, in the tooltip's place while no tooltip shows.
		this.clock = entity({ position: `${right} ${top - 0.073} 0.002`, 'ui-text': `fontSize: 0.018; color: ${COLORS.muted}; anchorX: right` });
		this.lastClock = 0;

		const barY = top - 0.115;
		this.current = entity({ position: `${-BAR_WIDTH / 2 - 0.015} ${barY} 0.002`, 'ui-text': 'fontSize: 0.017; anchorX: right' });
		this.total = entity({ position: `${BAR_WIDTH / 2 + 0.015} ${barY} 0.002`, 'ui-text': 'fontSize: 0.017; anchorX: left' });
		this.bar = entity({ position: `0 ${barY} 0.002`, 'ui-progress': `width: ${BAR_WIDTH}; height: 0.01; interactive: true` });
		this.barY = barY;
		// Chapter ticks on the bar, and a preview while pointing at it.
		this.ticks = entity({ position: `0 ${barY} 0.004` });
		this.preview = entity({ position: `0 ${barY + 0.09} 0.03` });
		this.previewImage = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
		this.previewImage.visible = false;
		this.preview.object3D.add(this.previewImage);
		this.previewLabel = entity({ 'ui-text': 'fontSize: 0.017; anchorY: top; align: center' });
		this.previewBackground = entity({ position: '0 0 -0.002', 'ui-rect': `width: ${PREVIEW_WIDTH + 0.02}; height: 0.05; radius: 0.012; color: #000000; opacity: 0.8` });
		this.preview.append(this.previewBackground, this.previewLabel);
		this.preview.object3D.visible = false;
		this.chapters = [];
		this.trickplay = null;
		this.pointers = new Set();
		this.bar.addEventListener('raycaster-intersected', (event) => this.pointers.add(event.detail.el));
		this.bar.addEventListener('raycaster-intersected-cleared', (event) => this.pointers.delete(event.detail.el));
		this.bar.addEventListener('seek', (event) => {
			this.player?.seek(event.detail.fraction * this.player.duration);
			this.activity();
		});

		const buttons = [
			['back', { icon: 'rewind', tooltip: 'Back 10 seconds' }, () => this.player?.seekBy(-10)],
			['play', { icon: 'pause', tooltip: 'Play / pause' }, () => this.player?.togglePlay()],
			['forward', { icon: 'forward', tooltip: 'Forward 30 seconds' }, () => this.player?.seekBy(30)],
			['audio', { icon: 'audio', tooltip: 'Audio track' }, () => this.toggleMenu('audio')],
			['subs', { icon: 'subtitles', tooltip: 'Subtitles' }, () => this.toggleMenu('subtitles')],
			['voldown', { icon: 'volumeDown', tooltip: 'Volume down' }, () => this.changeVolume(-0.1)],
			['volup', { icon: 'volumeUp', tooltip: 'Volume up' }, () => this.changeVolume(0.1)],
			['stop', { icon: 'stop', tooltip: 'Stop' }, () => this.el.emit('stop-request')],
			['settings', { icon: 'settings', tooltip: 'Settings' }, () => this.el.emit('settings-request')],
		];
		const gap = 0.012;
		const rowWidth = buttons.length * BUTTON_SIZE + (buttons.length - 1) * gap;
		this.buttons = {};
		this.buttonRow = entity({ position: `0 ${-top + 0.012 + BUTTON_SIZE / 2} 0.002` });
		buttons.forEach(([name, options, action], i) => {
			const button = entity({
				position: `${-rowWidth / 2 + BUTTON_SIZE / 2 + i * (BUTTON_SIZE + gap)} 0 0`,
				'ui-button': { ...options, width: BUTTON_SIZE, height: BUTTON_SIZE },
			});
			button.addEventListener('click', () => {
				action();
				this.activity();
			});
			this.buttons[name] = button;
			this.buttonRow.appendChild(button);
		});

		this.menuEl = entity({ position: `0 ${top + 0.02} 0` });

		this.el.append(this.background, this.handle, this.title, this.subtitle, this.mode, this.tooltip, this.clock,
			this.current, this.total, this.bar, this.ticks, this.preview, this.buttonRow, this.menuEl);
		// Pointing at the panel counts as activity (keeps it from auto-hiding).
		this.el.addEventListener('mouseenter', () => this.activity());
		this.el.addEventListener('tooltip', (event) => this.showTooltip(event.detail.text));
		setInteractiveVisible(this.el, false);
	},

	/** @param {import('../player/player.js').Player} player */
	bind(player) {
		this.player = player;
		player.addEventListener('statechange', () => this.refresh());
		player.addEventListener('timeupdate', () => this.refreshTime());
		player.addEventListener('details', ({ detail }) => this.setDetails(detail));
	},

	/** Chapters (ticks on the bar) and trickplay thumbnails (preview). */
	setDetails({ chapters, trickplay }) {
		this.chapters = chapters;
		this.trickplay = trickplay;
		this.ticks.replaceChildren();
		const duration = this.player?.duration;
		if (!duration) return;
		for (const chapter of chapters) {
			if (chapter.start <= 0.5) continue;
			const x = (chapter.start / duration - 0.5) * BAR_WIDTH;
			this.ticks.appendChild(entity({ position: `${x} 0 0`, 'ui-rect': `width: 0.003; height: 0.022; radius: 0.001; color: ${COLORS.text}` }));
		}
	},

	chapterAt(time) {
		let current = null;
		for (const chapter of this.chapters) {
			if (chapter.start <= time) current = chapter;
		}
		return current;
	},

	/** Seek bar preview while a pointer is on the bar; the clock. */
	tick(now) {
		const player = this.player;
		// The clock and end time move even while paused.
		if (this.visible && now - this.lastClock > 1000) {
			this.lastClock = now;
			this.refreshClock();
		}
		let fraction = null;
		if (this.visible && player?.isActive) {
			for (const pointer of this.pointers) {
				const hit = pointer.components.raycaster?.getIntersection(this.bar);
				if (!hit) continue;
				const local = this.bar.object3D.worldToLocal(hit.point.clone());
				fraction = THREE.MathUtils.clamp(local.x / BAR_WIDTH + 0.5, 0, 1);
				break;
			}
		}
		this.preview.object3D.visible = fraction !== null;
		if (fraction === null) return;

		const time = fraction * player.duration;
		const x = THREE.MathUtils.clamp((fraction - 0.5) * BAR_WIDTH, -WIDTH / 2 + PREVIEW_WIDTH / 2 + 0.02, WIDTH / 2 - PREVIEW_WIDTH / 2 - 0.02);
		this.preview.object3D.position.x = x;
		const chapter = this.chapterAt(time);
		const label = chapter?.name ? `${formatTime(time)} · ${truncate(chapter.name, 26)}` : formatTime(time);
		const tp = this.trickplay;
		let imageHeight = 0;
		if (tp) {
			imageHeight = PREVIEW_WIDTH * (tp.height / tp.width);
			const index = Math.min(tp.count - 1, Math.floor(time / tp.interval));
			const perTile = tp.columns * tp.rows;
			const tile = Math.floor(index / perTile);
			const within = index % perTile;
			const url = tp.tileUrl(tile);
			if (this.previewUrl !== url) {
				this.previewUrl = url;
				loadTexture(url).then((texture) => {
					if (this.previewUrl !== url) return;
					texture.repeat.set(1 / tp.columns, 1 / tp.rows);
					this.previewImage.material.map = texture;
					this.previewImage.material.needsUpdate = true;
				}).catch(() => {});
			}
			const map = this.previewImage.material.map;
			if (map) map.offset.set((within % tp.columns) / tp.columns, 1 - (Math.floor(within / tp.columns) + 1) / tp.rows);
			this.previewImage.scale.set(PREVIEW_WIDTH, imageHeight, 1);
			this.previewImage.position.set(0, imageHeight / 2 + 0.01, 0);
		}
		this.previewImage.visible = Boolean(tp && this.previewImage.material.map);
		this.previewLabel.setAttribute('ui-text', 'value', label);
		this.previewLabel.object3D.position.set(0, 0.002, 0.001);
		const backgroundHeight = imageHeight + 0.05;
		this.previewBackground.setAttribute('ui-rect', 'height', backgroundHeight);
		this.previewBackground.object3D.position.y = backgroundHeight / 2 - 0.035;
	},

	changeVolume(delta) {
		if (!this.player) return;
		this.player.setVolume(this.player.volume + delta);
		this.showTooltip(`Volume ${Math.round(this.player.volume * 100)} %`);
	},

	showTooltip(text) {
		this.tooltip.setAttribute('ui-text', 'value', text);
		this.clock.object3D.visible = !text;
	},

	/** "21:14 · Ends at 22:41" (the end time at normal speed, from now). */
	refreshClock() {
		const player = this.player;
		if (!player || !this.visible) return;
		const now = new Date();
		const remaining = Math.max(0, player.duration - (player.video.currentTime || 0));
		const ends = player.duration ? ` · Ends at ${formatClock(new Date(now.getTime() + remaining * 1000))}` : '';
		this.clock.setAttribute('ui-text', 'value', `${formatClock(now)}${ends}`);
	},

	activity() {
		this.el.emit('activity');
	},

	setVisible(visible) {
		if (visible === this.visible) return;
		this.visible = visible;
		if (!visible) {
			this.closeMenu();
			this.showTooltip('');
		}
		setInteractiveVisible(this.el, visible);
		if (visible) this.refresh();
	},

	refresh() {
		const player = this.player;
		if (!player || !this.visible) return;
		const item = player.item;
		const { title, subtitle } = item ? describeItem(item) : { title: '', subtitle: '' };
		this.title.setAttribute('ui-text', 'value', truncate(title, 42));
		this.subtitle.setAttribute('ui-text', 'value', truncate(subtitle, 60));
		const mode = player.loading ? { text: 'Loading…', color: COLORS.muted } : MODE_LABELS[player.source?.mode];
		// What the sound actually carries (a browser may downmix before us).
		const sound = !player.loading && player.soundLayout ? ` · ${player.soundLayout} sound` : '';
		this.mode.setAttribute('ui-text', { value: (mode?.text ?? '') + sound, color: mode?.color ?? COLORS.muted });
		whenLoaded(this.buttons.play, () => {
			this.buttons.play.setAttribute('ui-button', 'icon', player.video.paused ? 'play' : 'pause');
			this.buttons.audio.setAttribute('ui-button', 'disabled', (player.source?.audioTracks.length ?? 0) < 2);
			this.buttons.subs.setAttribute('ui-button', {
				disabled: !player.source?.subtitles.length,
				active: player.subtitleIndex >= 0,
			});
		});
		this.refreshTime();
		if (this.menu) this.renderMenu();
	},

	refreshTime() {
		const player = this.player;
		if (!player || !this.visible) return;
		const position = player.video.currentTime || 0;
		const duration = player.duration;
		this.current.setAttribute('ui-text', 'value', formatTime(position));
		this.total.setAttribute('ui-text', 'value', formatTime(duration));
		this.bar.setAttribute('ui-progress', 'value', duration ? position / duration : 0);
		this.refreshClock();
	},

	toggleMenu(kind) {
		if (this.menu === kind) this.closeMenu();
		else {
			this.menu = kind;
			this.renderMenu();
		}
	},

	closeMenu() {
		this.menu = null;
		this.menuEl.replaceChildren();
	},

	renderMenu() {
		const source = this.player?.source;
		if (!source) return this.closeMenu();
		let options;
		if (this.menu === 'audio') {
			options = source.audioTracks.map((track) => ({
				label: track.label,
				active: track.index === source.audioStreamIndex,
				select: () => this.player.selectAudio(track.index),
			}));
		} else {
			options = [
				{ label: 'Off', active: this.player.subtitleIndex < 0, select: () => this.player.selectSubtitle(-1) },
				...source.subtitles.map((track) => ({
					label: track.label,
					active: track.index === this.player.subtitleIndex,
					select: () => this.player.selectSubtitle(track.index),
				})),
				{ label: 'Subtitle settings…', active: false, select: () => this.el.emit('settings-request', { category: 'subtitles' }) },
			];
		}
		options = options.slice(0, MENU_ROWS);
		const rowH = 0.05;
		const width = 0.56;
		// Subtitles: a timing row under the tracks, which keeps the menu open.
		const timing = this.menu === 'subtitles';
		const height = (options.length + (timing ? 1 : 0)) * rowH + 0.03;
		this.menuEl.replaceChildren(entity({ position: `0 ${height / 2} 0.01`, 'ui-rect': `width: ${width}; height: ${height}; radius: 0.02` }));
		if (timing) this.menuEl.appendChild(this.timingRow(width, 0.015 + rowH / 2, rowH - 0.007));
		options.forEach((option, i) => {
			const row = entity({
				position: `0 ${height - 0.015 - rowH / 2 - i * rowH} 0.012`,
				'ui-button': { label: truncate(option.label, 40), width: width - 0.024, height: rowH - 0.007, fontSize: 0.019, active: option.active },
			});
			row.addEventListener('click', () => {
				option.select();
				this.closeMenu();
				this.activity();
			});
			this.menuEl.appendChild(row);
		});
		setInteractiveVisible(this.menuEl, this.visible);
	},

	/** "Timing  [−1 s] [−0.1]  +0.3 s  [+0.1] [+1 s]": the subtitle offset. */
	timingRow(width, y, height) {
		const row = entity({ position: `0 ${y} 0.012` });
		const offset = getSetting('subtitleOffset');
		const label = entity({ position: `${-width / 2 + 0.025} 0 0`, 'ui-text': { value: 'Timing', fontSize: 0.019, anchorX: 'left' } });
		const value = entity({ position: '0.065 0 0', 'ui-text': { value: SUBTITLE_OFFSET.format(offset), fontSize: 0.019, align: 'center', anchorX: 'center' } });
		row.append(label, value);
		const stepW = 0.07;
		[[-1, '−1 s', -0.1], [-0.1, '−0.1', -0.025], [0.1, '+0.1', 0.155], [1, '+1 s', 0.23]].forEach(([step, text, x]) => {
			const button = entity({ position: `${x} 0 0`, 'ui-button': { label: text, width: stepW, height, fontSize: 0.017 } });
			button.addEventListener('click', () => {
				const next = THREE.MathUtils.clamp(getSetting('subtitleOffset') + step, SUBTITLE_OFFSET.min, SUBTITLE_OFFSET.max);
				// Rounded to avoid floating point noise (0.30000000000000004).
				setSetting('subtitleOffset', Math.round(next * 10) / 10);
				value.setAttribute('ui-text', 'value', SUBTITLE_OFFSET.format(getSetting('subtitleOffset')));
				this.activity();
			});
			row.appendChild(button);
		});
		return row;
	},
});
