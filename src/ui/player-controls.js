// Lap-height control panel: title, seek bar, transport buttons, track menus.
// Bound to a Player with `bind(player)`. Emits `stop-request` and `activity`.

import { describeItem } from '../jellyfin/library.js';
import { truncate } from './text.js';
import { COLORS, entity, setInteractiveVisible, whenLoaded } from './widgets.js';

const WIDTH = 0.74;
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

		const barY = top - 0.115;
		this.current = entity({ position: `${-BAR_WIDTH / 2 - 0.015} ${barY} 0.002`, 'ui-text': 'fontSize: 0.017; anchorX: right' });
		this.total = entity({ position: `${BAR_WIDTH / 2 + 0.015} ${barY} 0.002`, 'ui-text': 'fontSize: 0.017; anchorX: left' });
		this.bar = entity({ position: `0 ${barY} 0.002`, 'ui-progress': `width: ${BAR_WIDTH}; height: 0.01; interactive: true` });
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

		this.el.append(this.background, this.handle, this.title, this.subtitle, this.mode, this.tooltip,
			this.current, this.total, this.bar, this.buttonRow, this.menuEl);
		// Pointing at the panel counts as activity (keeps it from auto-hiding).
		this.el.addEventListener('mouseenter', () => this.activity());
		this.el.addEventListener('tooltip', (event) => this.tooltip.setAttribute('ui-text', 'value', event.detail.text));
		setInteractiveVisible(this.el, false);
	},

	/** @param {import('../player/player.js').Player} player */
	bind(player) {
		this.player = player;
		player.addEventListener('statechange', () => this.refresh());
		player.addEventListener('timeupdate', () => this.refreshTime());
	},

	changeVolume(delta) {
		if (!this.player) return;
		this.player.setVolume(this.player.volume + delta);
		this.tooltip.setAttribute('ui-text', 'value', `Volume ${Math.round(this.player.volume * 100)} %`);
	},

	activity() {
		this.el.emit('activity');
	},

	setVisible(visible) {
		if (visible === this.visible) return;
		this.visible = visible;
		if (!visible) {
			this.closeMenu();
			this.tooltip.setAttribute('ui-text', 'value', '');
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
		this.mode.setAttribute('ui-text', { value: mode?.text ?? '', color: mode?.color ?? COLORS.muted });
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
		const rowH = 0.05;
		const width = 0.56;
		const height = options.length * rowH + 0.03;
		this.menuEl.replaceChildren(entity({ position: `0 ${height / 2} 0.01`, 'ui-rect': `width: ${width}; height: ${height}; radius: 0.02` }));
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
});
