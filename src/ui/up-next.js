// "Up next" prompt shown at the end of an episode (or when its credits start).
// With auto-play on, it counts down then emits `play-next`; one click on
// Cancel (or "Turn off auto-play") stops it. With auto-play off, it only offers
// the next episode.
//
// Events: `play-next` { item }, `dismiss`, `autoplay-change` { enabled }.

import { episodeNumber } from '../jellyfin/library.js';
import { truncate } from './text.js';
import { COLORS, entity, setInteractiveVisible, whenLoaded } from './widgets.js';

const WIDTH = 1.1;
const HEIGHT = 0.42;
const COUNTDOWN_SECONDS = 10;

AFRAME.registerComponent('up-next', {
	init() {
		this.item = null;
		this.timer = null;
		this.remaining = 0;
		this.autoplay = false;

		const posterW = 0.22;
		const posterH = 0.33;
		const left = -WIDTH / 2 + 0.04;
		const x = left + posterW + 0.05;
		this.el.append(entity({ 'ui-rect': `width: ${WIDTH}; height: ${HEIGHT}; radius: 0.03; opacity: 0.96` }));
		this.poster = entity({ position: `${left + posterW / 2} 0 0.002`, 'ui-poster': { width: posterW, height: posterH, captions: false, hover: false } });
		this.label = entity({ position: `${x} 0.16 0.002`, 'ui-text': `value: Up next; fontSize: 0.026; color: ${COLORS.muted}; anchorX: left` });
		this.title = entity({ position: `${x} 0.11 0.002`, 'ui-text': `fontSize: 0.036; weight: bold; anchorX: left; maxWidth: ${WIDTH / 2 - x - 0.03}` });
		this.status = entity({ position: `${x} 0.0 0.002`, 'ui-text': `fontSize: 0.03; anchorX: left; color: ${COLORS.accent2}` });
		this.el.append(this.poster, this.label, this.title, this.status);

		const y = -0.12;
		this.primary = this.button('Play now', 0.22, x + 0.11, y, () => this.playNow());
		this.secondary = this.button('Cancel', 0.2, x + 0.22 + 0.02 + 0.1, y, () => this.dismiss());
		this.toggle = this.button('Turn off auto-play', 0.3, x + 0.44 + 0.04 + 0.15, y, () => {
			this.autoplay = !this.autoplay;
			this.el.emit('autoplay-change', { enabled: this.autoplay });
			this.render();
		});
		this.setVisible(false);
	},

	button(label, width, x, y, onClick) {
		const el = entity({ position: `${x} ${y} 0.002`, 'ui-button': { label, width, height: 0.07, fontSize: 0.026 } });
		el.addEventListener('click', onClick);
		this.el.appendChild(el);
		return el;
	},

	// A method, not a getter: A-Frame copies component definitions property by
	// property, which would evaluate a getter once at registration.
	isOpen() {
		return this.item !== null;
	},

	/**
	 * @param {import('@jellyfin/sdk').Api} api
	 * @param {object} item the next episode
	 * @param {boolean} autoplay
	 */
	offer(api, item, autoplay) {
		this.item = item;
		this.autoplay = autoplay;
		this.remaining = COUNTDOWN_SECONDS;
		whenLoaded(this.poster, () => this.poster.components['ui-poster'].setItem(api, item));
		const number = episodeNumber(item);
		this.title.setAttribute('ui-text', 'value', truncate(number ? `${number} · ${item.Name}` : item.Name, 60));
		clearInterval(this.timer);
		this.timer = setInterval(() => {
			if (!this.autoplay) return;
			this.remaining--;
			if (this.remaining <= 0) this.playNow();
			else this.render();
		}, 1000);
		this.setVisible(true);
		this.render();
	},

	render() {
		if (!this.item) return;
		this.status.setAttribute('ui-text', 'value', this.autoplay ? `Playing in ${this.remaining} s` : '');
		this.primary.setAttribute('ui-button', 'label', this.autoplay ? 'Play now' : 'Play next');
		this.secondary.setAttribute('ui-button', 'label', this.autoplay ? 'Cancel' : 'Not now');
		this.toggle.setAttribute('ui-button', 'label', this.autoplay ? 'Turn off auto-play' : 'Turn on auto-play');
	},

	playNow() {
		const item = this.item;
		this.close();
		if (item) this.el.emit('play-next', { item });
	},

	dismiss() {
		this.close();
		this.el.emit('dismiss');
	},

	close() {
		clearInterval(this.timer);
		this.timer = null;
		this.item = null;
		this.setVisible(false);
	},

	setVisible(visible) {
		setInteractiveVisible(this.el, visible);
	},

	remove() {
		clearInterval(this.timer);
	},
});
