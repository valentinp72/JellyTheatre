// Lap-height control panel: title, seek bar, transport buttons, track menus.
// Bound to a Player with `bind(player)`. Emits `stop-request` and `activity`.

import { describeItem } from '../jellyfin/library.js';
import { truncate } from './text.js';
import { COLORS, entity, setInteractiveVisible, whenLoaded } from './widgets.js';

const WIDTH = 1.1;
const HEIGHT = 0.36;
const BAR_WIDTH = 0.74;
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

AFRAME.registerComponent('player-controls', {
	init() {
		this.player = null;
		this.visible = false;
		this.menu = null;
		const top = HEIGHT / 2;
		const left = -WIDTH / 2 + 0.05;

		this.background = entity({ 'ui-rect': `width: ${WIDTH}; height: ${HEIGHT}; radius: 0.03; opacity: 0.94` });
		this.title = entity({ position: `${left} ${top - 0.05} 0.002`, 'ui-text': 'fontSize: 0.036; weight: bold; anchorX: left' });
		this.subtitle = entity({ position: `${left} ${top - 0.095} 0.002`, 'ui-text': `fontSize: 0.024; color: ${COLORS.muted}; anchorX: left` });
		this.mode = entity({ position: `${WIDTH / 2 - 0.05} ${top - 0.05} 0.002`, 'ui-text': 'fontSize: 0.02; anchorX: right' });

		const barY = top - 0.16;
		this.current = entity({ position: `${-BAR_WIDTH / 2 - 0.02} ${barY} 0.002`, 'ui-text': 'fontSize: 0.022; anchorX: right' });
		this.total = entity({ position: `${BAR_WIDTH / 2 + 0.02} ${barY} 0.002`, 'ui-text': 'fontSize: 0.022; anchorX: left' });
		this.bar = entity({ position: `0 ${barY} 0.002`, 'ui-progress': `width: ${BAR_WIDTH}; height: 0.014; interactive: true` });
		this.bar.addEventListener('seek', (event) => {
			this.player?.seek(event.detail.fraction * this.player.duration);
			this.activity();
		});

		const buttons = [
			['back', '−10 s', () => this.player?.seekBy(-10)],
			['play', 'Pause', () => this.player?.togglePlay()],
			['forward', '+30 s', () => this.player?.seekBy(30)],
			['audio', 'Audio', () => this.toggleMenu('audio')],
			['subs', 'Subtitles', () => this.toggleMenu('subtitles')],
			['voldown', 'Vol −', () => this.player?.setVolume(this.player.video.volume - 0.1)],
			['volup', 'Vol +', () => this.player?.setVolume(this.player.video.volume + 0.1)],
			['stop', 'Stop', () => this.el.emit('stop-request')],
		];
		const buttonW = 0.118;
		const gap = 0.012;
		const rowWidth = buttons.length * buttonW + (buttons.length - 1) * gap;
		this.buttons = {};
		this.buttonRow = entity({ position: `0 ${-top + 0.065} 0.002` });
		buttons.forEach(([name, label, action], i) => {
			const button = entity({
				position: `${-rowWidth / 2 + buttonW / 2 + i * (buttonW + gap)} 0 0`,
				'ui-button': { label, width: buttonW, height: 0.07, fontSize: 0.024 },
			});
			button.addEventListener('click', () => {
				action();
				this.activity();
			});
			this.buttons[name] = button;
			this.buttonRow.appendChild(button);
		});

		this.menuEl = entity({ position: `0 ${top + 0.03} 0` });

		this.el.append(this.background, this.title, this.subtitle, this.mode, this.current, this.total, this.bar, this.buttonRow, this.menuEl);
		// Pointing at the panel counts as activity (keeps it from auto-hiding).
		this.el.addEventListener('mouseenter', () => this.activity());
		setInteractiveVisible(this.el, false);
	},

	/** @param {import('../player/player.js').Player} player */
	bind(player) {
		this.player = player;
		player.addEventListener('statechange', () => this.refresh());
		player.addEventListener('timeupdate', () => this.refreshTime());
	},

	activity() {
		this.el.emit('activity');
	},

	setVisible(visible) {
		if (visible === this.visible) return;
		this.visible = visible;
		if (!visible) this.closeMenu();
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
		this.mode.setAttribute('ui-text', { value: mode?.text ?? '', color: mode?.color ?? COLORS.muted });
		whenLoaded(this.buttons.play, () => {
			this.buttons.play.setAttribute('ui-button', 'label', player.video.paused ? 'Play' : 'Pause');
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
			];
		}
		options = options.slice(0, MENU_ROWS);
		const rowH = 0.065;
		const width = 0.7;
		const height = options.length * rowH + 0.03;
		this.menuEl.replaceChildren(entity({ position: `0 ${height / 2} 0.01`, 'ui-rect': `width: ${width}; height: ${height}; radius: 0.02` }));
		options.forEach((option, i) => {
			const row = entity({
				position: `0 ${height - 0.015 - rowH / 2 - i * rowH} 0.012`,
				'ui-button': { label: truncate(option.label, 40), width: width - 0.03, height: rowH - 0.008, fontSize: 0.024, active: option.active },
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
});
