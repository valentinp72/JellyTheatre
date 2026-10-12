// On-screen keyboard for typing in VR (the system keyboard isn't available
// inside an immersive session). Emits `key` { key } where key is a character,
// 'Backspace' or 'Clear'.

import { entity, setInteractiveVisible } from './widgets.js';

const ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm-.'];
const KEY = 0.072;
const GAP = 0.01;

AFRAME.registerComponent('ui-keyboard', {
	init() {
		const pitch = KEY + GAP;
		const width = 10 * pitch + 0.04;
		const height = (ROWS.length + 1) * pitch + 0.04;
		this.el.appendChild(entity({ 'ui-rect': `width: ${width}; height: ${height}; radius: 0.025; opacity: 0.94` }));

		const top = height / 2 - 0.02 - KEY / 2;
		const addKey = (label, key, x, y, w = KEY) => {
			const button = entity({
				position: `${x} ${y} 0.002`,
				'ui-button': { label, width: w, height: KEY, fontSize: 0.03 },
			});
			button.addEventListener('click', () => this.el.emit('key', { key }));
			this.el.appendChild(button);
		};

		ROWS.forEach((row, r) => {
			const rowWidth = row.length * pitch - GAP;
			[...row].forEach((char, i) => {
				addKey(char.toUpperCase(), char, -rowWidth / 2 + KEY / 2 + i * pitch, top - r * pitch);
			});
		});
		const y = top - ROWS.length * pitch;
		addKey('Clear', 'Clear', -width / 2 + 0.02 + 0.09, y, 0.18);
		addKey('Space', ' ', 0, y, 0.4);
		addKey('Delete', 'Backspace', width / 2 - 0.02 - 0.09, y, 0.18);
		setInteractiveVisible(this.el, false);
	},

	setVisible(visible) {
		setInteractiveVisible(this.el, visible);
	},
});
