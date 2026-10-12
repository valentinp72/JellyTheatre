// Moving around and resetting the view (VR controllers).
//
// - Push a stick forward: aim a teleport arc; release it to jump there (with
//   a short fade). Environments may snap the landing point (theatre seats).
// - Right stick left/right: snap turn.
// - Recenter: with the headset's own recenter (hold the Meta button), or from
//   the settings. Upright, only the direction is corrected and the room stays
//   level; reclined or lying down (head pointing well above the horizon), the
//   view is also tilted so the screen is in front of your eyes.
// - Left stick click: back to your seat.
//
// Everything moves the camera rig; emits `rig-moved` on the scene afterwards.

import * as THREE from 'three';

const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const STICK_ON = 0.6;
const STICK_OFF = 0.3;
// Looking up more than this (above the horizon) when recentering means the
// user is reclined: the view is tilted. Below, the room stays level.
const RECLINE_THRESHOLD = THREE.MathUtils.degToRad(25);
const ARC_SPEED = 7; // m/s
const ARC_STEP = 0.03; // s
const ARC_STEPS = 70;
const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const FADE_MS = 120;

const UP = new THREE.Vector3(0, 1, 0);

AFRAME.registerComponent('view-controls', {
	schema: {
		rig: { type: 'selector', default: '#rig' },
		camera: { type: 'selector', default: '#camera' },
		hands: { type: 'selectorAll', default: '#left-hand, #right-hand' },
		right: { type: 'selector', default: '#right-hand' },
		left: { type: 'selector', default: '#left-hand' },
		// Where the screen is, and the seat (rig floor position) to return to.
		target: { type: 'vec3', default: { x: 0, y: 4.6, z: -11.9 } },
		seat: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
		// Entity whose meshes tagged `userData.teleport` can be landed on.
		environment: { type: 'selector', default: '#environment' },
	},

	init() {
		this.aimingHand = null;
		this.landing = null;
		this.snapLatched = false;
		this.raycaster = new THREE.Raycaster();
		this.buildArc();
		this.buildFader();

		for (const hand of this.data.hands) {
			hand.addEventListener('thumbstickmoved', (event) => this.onStick(hand, event.detail));
		}
		this.data.left.addEventListener('thumbstickdown', () => this.backToSeat());

		// The headset's recenter (Meta button) resets the reference space: then
		// apply our own recenter, so the screen ends up in front of the user.
		this.onSystemReset = () => setTimeout(() => this.recenter(), 50);
		this.el.sceneEl.addEventListener('enter-vr', () => {
			this.referenceSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
			this.referenceSpace?.addEventListener('reset', this.onSystemReset);
			// Start every session on the seat, facing the screen, whatever way the
			// user faces physically. Wait for the first head pose.
			setTimeout(() => this.backToSeat(), 300);
		});
		this.el.sceneEl.addEventListener('exit-vr', () => {
			this.referenceSpace?.removeEventListener('reset', this.onSystemReset);
			this.referenceSpace = null;
		});
	},

	buildArc() {
		const positions = new Float32Array(ARC_STEPS * 3);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.arc = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#00a4dc', transparent: true, opacity: 0.8 }));
		this.arc.frustumCulled = false;
		this.arc.visible = false;

		this.marker = new THREE.Group();
		this.markerRing = new THREE.Mesh(
			new THREE.RingGeometry(0.22, 0.28, 32),
			new THREE.MeshBasicMaterial({ color: '#00a4dc', transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
		);
		this.markerRing.rotation.x = -Math.PI / 2;
		this.marker.add(this.markerRing);
		this.marker.visible = false;

		this.el.sceneEl.object3D.add(this.arc, this.marker);
	},

	buildFader() {
		// A small black sphere around the head, faded in and out on teleport.
		this.fader = new THREE.Mesh(
			new THREE.SphereGeometry(0.25, 16, 8),
			new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false }),
		);
		this.fader.renderOrder = 1000;
		this.fader.visible = false;
		this.data.camera.object3D.add(this.fader);
		this.fade = null;
	},

	onStick(hand, { x, y }) {
		// A hand moving something (grab-move) uses its stick for that.
		if (hand.is('grabbing')) return;
		const aiming = this.aimingHand === hand;
		if (!aiming && y < -STICK_ON && Math.abs(x) < STICK_ON && !this.aimingHand) {
			this.aimingHand = hand;
		} else if (aiming && Math.hypot(x, y) < STICK_OFF) {
			// Stick released: jump if the arc found somewhere to land.
			this.aimingHand = null;
			this.arc.visible = false;
			this.marker.visible = false;
			if (this.landing) this.teleport(this.landing);
			this.landing = null;
		}

		if (hand !== this.data.right || aiming) return;
		if (this.snapLatched && Math.abs(x) < STICK_OFF) {
			this.snapLatched = false;
		} else if (!this.snapLatched && Math.abs(x) > STICK_ON && Math.abs(y) < STICK_ON) {
			this.snapLatched = true;
			this.rotateAroundHead(new THREE.Quaternion().setFromAxisAngle(UP, x > 0 ? -SNAP_ANGLE : SNAP_ANGLE));
		}
	},

	tick(time, delta) {
		if (this.aimingHand) this.updateArc();
		this.updateFade(delta);
	},

	teleportTargets() {
		const targets = [];
		this.data.environment.object3D.traverse((object) => {
			if (object.userData.teleport) targets.push(object);
		});
		return targets;
	},

	/** Traces the teleport arc from the aiming hand's ray, and finds where it lands. */
	updateArc() {
		const ray = this.aimingHand.components.raycaster?.raycaster.ray;
		if (!ray) return;
		const targets = this.teleportTargets();
		const positions = this.arc.geometry.attributes.position;
		const point = ray.origin.clone();
		const velocity = ray.direction.clone().multiplyScalar(ARC_SPEED);
		let landing = null;
		let count = 0;
		for (; count < ARC_STEPS; count++) {
			positions.setXYZ(count, point.x, point.y, point.z);
			if (landing) break;
			const next = point.clone().addScaledVector(velocity, ARC_STEP);
			velocity.addScaledVector(GRAVITY, ARC_STEP);
			const segment = next.clone().sub(point);
			const length = segment.length();
			this.raycaster.set(point, segment.normalize());
			this.raycaster.far = length;
			const hit = this.raycaster.intersectObjects(targets, false)[0];
			if (hit) {
				next.copy(hit.point);
				// Only floors (surfaces facing up) can be landed on.
				if (facesUp(hit)) landing = hit.point.clone();
				else count = ARC_STEPS; // Hit a wall: stop the arc, no landing.
			}
			point.copy(next);
		}
		positions.needsUpdate = true;
		this.arc.geometry.setDrawRange(0, Math.min(count + 1, ARC_STEPS));
		this.arc.visible = true;

		if (landing) {
			const snapped = this.data.environment.components
				&& Object.values(this.data.environment.components).find((c) => c.snapTeleport)?.snapTeleport(landing);
			if (snapped) landing.copy(snapped);
		}
		this.landing = landing;
		this.marker.visible = Boolean(landing);
		if (landing) this.marker.position.copy(landing).add(new THREE.Vector3(0, 0.01, 0));
		this.arc.material.color.set(landing ? '#00a4dc' : '#ff6b7a');
	},

	/** Jumps so the user's head ends up above `point`, standing on it. */
	teleport(point) {
		this.startFade(() => {
			const rig = this.data.rig.object3D;
			const head = this.headPosition();
			rig.position.x += point.x - head.x;
			rig.position.z += point.z - head.z;
			rig.position.y = point.y;
			this.emitMoved();
		});
	},

	startFade(atBlack) {
		this.fade = { elapsed: 0, atBlack, done: false };
		this.fader.visible = true;
	},

	updateFade(delta) {
		const fade = this.fade;
		if (!fade) return;
		fade.elapsed += delta;
		const material = this.fader.material;
		if (fade.elapsed < FADE_MS) {
			material.opacity = fade.elapsed / FADE_MS;
		} else {
			if (!fade.done) {
				fade.done = true;
				fade.atBlack();
			}
			material.opacity = Math.max(0, 1 - (fade.elapsed - FADE_MS) / FADE_MS);
			if (material.opacity === 0) {
				this.fader.visible = false;
				this.fade = null;
			}
		}
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
	 * Brings the screen in front of the user. Upright, only the direction is
	 * corrected (the room stays level). Reclined, the view is also tilted.
	 */
	recenter() {
		const rig = this.data.rig.object3D;
		// Start from a level room (undo a previous recline compensation).
		const euler = new THREE.Euler().setFromQuaternion(rig.quaternion, 'YXZ');
		if (Math.abs(euler.x) > 1e-3 || Math.abs(euler.z) > 1e-3) {
			const levelled = new THREE.Quaternion().setFromAxisAngle(UP, euler.y);
			this.rotateAroundHead(levelled.multiply(rig.quaternion.clone().invert()));
		}
		const head = this.headPosition();
		const toScreen = new THREE.Vector3().copy(this.data.target).sub(head).normalize();
		const forward = this.headForward();
		const reclined = Math.asin(forward.y) > RECLINE_THRESHOLD;
		if (!reclined) {
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
		this.emitMoved();
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

	remove() {
		this.el.sceneEl.object3D.remove(this.arc, this.marker);
		this.data.camera.object3D.remove(this.fader);
	},
});

/** Whether a raycast hit is on a surface facing up (a floor), in world space. */
function facesUp(hit) {
	if (!hit.face) return false;
	const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
	const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
	// Inside a box seen from within (BackSide), the visible face points the other way.
	if (material?.side === THREE.BackSide) normal.negate();
	return normal.y > 0.7;
}
