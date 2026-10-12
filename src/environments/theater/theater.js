// A classic movie theatre, built procedurally so it stays light on a standalone
// headset: seats are instanced (3 draw calls for ~250 seats), materials are
// Lambert, and only 3 lights are used.
//
// Coordinates: the screen wall faces +z; the viewer looks towards -z.

import * as THREE from 'three';
import { getSetting } from '../../settings.js';

const ROOM = { width: 16, height: 10, front: -13, back: 11 };
const ROW_COUNT = 13;
const ROW_SPACING = 1.1;
const FIRST_ROW_Z = -6;
// Steep stadium seating: every row rises enough that the row in front never
// hides the bottom of the screen, even for a viewer sitting low.
const TIER_HEIGHT = 0.35;
const SEAT_WIDTH = 0.6;
const SEATS_PER_ROW = 19;
const VIEWER_ROW = 5;

const rowZ = (row) => FIRST_ROW_Z + row * ROW_SPACING;
const rowFloor = (row) => row * TIER_HEIGHT;

/** What the app needs to know about this environment. */
export const theaterLayout = {
	// Lit by the picture (see the "Screen light" setting).
	screenLight: true,
	screen: { position: { x: 0, y: 4.6, z: -11.9 }, maxWidth: 12, maxHeight: 6.75 },
	// Rig position: floor of the middle seat of the viewer row.
	seat: { x: 0, y: rowFloor(VIEWER_ROW), z: rowZ(VIEWER_ROW) },
};

const WHITE = new THREE.Color(1, 1, 1);
const IDLE_GLOW = 6;
const IDLE_GLOW_COLOR = '#c8d0ff';
// "Room brightness" setting: multiplier of the house lights.
const BRIGHTNESS = { dark: 0.08, dim: 0.2, normal: 0.45, bright: 0.8 };
// "Screen light" setting: strength of the light coming from the picture.
const SCREEN_LIGHT = { off: 0, subtle: 0.5, strong: 1 };
const HOUSE_LIGHTS_UP = 1;
// During the film the house lights are off: the screen lights the room.
const HOUSE_LIGHTS_DOWN = 0;

function curtainTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 4;
	const ctx = canvas.getContext('2d');
	for (let x = 0; x < canvas.width; x++) {
		const fold = 0.55 + 0.45 * Math.sin((x / canvas.width) * Math.PI * 2 * 8) ** 2;
		ctx.fillStyle = `rgb(${Math.round(150 * fold)}, ${Math.round(28 * fold)}, ${Math.round(42 * fold)})`;
		ctx.fillRect(x, 0, 1, canvas.height);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	return texture;
}

function box(width, height, depth, material, x, y, z) {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
	mesh.position.set(x, y, z);
	return mesh;
}

/** Marks a mesh as a surface the user can teleport onto (its upward faces). */
function walkable(mesh) {
	mesh.userData.teleport = true;
	return mesh;
}

