// Controller and keyboard shortcuts. Placed on the scene; re-emits intents as
// scene events handled by main.js:
// - `player-command` { command: 'toggle' | 'seek', delta? }
// - `toggle-controls`
//
// Quest controllers: trigger while pointing at nothing (e.g. the screen) or
// B/Y show/hide controls, A/X play/pause, thumbstick left/right seeks
// −10 s / +30 s. Mouse: click on empty space. Keyboard: space, ←/→, c.

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
			hand.addEventListener('triggerdown', () => {
				if (!pointsAtSomething(hand)) this.el.emit('toggle-controls');
			});
		}

		// Desktop: a click (not a drag to look around) on empty space.
		this.onPointerDown = (event) => {
			this.pointerDown = { x: event.clientX, y: event.clientY };
		};
		this.onPointerUp = (event) => {
			const down = this.pointerDown;
			this.pointerDown = null;
			if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
			const mouse = this.el.querySelector('[cursor]');
			if (mouse && !pointsAtSomething(mouse)) this.el.emit('toggle-controls');
		};
		const attach = () => {
			this.el.canvas.addEventListener('pointerdown', this.onPointerDown);
			this.el.canvas.addEventListener('pointerup', this.onPointerUp);
		};
		if (this.el.canvas) attach();
		else this.el.addEventListener('render-target-loaded', attach, { once: true });
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
		this.el.canvas?.removeEventListener('pointerdown', this.onPointerDown);
		this.el.canvas?.removeEventListener('pointerup', this.onPointerUp);
	},
});

/** Whether a pointer's ray currently hits an interactive entity. */
function pointsAtSomething(el) {
	return (el.components.raycaster?.intersectedEls.length ?? 0) > 0;
}
