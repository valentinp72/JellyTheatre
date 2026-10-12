// Lets the user move an object: hold the grip button while pointing at it and
// it follows the controller until the grip is released. With `pushPull`, the
// grabbing hand's stick (up/down) moves it further or closer. The pose is
// remembered in this browser (localStorage) under `storageKey`.
//
// While grabbing, the hand has the `grabbing` state (so other stick actions
// can stand aside). Emits `grab-start`, `grab-moving` (every frame) and
// `grab-end` on the element.

import * as THREE from 'three';

AFRAME.registerComponent('grab-move', {
	schema: {
		hands: { type: 'selectorAll', default: '[laser-controls]' },
		storageKey: { type: 'string', default: '' },
		// Other entities that can be pointed at to grab this one.
		handles: { type: 'selectorAll', default: '' },
		pushPull: { type: 'boolean', default: false },
	},

	init() {
		this.hand = null;
		this.offset = new THREE.Matrix4();
		this.matrix = new THREE.Matrix4();
		this.parentInverse = new THREE.Matrix4();
		// Default pose (from the HTML attributes), for reset().
		this.defaultPosition = this.el.object3D.position.clone();
		this.defaultQuaternion = this.el.object3D.quaternion.clone();
		this.restore();
		this.stickY = 0;

		this.listeners = [];
		const listen = (hand, type, handler) => {
			hand.addEventListener(type, handler);
			this.listeners.push([hand, type, handler]);
		};
		for (const hand of this.data.hands) {
			listen(hand, 'gripdown', () => {
				if (!this.hand && this.pointedBy(hand)) this.start(hand);
			});
			listen(hand, 'gripup', () => {
				if (this.hand === hand) this.end();
			});
			listen(hand, 'thumbstickmoved', (event) => {
				if (this.hand === hand) this.stickY = event.detail.y;
			});
		}
	},

	remove() {
		if (this.hand) this.end();
		for (const [hand, type, handler] of this.listeners) hand.removeEventListener(type, handler);
	},

	pointedBy(hand) {
		const hits = hand.components.raycaster?.intersectedEls ?? [];
		const targets = [this.el, ...(this.data.handles ?? [])];
		return this.el.object3D.visible && hits.some((hit) => targets.some((t) => t === hit || t.contains(hit)));
	},

	start(hand) {
		this.hand = hand;
		this.stickY = 0;
		hand.addState('grabbing');
		hand.object3D.updateMatrixWorld();
		this.el.object3D.updateMatrixWorld();
		this.offset.copy(hand.object3D.matrixWorld).invert().multiply(this.el.object3D.matrixWorld);
		this.el.emit('grab-start');
	},

	end() {
		this.hand.removeState('grabbing');
		this.hand = null;
		this.save();
		this.el.emit('grab-end');
	},

	tick(time, delta) {
		if (!this.hand) return;
		if (this.data.pushPull && Math.abs(this.stickY) > 0.2) {
			// Along the controller's pointing direction (-Z): stick forward = further.
			const step = this.stickY * 2.5 * (Math.min(delta, 100) / 1000);
			this.offset.premultiply(new THREE.Matrix4().makeTranslation(0, 0, step));
		}
		const object = this.el.object3D;
		this.matrix.copy(this.hand.object3D.matrixWorld).multiply(this.offset);
		this.parentInverse.copy(object.parent.matrixWorld).invert();
		this.matrix.premultiply(this.parentInverse);
		this.matrix.decompose(object.position, object.quaternion, new THREE.Vector3());
		this.el.emit('grab-moving', null, false);
	},

	save() {
		if (!this.data.storageKey) return;
		const { position: p, quaternion: q } = this.el.object3D;
		try {
			localStorage.setItem(this.data.storageKey, JSON.stringify({ p: p.toArray(), q: q.toArray() }));
		} catch {
			// Not persisted.
		}
	},

	restore() {
		if (!this.data.storageKey) return;
		try {
			const pose = JSON.parse(localStorage.getItem(this.data.storageKey));
			if (!pose) return;
			this.el.object3D.position.fromArray(pose.p);
			this.el.object3D.quaternion.fromArray(pose.q);
		} catch {
			// Ignore a corrupt or unavailable entry.
		}
	},

	/** Back to the default position, and forget the saved one. */
	reset() {
		this.el.object3D.position.copy(this.defaultPosition);
		this.el.object3D.quaternion.copy(this.defaultQuaternion);
		this.el.emit('grab-moving', null, false);
		try {
			localStorage.removeItem(this.data.storageKey);
		} catch {
			// Nothing to forget.
		}
	},
});
