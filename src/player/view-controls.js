// Moving around and resetting the view (VR controllers).
//
// - Push a stick forward: point at a seat (the one nearest to where the hand
//   points is highlighted); release the stick to jump onto it, with a short
//   fade. Only seats can be reached: there is nothing to do standing up.
// - Right stick left/right: snap turn.
// - Recenter: with the headset's own recenter (hold the Meta button), or from
//   the settings. Upright, only the direction is corrected and the room stays
//   level; reclined or lying down (head pointing well above the horizon), the
//   view is also tilted so the screen is in front of your eyes, upright, and
//   the menus (the `view` entity) come in front of your eyes too.
// - Environments where the viewer lies down (a hammock, beds) are always
//   recentered that way in VR, and put the viewer's head at a fixed spot
//   (`head`; with several beds, each seat carries its own `head`).
// - Left stick click: back to your seat.
//
// Everything moves the camera rig; emits `rig-moved` on the scene afterwards.

import * as THREE from 'three';
import { getSetting } from '../settings.js';

const SNAP_ANGLE = THREE.MathUtils.degToRad(30);
const STICK_ON = 0.6;
const STICK_OFF = 0.3;
// Looking up more than this (above the horizon) when recentering means the
// user is reclined: the view is tilted. Below, the room stays level.
const RECLINE_THRESHOLD = THREE.MathUtils.degToRad(25);
// A seat is picked if the hand points within this angle of it.
const AIM_ANGLE = THREE.MathUtils.degToRad(12);
// Pointing height above a seat's floor position (about the cushion).
const SEAT_AIM_HEIGHT = 0.5;
const ARC_POINTS = 24;
const FADE_MS = 120;

// Eye height the menus are laid out for (rig-local, seated).
const MENU_EYE_HEIGHT = 1.2;

const UP = new THREE.Vector3(0, 1, 0);

