// Controller and keyboard shortcuts. Placed on the scene; re-emits intents as
// scene events handled by main.js:
// - `player-command` { command: 'toggle' | 'seek', delta? }
// - `toggle-controls`
//
// Quest controllers: A/X play/pause, B/Y show/hide controls, thumbstick
// left/right seeks −10 s / +30 s. Keyboard: space, ←/→, c.

const STICK_THRESHOLD = 0.75;
const STICK_RELEASE = 0.3;

AFRAME.registerComponent('player-input', {
	schema: {
		hands: { type: 'selectorAll', default: '[laser-controls]' },
	},

	init() {
		this.stickLatched = new Map();
		this.onKeyDown = this.onKeyDown.bind(this);
		window.addEventListener('keydown', this.onKeyDown);

		for (const hand of this.data.hands) {
			for (const name of ['abuttondown', 'xbuttondown']) {
				hand.addEventListener(name, () => this.command('toggle'));
			}
			for (const name of ['bbuttondown', 'ybuttondown']) {
				hand.addEventListener(name, () => this.el.emit('toggle-controls'));
			}
			hand.addEventListener('thumbstickmoved', (event) => this.onStick(hand, event.detail));
		}
	},

	command(command, delta) {
		this.el.emit('player-command', { command, delta });
	},

	onStick(hand, { x }) {
		const latched = this.stickLatched.get(hand);
		if (latched && Math.abs(x) < STICK_RELEASE) {
			this.stickLatched.set(hand, false);
		} else if (!latched && Math.abs(x) > STICK_THRESHOLD) {
			this.stickLatched.set(hand, true);
			this.command('seek', x > 0 ? 30 : -10);
		}
	},

	onKeyDown(event) {
		if (event.target instanceof HTMLInputElement) return;
		if (!document.getElementById('lobby')?.hidden) return;
		if (event.code === 'Space') {
			event.preventDefault();
			this.command('toggle');
		} else if (event.code === 'ArrowRight') {
			this.command('seek', 30);
		} else if (event.code === 'ArrowLeft') {
			this.command('seek', -10);
		} else if (event.code === 'KeyC') {
			this.el.emit('toggle-controls');
		}
	},

	remove() {
		window.removeEventListener('keydown', this.onKeyDown);
	},
});
