// Lets the user move a panel: hold the grip button while pointing at it and
// the panel follows the controller until the grip is released. The pose is
// remembered in this browser (localStorage) under `storageKey`.
//
// Emits `grab-start` and `grab-end` on the element.

import * as THREE from 'three';

AFRAME.registerComponent('grab-move', {
	schema: {
		hands: { type: 'selectorAll', default: '[laser-controls]' },
		storageKey: { type: 'string', default: '' },
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

		for (const hand of this.data.hands) {
			hand.addEventListener('gripdown', () => {
				if (!this.hand && this.pointedBy(hand)) this.start(hand);
			});
			hand.addEventListener('gripup', () => {
				if (this.hand === hand) this.end();
			});
		}
	},

	pointedBy(hand) {
		const hits = hand.components.raycaster?.intersectedEls ?? [];
		return this.el.object3D.visible && hits.some((el) => this.el === el || this.el.contains(el));
	},

	start(hand) {
		this.hand = hand;
		hand.object3D.updateMatrixWorld();
		this.el.object3D.updateMatrixWorld();
		this.offset.copy(hand.object3D.matrixWorld).invert().multiply(this.el.object3D.matrixWorld);
		this.el.emit('grab-start');
	},

	end() {
		this.hand = null;
		this.save();
		this.el.emit('grab-end');
	},

	tick() {
		if (!this.hand) return;
		const object = this.el.object3D;
		this.matrix.copy(this.hand.object3D.matrixWorld).multiply(this.offset);
		this.parentInverse.copy(object.parent.matrixWorld).invert();
		this.matrix.premultiply(this.parentInverse);
		this.matrix.decompose(object.position, object.quaternion, new THREE.Vector3());
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

	/** Back to the position from the HTML, and forget the saved one. */
	reset() {
		this.el.object3D.position.copy(this.defaultPosition);
		this.el.object3D.quaternion.copy(this.defaultQuaternion);
		try {
			localStorage.removeItem(this.data.storageKey);
		} catch {
			// Nothing to forget.
		}
	},
});
