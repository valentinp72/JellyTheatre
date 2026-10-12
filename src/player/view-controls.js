// Moving around and resetting the view (VR controllers).
//
// - Left stick: move horizontally, in the direction you're looking.
// - Right stick: left/right snap turn, up/down raise/lower.
// - Right stick click: recenter (the screen comes in front of you).
//   Hold it: recenter with tilt (the screen follows your head up/down too,
//   for watching reclined or lying down).
// - Left stick click: back to your seat.
//
// Everything moves the camera rig; emits `rig-moved` on the scene afterwards.

import * as THREE from 'three';

const MOVE_SPEED = 1.5; // m/s
const LIFT_SPEED = 0.8; // m/s
const DEADZONE = 0.2;
const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const SNAP_THRESHOLD = 0.75;
const SNAP_RELEASE = 0.3;
const TILT_HOLD_MS = 600;

const UP = new THREE.Vector3(0, 1, 0);

AFRAME.registerComponent('view-controls', {
	schema: {
		rig: { type: 'selector', default: '#rig' },
		camera: { type: 'selector', default: '#camera' },
		left: { type: 'selector', default: '#left-hand' },
		right: { type: 'selector', default: '#right-hand' },
		// Where the screen is, and the seat (rig floor position) to return to.
		target: { type: 'vec3', default: { x: 0, y: 4.6, z: -11.9 } },
		seat: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
	},

	init() {
		this.move = { x: 0, y: 0 };
		this.turn = { x: 0, y: 0 };
		this.snapLatched = false;
		this.recenterTimer = null;

		this.data.left.addEventListener('thumbstickmoved', (event) => { this.move = event.detail; });
		this.data.right.addEventListener('thumbstickmoved', (event) => this.onRightStick(event.detail));
		this.data.left.addEventListener('thumbstickdown', () => this.backToSeat());
		this.data.right.addEventListener('thumbstickdown', () => {
			clearTimeout(this.recenterTimer);
			this.recenterTimer = setTimeout(() => {
				this.recenterTimer = null;
				this.recenter({ tilt: true });
			}, TILT_HOLD_MS);
		});
		this.data.right.addEventListener('thumbstickup', () => {
			if (this.recenterTimer === null) return; // Long press already handled.
			clearTimeout(this.recenterTimer);
			this.recenterTimer = null;
			this.recenter();
		});

		// Start every VR session on the seat, facing the screen, whatever way
		// the user faces physically. Wait for the first head pose.
		this.el.sceneEl.addEventListener('enter-vr', () => {
			setTimeout(() => this.backToSeat(), 300);
		});
	},

	onRightStick({ x, y }) {
		this.turn = { x, y };
		if (this.snapLatched && Math.abs(x) < SNAP_RELEASE) {
			this.snapLatched = false;
		} else if (!this.snapLatched && Math.abs(x) > SNAP_THRESHOLD) {
			this.snapLatched = true;
			this.rotateAroundHead(new THREE.Quaternion().setFromAxisAngle(UP, x > 0 ? -SNAP_ANGLE : SNAP_ANGLE));
		}
	},

	tick(time, delta) {
		const dt = Math.min(delta, 100) / 1000;
		const rig = this.data.rig.object3D;
		let moved = false;

		const { x, y } = this.move;
		if (Math.hypot(x, y) > DEADZONE) {
			// Horizontal direction of the gaze, in the rig's parent (world) frame.
			const forward = this.headForward();
			forward.y = 0;
			if (forward.lengthSq() > 1e-6) {
				forward.normalize();
				const right = new THREE.Vector3().crossVectors(forward, UP);
				rig.position.addScaledVector(forward, -y * MOVE_SPEED * dt);
				rig.position.addScaledVector(right, x * MOVE_SPEED * dt);
				moved = true;
			}
		}
		if (Math.abs(this.turn.y) > DEADZONE && Math.abs(this.turn.x) < SNAP_RELEASE) {
			rig.position.y += -this.turn.y * LIFT_SPEED * dt;
			moved = true;
		}
		if (moved) this.emitMoved();
	},

	headPosition() {
		const camera = this.data.camera.object3D;
		camera.updateMatrixWorld();
		return new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
	},

	headForward() {
		const camera = this.data.camera.object3D;
		camera.updateMatrixWorld();
		return new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
	},

	/** Rotates the rig by `rotation` (world frame) around the head, so the head stays in place. */
	rotateAroundHead(rotation) {
		const rig = this.data.rig.object3D;
		const head = this.headPosition();
		rig.updateMatrix();
		const matrix = new THREE.Matrix4()
			.makeTranslation(head.x, head.y, head.z)
			.multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
			.multiply(new THREE.Matrix4().makeTranslation(-head.x, -head.y, -head.z))
			.multiply(rig.matrix);
		matrix.decompose(rig.position, rig.quaternion, rig.scale);
		this.emitMoved();
	},

	/**
	 * Brings the screen in front of the user.
	 * @param {{ tilt?: boolean }} options with tilt, the screen also follows the
	 * head's pitch (for watching reclined); otherwise only yaw is corrected and
	 * any previous tilt is removed.
	 */
	recenter({ tilt = false } = {}) {
		const rig = this.data.rig.object3D;
		if (!tilt) {
			// Undo a previous tilt: keep only the rig's rotation around the vertical.
			const euler = new THREE.Euler().setFromQuaternion(rig.quaternion, 'YXZ');
			if (Math.abs(euler.x) > 1e-3 || Math.abs(euler.z) > 1e-3) {
				const levelled = new THREE.Quaternion().setFromAxisAngle(UP, euler.y);
				this.rotateAroundHead(levelled.multiply(rig.quaternion.clone().invert()));
			}
		}
		const head = this.headPosition();
		const toScreen = new THREE.Vector3().copy(this.data.target).sub(head).normalize();
		const forward = this.headForward();
		if (!tilt) {
			forward.y = 0;
			toScreen.y = 0;
			if (forward.lengthSq() < 1e-6 || toScreen.lengthSq() < 1e-6) return;
			forward.normalize();
			toScreen.normalize();
		}
		this.rotateAroundHead(new THREE.Quaternion().setFromUnitVectors(forward, toScreen));
	},

	/** Back on the seat, level, facing the screen. */
	backToSeat() {
		const rig = this.data.rig.object3D;
		const seat = this.data.seat;
		rig.quaternion.identity();
		rig.position.set(seat.x, seat.y, seat.z);
		this.recenter();
		// The head may not be above the rig origin (the user leaned or stands
		// elsewhere in their room): put the head itself above the seat.
		const head = this.headPosition();
		rig.position.x += seat.x - head.x;
		rig.position.z += seat.z - head.z;
		this.emitMoved();
	},

	emitMoved() {
		this.data.rig.object3D.updateMatrixWorld(true);
		this.el.sceneEl.emit('rig-moved');
	},
});
