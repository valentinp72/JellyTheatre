// On-screen keyboard for typing in VR (the system keyboard isn't available
// inside an immersive session). Emits `key` { key } where key is a character,
// 'Backspace' or 'Clear'. Shift toggles capitals; "?123" shows the symbols
// (server addresses and passwords need them). Keys click softly and flash a
// muted color when pressed.

import { playClick } from './click-sound.js';
import { entity, setInteractiveVisible } from './widgets.js';

const LAYOUTS = {
	letters: ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm-.'],
	symbols: ['1234567890', '@#$%&*+=/\\', '!?:;_~^`|"', '()[]{}<>,'],
};
// A little lighter than the hover color: visible, not flashy.
const PRESS_COLOR = '#5d4b74';
const KEY = 0.072;
const GAP = 0.01;

AFRAME.registerComponent('ui-keyboard', {
	init() {
		const pitch = KEY + GAP;
		const width = 10 * pitch + 0.04;
		const rows = LAYOUTS.letters.length;
		const height = (rows + 1) * pitch + 0.04;
		this.layout = 'letters';
		this.shift = false;
		this.el.appendChild(entity({ 'ui-rect': `width: ${width}; height: ${height}; radius: 0.025; opacity: 0.94` }));

		const top = height / 2 - 0.02 - KEY / 2;
		const addKey = (x, y, w, onClick) => {
			const button = entity({
				position: `${x} ${y} 0.002`,
				'ui-button': { width: w, height: KEY, fontSize: 0.03, pressColor: PRESS_COLOR },
			});
			button.addEventListener('click', () => {
				playClick();
				onClick();
			});
			this.el.appendChild(button);
			return button;
		};

		// Character keys: their character depends on the layout and Shift.
		// Same shape for both layouts (rows of 10, 10, 10, 9 keys).
		this.keys = [];
		for (let r = 0; r < rows; r++) {
			const count = LAYOUTS.letters[r].length;
			const rowWidth = count * pitch - GAP;
			for (let i = 0; i < count; i++) {
				const key = addKey(-rowWidth / 2 + KEY / 2 + i * pitch, top - r * pitch, KEY, () => this.el.emit('key', { key: this.charAt(r, i) }));
				this.keys.push({ el: key, r, i });
			}
		}

		// Bottom row: Shift, symbols, space, clear, delete.
		const y = top - rows * pitch;
		const widths = [0.13, 0.13, 0.24, 0.13, 0.15];
		const inner = widths.reduce((a, b) => a + b) + GAP * (widths.length - 1);
		let x = -inner / 2;
		const next = (w) => {
			const center = x + w / 2;
			x += w + GAP;
			return center;
		};
		this.shiftKey = addKey(next(widths[0]), y, widths[0], () => {
			this.shift = !this.shift;
			this.refresh();
		});
		this.layoutKey = addKey(next(widths[1]), y, widths[1], () => {
			this.layout = this.layout === 'letters' ? 'symbols' : 'letters';
			this.refresh();
		});
		addKey(next(widths[2]), y, widths[2], () => this.el.emit('key', { key: ' ' })).setAttribute('ui-button', 'label', 'Space');
		addKey(next(widths[3]), y, widths[3], () => this.el.emit('key', { key: 'Clear' })).setAttribute('ui-button', 'label', 'Clear');
		addKey(next(widths[4]), y, widths[4], () => this.el.emit('key', { key: 'Backspace' })).setAttribute('ui-button', 'label', 'Delete');

		this.refresh();
		setInteractiveVisible(this.el, false);
	},

	charAt(row, index) {
		const char = LAYOUTS[this.layout][row][index];
		return this.shift && this.layout === 'letters' ? char.toUpperCase() : char;
	},

	refresh() {
		for (const { el, r, i } of this.keys) {
			const char = this.charAt(r, i);
			el.setAttribute('ui-button', 'label', this.layout === 'letters' ? char.toUpperCase() : char);
		}
		// Labels are always capitals: the Shift key's highlight tells the case.
		this.shiftKey.setAttribute('ui-button', { label: 'Shift', active: this.shift, disabled: this.layout !== 'letters' });
		this.layoutKey.setAttribute('ui-button', 'label', this.layout === 'letters' ? '?123' : 'ABC');
	},

	setVisible(visible) {
		setInteractiveVisible(this.el, visible);
	},
});