AFRAME.registerComponent('view-controls', {
	schema: {
		rig: { type: 'selector', default: '#rig' },
		camera: { type: 'selector', default: '#camera' },
		// Holds the menus; tilted with the user's gaze when reclined.
		view: { type: 'selector', default: '#view' },
		hands: { type: 'selectorAll', default: '#left-hand, #right-hand' },
		right: { type: 'selector', default: '#right-hand' },
		left: { type: 'selector', default: '#left-hand' },
		// Where the screen is, and the seat (rig floor position) to return to.
		target: { type: 'vec3', default: { x: 0, y: 4.6, z: -11.9 } },
		seat: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
		// Lying-down environment: always recentered reclined (in VR), the eyes at
		// `head` (a world position) instead of seated height above the seat.
		lying: { type: 'boolean', default: false },
		head: { type: 'vec3', default: { x: 0, y: 1, z: 0 } },
		// Entity whose environment component lists the seats (seatPositions()).
		environment: { type: 'selector', default: '#environment' },
	},

	init() {
		this.aimingHand = null;
		this.landing = null;
		this.snapLatched = false;
		this.buildArc();
		this.buildFader();

		for (const hand of this.data.hands) {
			hand.addEventListener('thumbstickmoved', (event) => this.onStick(hand, event.detail));
		}
		this.data.left.addEventListener('thumbstickdown', () => this.backToSeat());

		// "Eye height" setting: shift the view up or down right away.
		this.heightOffset = getSetting('heightOffset');
		this.onSettingChange = ({ detail }) => {
			if (detail.name !== 'heightOffset') return;
			// Lying down, the head is placed exactly: no seat height to adjust.
			if (!this.data.lying) this.data.rig.object3D.position.y += detail.value - this.heightOffset;
			this.heightOffset = detail.value;
			this.emitMoved();
		};
		window.addEventListener('settingchange', this.onSettingChange);

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
		const positions = new Float32Array(ARC_POINTS * 3);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		this.arc = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#00a4dc', transparent: true, opacity: 0.8 }));
		this.arc.frustumCulled = false;
		this.arc.visible = false;

		// The ring floats over the cushion and is drawn on top, so the seat
		// itself doesn't hide it.
		this.marker = new THREE.Group();
		this.markerRing = new THREE.Mesh(
			new THREE.RingGeometry(0.22, 0.28, 32),
			new THREE.MeshBasicMaterial({ color: '#00a4dc', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }),
		);
		this.markerRing.renderOrder = 999;
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
			// Stick released: jump if a seat was picked.
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

	seats() {
		const environment = Object.values(this.data.environment.components ?? {}).find((c) => c.seatPositions);
		return environment?.seatPositions() ?? [];
	},

	/** Picks the seat the aiming hand points at, and draws an arc to it. */
	updateArc() {
		const ray = this.aimingHand.components.raycaster?.raycaster.ray;
		if (!ray) return;
		let best = null;
		let bestAngle = AIM_ANGLE;
		const toSeat = new THREE.Vector3();
		for (const seat of this.seats()) {
			toSeat.set(seat.x, seat.y + SEAT_AIM_HEIGHT, seat.z).sub(ray.origin);
			const angle = toSeat.angleTo(ray.direction);
			if (angle < bestAngle) {
				best = seat;
				bestAngle = angle;
			}
		}
		this.landing = best;

		// A curve leaving along the ray and coming down on the seat; without a
		// seat, a short red stub along the ray.
		const end = best ? new THREE.Vector3(best.x, best.y + SEAT_AIM_HEIGHT, best.z) : ray.origin.clone().addScaledVector(ray.direction, 0.6);
		const control = ray.origin.clone().addScaledVector(ray.direction, ray.origin.distanceTo(end) * 0.5);
		const curve = new THREE.QuadraticBezierCurve3(ray.origin.clone(), control, end);
		const positions = this.arc.geometry.attributes.position;
		curve.getPoints(ARC_POINTS - 1).forEach((point, i) => positions.setXYZ(i, point.x, point.y, point.z));
		positions.needsUpdate = true;
		this.arc.visible = true;
		this.arc.material.color.set(best ? '#00a4dc' : '#ff6b7a');
		this.marker.visible = Boolean(best);
		if (best) this.marker.position.set(best.x, best.y + SEAT_AIM_HEIGHT + 0.1, best.z);
	},

	/** Jumps onto `seat` (a floor position), facing the screen. */
	teleport(seat) {
		this.startFade(() => this.backToSeat(seat));
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
	 * corrected (the room stays level). Reclined, the view is also tilted, with
	 * the picture upright for the eyes, and the menus follow the gaze.
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
		// (On the flat page, the room stays level: the view is aimed instead.)
		const immersive = this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode');
		const reclined = (this.data.lying && immersive) || Math.asin(forward.y) > RECLINE_THRESHOLD;
		this.placeMenus(reclined);
		if (!reclined) {
			forward.y = 0;
			toScreen.y = 0;
			if (forward.lengthSq() < 1e-6 || toScreen.lengthSq() < 1e-6) return;
			forward.normalize();
			toScreen.normalize();
			this.rotateAroundHead(new THREE.Quaternion().setFromUnitVectors(forward, toScreen));
			return;
		}
		// Gaze onto the screen, and the top of the head towards the top of the
		// picture (else it could look rotated, depending on how the user lies).
		const camera = this.data.camera.object3D;
		const headUp = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld);
		const screenUp = this.screenUp();
		const from = frame(forward, headUp);
		const to = frame(toScreen, screenUp.sub(toScreen.clone().multiplyScalar(screenUp.dot(toScreen))));
		if (!from || !to) {
			this.rotateAroundHead(new THREE.Quaternion().setFromUnitVectors(forward, toScreen));
			return;
		}
		this.rotateAroundHead(new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose())));
	},

	/** World "up" of the picture (the screen can be tilted). */
	screenUp() {
		const screen = document.getElementById('screen')?.object3D;
		if (!screen) return UP.clone();
		screen.updateMatrixWorld();
		return new THREE.Vector3(0, 1, 0).transformDirection(screen.matrixWorld);
	},

	/**
	 * The menus are laid out for a seated user looking ahead. Reclined, they
	 * turn with the gaze (as it is now, in the rig), around the eyes.
	 */
	placeMenus(reclined) {
		const view = this.data.view?.object3D;
		if (!view) return;
		if (!reclined) {
			view.position.set(0, 0, 0);
			view.quaternion.identity();
			return;
		}
		// The head's pose in the rig (where the menus live).
		const rig = this.data.rig.object3D;
		const camera = this.data.camera.object3D;
		rig.updateMatrixWorld();
		camera.updateMatrixWorld();
		const pose = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(camera.matrixWorld);
		const eyes = new THREE.Vector3();
		pose.decompose(eyes, view.quaternion, new THREE.Vector3());
		view.position.set(0, -MENU_EYE_HEIGHT, 0).applyQuaternion(view.quaternion).add(eyes);
	},

	/**
	 * Back on the seat (default: the environment's), level, facing the screen.
	 * @param {{ x: number, y: number, z: number, head?: THREE.Vector3 }} [seat]
	 */
	backToSeat(seat = this.data.seat) {
		const rig = this.data.rig.object3D;
		rig.quaternion.identity();
		if (this.data.lying) {
			// Lying down: the eyes go exactly where the head rests on this bed
			// (recentering turns around the head, which stays there).
			rig.position.set(seat.x, seat.y, seat.z);
			this.emitMoved();
			rig.position.add(new THREE.Vector3().copy(seat.head ?? this.data.head).sub(this.headPosition()));
			this.emitMoved();
			this.recenter();
			return;
		}
		rig.position.set(seat.x, seat.y + getSetting('heightOffset'), seat.z);
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
		window.removeEventListener('settingchange', this.onSettingChange);
		this.el.sceneEl.object3D.remove(this.arc, this.marker);
		this.data.camera.object3D.remove(this.fader);
	},
});

/**
 * Rotation matrix whose axes are a view's right, up and backward, from where
 * it looks (`forward`) and its up direction (made perpendicular).
 */
function frame(forward, up) {
	const f = forward.clone().normalize();
	const right = new THREE.Vector3().crossVectors(f, up);
	if (right.lengthSq() < 1e-6) return null;
	right.normalize();
	const u = new THREE.Vector3().crossVectors(right, f);
	return new THREE.Matrix4().makeBasis(right, u, f.negate());
}