AFRAME.registerComponent('theater-environment', {
	init() {
		this.group = new THREE.Group();
		this.el.setObject3D('theater', this.group);
		this.brightness = BRIGHTNESS[getSetting('roomBrightness')] ?? 1;
		this.lightLevel = HOUSE_LIGHTS_UP;
		this.lightTarget = HOUSE_LIGHTS_UP;

		// Neutral, fairly light surfaces: they show the color of the screen light
		// (dark or saturated ones only show its brightness).
		const wall = new THREE.MeshLambertMaterial({ color: '#4a4447' });
		const floor = new THREE.MeshLambertMaterial({ color: '#3a3537' });
		const ceiling = new THREE.MeshLambertMaterial({ color: '#1e1b1d' });
		const black = new THREE.MeshBasicMaterial({ color: '#050405' });

		this.buildRoom(wall, floor, ceiling);
		this.buildScreenWall(black);
		this.buildSeating(floor);
		this.buildLights();
	},

	buildRoom(wall, floor, ceiling) {
		const { width, height, front, back } = ROOM;
		const depth = back - front;
		const room = new THREE.Mesh(
			new THREE.BoxGeometry(width, height, depth),
			// +x, -x, +y (ceiling), -y (floor), +z, -z
			[wall, wall, ceiling, floor, wall, wall],
		);
		room.material = room.material.map((m) => {
			const clone = m.clone();
			clone.side = THREE.BackSide;
			return clone;
		});
		room.position.set(0, height / 2, (front + back) / 2);
		this.group.add(walkable(room));

		// Acoustic panels on the side walls.
		const panel = new THREE.MeshLambertMaterial({ color: '#5a5357' });
		for (let z = front + 3; z < back - 1; z += 3) {
			for (const side of [-1, 1]) {
				this.group.add(box(0.08, 4, 2.4, panel, side * (width / 2 - 0.04), 4.5, z));
			}
		}

		// Stage under the screen.
		this.group.add(walkable(box(width, 1.1, 1.6, floor, 0, 0.55, front + 0.8)));
	},

	buildScreenWall(black) {
		const { position, maxWidth, maxHeight } = theaterLayout.screen;
		// Black masking around the screen.
		const masking = new THREE.Mesh(new THREE.PlaneGeometry(maxWidth + 1.2, maxHeight + 1.2), black);
		masking.position.set(position.x, position.y, position.z - 0.05);
		this.group.add(masking);

		const texture = curtainTexture();
		const curtain = new THREE.MeshLambertMaterial({ map: texture });
		const sideWidth = (ROOM.width - maxWidth - 1.2) / 2;
		for (const side of [-1, 1]) {
			const geometry = new THREE.PlaneGeometry(sideWidth, ROOM.height - 0.5);
			const mesh = new THREE.Mesh(geometry, curtain);
			mesh.position.set(side * (ROOM.width / 2 - sideWidth / 2), (ROOM.height - 0.5) / 2 + 0.5, ROOM.front + 0.3);
			this.group.add(mesh);
		}
		const valance = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, 1.4), curtain.clone());
		valance.material.map = texture.clone();
		valance.material.map.repeat.set(4, 1);
		valance.position.set(0, ROOM.height - 0.7, ROOM.front + 0.35);
		this.group.add(valance);
	},

	buildSeating(floorMaterial) {
		// Stadium tiers.
		for (let row = 0; row < ROW_COUNT; row++) {
			const h = rowFloor(row);
			if (h > 0) this.group.add(walkable(box(ROOM.width, h, ROW_SPACING, floorMaterial, 0, h / 2, rowZ(row))));
		}
		// Back tier fills up to the back wall.
		const lastH = rowFloor(ROW_COUNT - 1);
		const backDepth = ROOM.back - (rowZ(ROW_COUNT - 1) + ROW_SPACING / 2);
		this.group.add(walkable(box(ROOM.width, lastH, backDepth, floorMaterial, 0, lastH / 2, ROOM.back - backDepth / 2)));

		// Muted red: still reflects some of a green or blue light.
		const fabric = new THREE.MeshLambertMaterial({ color: '#7a4a52' });
		const frame = new THREE.MeshLambertMaterial({ color: '#1c1418' });
		const cushionGeo = new THREE.BoxGeometry(SEAT_WIDTH - 0.08, 0.14, 0.5);
		const backGeo = new THREE.BoxGeometry(SEAT_WIDTH - 0.08, 0.6, 0.1);
		const armGeo = new THREE.BoxGeometry(0.07, 0.08, 0.55);
		const armSupportGeo = new THREE.BoxGeometry(0.07, 0.6, 0.5);
		armGeo.translate(0, 0.31, 0);
		armSupportGeo.translate(0, 0, 0.02);
		const armMerged = mergeBoxes([armGeo, armSupportGeo]);

		const seatCount = ROW_COUNT * SEATS_PER_ROW;
		const cushions = new THREE.InstancedMesh(cushionGeo, fabric, seatCount);
		const backs = new THREE.InstancedMesh(backGeo, fabric, seatCount);
		const arms = new THREE.InstancedMesh(armMerged, frame, ROW_COUNT * (SEATS_PER_ROW + 1));
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0, 0));
		const one = new THREE.Vector3(1, 1, 1);
		const identity = new THREE.Quaternion();
		let seat = 0;
		let arm = 0;
		const rowStart = -((SEATS_PER_ROW - 1) * SEAT_WIDTH) / 2;
		for (let row = 0; row < ROW_COUNT; row++) {
			const y = rowFloor(row);
			const z = rowZ(row);
			for (let i = 0; i < SEATS_PER_ROW; i++) {
				const x = rowStart + i * SEAT_WIDTH;
				cushions.setMatrixAt(seat, m.compose(new THREE.Vector3(x, y + 0.42, z), identity, one));
				backs.setMatrixAt(seat, m.compose(new THREE.Vector3(x, y + 0.78, z + 0.3), q, one));
				seat++;
			}
			for (let i = 0; i <= SEATS_PER_ROW; i++) {
				const x = rowStart - SEAT_WIDTH / 2 + i * SEAT_WIDTH;
				arms.setMatrixAt(arm++, m.compose(new THREE.Vector3(x, y + 0.3, z + 0.02), identity, one));
			}
		}
		this.group.add(cushions, backs, arms);

		// Aisle step lights along both side aisles.
		this.stepLightMaterial = new THREE.MeshBasicMaterial({ color: '#ffb35c' });
		const stepGeo = new THREE.BoxGeometry(0.5, 0.03, 0.03);
		const steps = new THREE.InstancedMesh(stepGeo, this.stepLightMaterial, ROW_COUNT * 2);
		let step = 0;
		for (let row = 0; row < ROW_COUNT; row++) {
			for (const side of [-1, 1]) {
				const pos = new THREE.Vector3(side * (ROOM.width / 2 - 1.1), rowFloor(row) + 0.02, rowZ(row) - ROW_SPACING / 2 + 0.02);
				steps.setMatrixAt(step++, m.compose(pos, identity, one));
			}
		}
		this.group.add(steps);
	},

	buildLights() {
		this.ambient = new THREE.AmbientLight('#ffe9d6', 0.5);
		this.hemi = new THREE.HemisphereLight('#ffd9b0', '#2a1820', 1.2);
		// Light from the screen: a point light in front of it for the shading,
		// and a uniform tint of the whole room with the picture's color.
		this.screenLight = new THREE.PointLight('#c8d0ff', 6, 30, 1);
		this.screenLight.position.set(0, 4, -10);
		this.spill = new THREE.AmbientLight('#000000', 0);
		this.group.add(this.ambient, this.hemi, this.screenLight, this.spill);

		// Wall sconces (emissive, dim with the house lights).
		this.sconceMaterial = new THREE.MeshBasicMaterial({ color: '#ffcf8a' });
		const sconceGeo = new THREE.BoxGeometry(0.06, 0.5, 0.25);
		for (let z = ROOM.front + 4.5; z < ROOM.back - 1; z += 3) {
			for (const side of [-1, 1]) {
				const sconce = new THREE.Mesh(sconceGeo, this.sconceMaterial);
				sconce.position.set(side * (ROOM.width / 2 - 0.05), 3.2, z);
				this.group.add(sconce);
			}
		}
		this.applyLights(this.lightLevel);

		// The screen light follows the picture (see video-screen's `screen-color`).
		this.glowColor = new THREE.Color(IDLE_GLOW_COLOR);
		this.glowTarget = new THREE.Color(IDLE_GLOW_COLOR);
		this.glowIntensity = IDLE_GLOW;
		this.glowIntensityTarget = IDLE_GLOW * this.brightness;
		this.spillIntensity = 0;
		this.spillTarget = 0;
		this.onScreenColor = (event) => {
			const strength = SCREEN_LIGHT[getSetting('screenLight')] ?? 1;
			if (event.detail) {
				// The light takes the picture's hue at full brightness (films are mostly
				// dark and desaturated: boost the saturation so the tint reads); only
				// its intensity follows how bright the picture is.
				const hsl = event.detail.color.getHSL({});
				this.glowTarget.setHSL(hsl.h, Math.min(1, hsl.s * 2), 0.5);
				const max = Math.max(this.glowTarget.r, this.glowTarget.g, this.glowTarget.b);
				if (max > 0) this.glowTarget.multiplyScalar(1 / max);
				else this.glowTarget.setRGB(1, 1, 1);
				// Mostly tint, a little white: a pure green light would leave the red
				// seats black; this way the tint shows and everything still follows
				// the brightness.
				this.glowTarget.lerp(WHITE, 0.2);
				const brightness = event.detail.luminance;
				this.glowIntensityTarget = (0.3 + 14 * brightness) * strength;
				this.spillTarget = (0.01 + 0.5 * brightness) * strength;
			} else {
				this.glowTarget.set(IDLE_GLOW_COLOR);
				this.glowIntensityTarget = IDLE_GLOW * this.brightness;
				this.spillTarget = 0;
			}
		};
		this.el.sceneEl.addEventListener('screen-color', this.onScreenColor);
		this.onSettingChange = ({ detail }) => {
			if (detail.name === 'roomBrightness') {
				this.brightness = BRIGHTNESS[detail.value] ?? 1;
				this.applyLights(this.lightLevel);
			}
		};
		window.addEventListener('settingchange', this.onSettingChange);
	},

	/** Dims or raises the house lights (smoothly). */
	/**
	 * Teleporting into the seating area lands on the nearest seat (where you
	 * would sit); the aisles, the front and the stage are free.
	 */
	snapTeleport(point) {
		const rowStart = -((SEATS_PER_ROW - 1) * SEAT_WIDTH) / 2;
		const inSeatsX = Math.abs(point.x) <= -rowStart + SEAT_WIDTH / 2;
		const row = Math.round((point.z - FIRST_ROW_Z) / ROW_SPACING);
		if (!inSeatsX || row < 0 || row >= ROW_COUNT) return null;
		const seat = THREE.MathUtils.clamp(Math.round((point.x - rowStart) / SEAT_WIDTH), 0, SEATS_PER_ROW - 1);
		return new THREE.Vector3(rowStart + seat * SEAT_WIDTH, rowFloor(row), rowZ(row));
	},

	setHouseLights(on) {
		this.lightTarget = on ? HOUSE_LIGHTS_UP : HOUSE_LIGHTS_DOWN;
	},

	applyLights(level) {
		const b = this.brightness;
		this.ambient.intensity = 0.45 * level * b;
		this.hemi.intensity = 1.4 * level * b;
		this.sconceMaterial.color.setRGB(1, 0.81, 0.54).multiplyScalar(0.04 + 0.96 * level * Math.min(1, b * 2));
		// Aisle step lights stay faintly on, so you can see the stairs in the dark.
		this.stepLightMaterial.color.setRGB(1, 0.7, 0.36).multiplyScalar(0.25 + 0.75 * level * Math.min(1, b * 2));
		// The idle screen glow follows the brightness too.
		if (this.spillTarget === 0) this.glowIntensityTarget = IDLE_GLOW * b;
	},

	tick(time, delta) {
		// Ease the screen light towards the picture's color (~0.3 s).
		const k = Math.min(1, delta / 300);
		this.glowColor.lerp(this.glowTarget, k);
		this.glowIntensity += (this.glowIntensityTarget - this.glowIntensity) * k;
		this.spillIntensity += (this.spillTarget - this.spillIntensity) * k;
		this.screenLight.color.copy(this.glowColor);
		this.screenLight.intensity = this.glowIntensity;
		this.spill.color.copy(this.glowColor);
		this.spill.intensity = this.spillIntensity;

		if (this.lightLevel === this.lightTarget) return;
		const step = (delta / 1000) / 2; // full fade in ~2 s
		this.lightLevel = this.lightTarget > this.lightLevel
			? Math.min(this.lightTarget, this.lightLevel + step)
			: Math.max(this.lightTarget, this.lightLevel - step);
		this.applyLights(this.lightLevel);
	},

	remove() {
		this.el.sceneEl.removeEventListener('screen-color', this.onScreenColor);
		window.removeEventListener('settingchange', this.onSettingChange);
		this.el.removeObject3D('theater');
	},
});

/** Merges non-indexed copies of box geometries (positions + normals) into one. */
function mergeBoxes(geometries) {
	const parts = geometries.map((g) => g.toNonIndexed());
	const count = parts.reduce((sum, g) => sum + g.attributes.position.count, 0);
	const position = new Float32Array(count * 3);
	const normal = new Float32Array(count * 3);
	let offset = 0;
	for (const g of parts) {
		position.set(g.attributes.position.array, offset * 3);
		normal.set(g.attributes.normal.array, offset * 3);
		offset += g.attributes.position.count;
	}
	const merged = new THREE.BufferGeometry();
	merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
	merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
	return merged;
}
