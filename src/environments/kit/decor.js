// Decoration that makes a room feel lived in: pictures, cabinets, shelves,
// a popcorn machine, crates, firewood, planters (static, merged into the
// StaticBuilder like props.js), sci-fi status displays, and two small living
// details: flickering candles and a wall clock at the real time. Those are
// effects: push them into `env.effects` (they have `tick(delta, time)`).

import * as THREE from 'three';
import { box, roundedBox } from './geometry.js';
import { Placer } from './props.js';
import { canvasTexture, clockFace, flame, random } from './textures.js';

/** A plane showing cell `index` of a pictures() atlas. */
export function atlasPlane(width, height, atlas, index) {
	const geometry = new THREE.PlaneGeometry(width, height);
	const col = index % atlas.cols;
	const row = Math.floor(index / atlas.cols) % atlas.rows;
	const uv = geometry.attributes.uv;
	for (let i = 0; i < uv.count; i++) {
		uv.setXY(i, (col + uv.getX(i)) / atlas.cols, 1 - (row + 1 - uv.getY(i)) / atlas.rows);
	}
	return geometry;
}

/**
 * A framed picture hanging on a wall, facing -z before rotation (like
 * props); `m.frame`, and `m.pictures` showing `atlas`. With `light`, a small
 * picture light above it (`m.lampShade`, a light fixture).
 */
export function framedPicture(b, m, position, rotationY, { width, atlas, index, frame = 0.04, light = false }) {
	const height = width / atlas.aspect;
	const p = new Placer(b, position, rotationY);
	for (const [w, h, x, y] of [
		[width + 2 * frame, frame, 0, (height + frame) / 2], [width + 2 * frame, frame, 0, -(height + frame) / 2],
		[frame, height, -(width + frame) / 2, 0], [frame, height, (width + frame) / 2, 0],
	]) {
		p.add(box(w, h, 0.035), m.frame, [x, y, 0]);
	}
	p.add(atlasPlane(width, height, atlas, index), m.pictures, [0, 0, -0.005], [0, Math.PI, 0]);
	if (light) {
		p.add(box(0.03, 0.03, 0.1), m.metal, [0, height / 2 + frame + 0.06, -0.04]);
		p.add(new THREE.CylinderGeometry(0.025, 0.025, width * 0.5, 10), m.lampShade, [0, height / 2 + frame + 0.06, -0.1], [0, 0, Math.PI / 2]);
	}
}

/** Low cabinet with doors and knobs (`m.cabinet`, `m.metal`). */
export function sideboard(b, m, position, rotationY = 0, { width = 1.6, height = 0.55, depth = 0.42, doors = 3 } = {}) {
	const p = new Placer(b, position, rotationY);
	p.add(roundedBox(width, height - 0.06, depth, 0.015, 1), m.cabinet, [0, height / 2 + 0.03, 0]);
	p.add(roundedBox(width + 0.04, 0.035, depth + 0.03, 0.01, 1), m.wood ?? m.cabinet, [0, height + 0.0125, 0]);
	const doorW = (width - 0.06) / doors;
	for (let i = 0; i < doors; i++) {
		const x = -width / 2 + 0.03 + doorW * (i + 0.5);
		p.add(box(doorW - 0.02, height - 0.16, 0.015), m.wood ?? m.cabinet, [x, height / 2 + 0.03, -depth / 2 - 0.006]);
		p.add(box(0.012, 0.08, 0.02), m.metal, [x + doorW / 2 - 0.06, height / 2 + 0.03, -depth / 2 - 0.02]);
	}
	for (const sx of [-1, 1]) p.add(box(0.04, 0.03, depth - 0.06), m.legs ?? m.metal, [sx * (width / 2 - 0.08), 0.015, 0]);
}

/**
 * Cinema popcorn cart: red base, glass case full of popcorn, lit from the top
 * (`m.popcornBody`, `m.glass`, `m.popcorn`, `m.metal`, `m.lampShade`).
 */
export function popcornMachine(b, m, position, rotationY = 0, seed = 3) {
	const p = new Placer(b, position, rotationY);
	p.add(roundedBox(0.62, 0.78, 0.46, 0.03, 1), m.popcornBody, [0, 0.39 + 0.08, 0]);
	for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
		p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), m.metal, [sx * 0.24, 0.04, sz * 0.16], [Math.PI / 2, 0, 0]);
	}
	// Glass case: its frame, the popcorn heap inside, the glass, the roof.
	const caseY = 0.86;
	for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
		p.add(box(0.03, 0.5, 0.03), m.popcornBody, [sx * 0.29, caseY + 0.25, sz * 0.21]);
	}
	const rand = random(seed);
	for (let i = 0; i < 26; i++) {
		const r = 0.035 + rand() * 0.02;
		p.add(new THREE.IcosahedronGeometry(r, 0), m.popcorn, [(rand() - 0.5) * 0.5, caseY + 0.03 + rand() * 0.12, (rand() - 0.5) * 0.34]);
	}
	p.add(new THREE.BoxGeometry(0.56, 0.48, 0.4), m.glass, [0, caseY + 0.25, 0]);
	p.add(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), m.metal, [0.08, caseY + 0.43, 0]);
	p.add(box(0.5, 0.025, 0.34), m.lampShade, [0, caseY + 0.49, 0]);
	p.add(roundedBox(0.66, 0.1, 0.5, 0.03, 1), m.popcornBody, [0, caseY + 0.55, 0]);
}

/** Cargo crate with reinforced edges (`m.crate`, `m.crateEdge`). */
export function crate(b, m, position, rotationY = 0, { size = 0.7, height = size } = {}) {
	const p = new Placer(b, position, rotationY);
	p.add(box(size, height, size), m.crate, [0, height / 2, 0]);
	const e = 0.045;
	for (const sx of [-1, 1]) {
		for (const sz of [-1, 1]) p.add(box(e, height + 0.01, e), m.crateEdge, [sx * (size / 2), height / 2, sz * (size / 2)]);
		p.add(box(e, e, size + 0.01), m.crateEdge, [sx * (size / 2), height, 0]);
		p.add(box(size + 0.01, e, e), m.crateEdge, [0, height, sx * (size / 2)]);
	}
}

/** A stack of split logs (`m.bark`, `m.logEnd`). */
export function woodpile(b, m, position, rotationY = 0, { width = 0.9, rows = 4, length = 0.45, seed = 9 } = {}) {
	const p = new Placer(b, position, rotationY);
	const rand = random(seed);
	const r = 0.06;
	for (let row = 0; row < rows; row++) {
		const count = Math.floor(width / (2 * r)) - (row % 2);
		for (let i = 0; i < count; i++) {
			const x = -width / 2 + r + (row % 2) * r + i * 2 * r;
			const radius = r * (0.8 + rand() * 0.25);
			const z = (rand() - 0.5) * 0.06;
			p.add(new THREE.CylinderGeometry(radius, radius, length, 6), m.bark, [x, r + row * r * 1.7, z], [Math.PI / 2, rand(), 0]);
			p.add(new THREE.CircleGeometry(radius * 0.92, 6), m.logEnd, [x, r + row * r * 1.7, z - length / 2 - 0.002], [0, Math.PI, 0]);
		}
	}
}

/**
 * Wall shelf with jars, pots and a few books (`m.wood`, `m.jars` array,
 * `m.books` array).
 */
export function wallShelf(b, m, position, rotationY = 0, { width = 1, seed = 4 } = {}) {
	const p = new Placer(b, position, rotationY);
	const rand = random(seed);
	p.add(box(width, 0.03, 0.22), m.wood, [0, 0, 0]);
	for (const sx of [-1, 1]) p.add(box(0.03, 0.12, 0.16), m.wood, [sx * (width / 2 - 0.1), -0.07, 0.03]);
	let x = -width / 2 + 0.05;
	while (x < width / 2 - 0.08) {
		if (rand() < 0.35) {
			// A few books standing.
			const count = 2 + Math.floor(rand() * 4);
			for (let i = 0; i < count && x < width / 2 - 0.05; i++) {
				const h = 0.14 + rand() * 0.08;
				p.add(box(0.03, h, 0.15), m.books[Math.floor(rand() * m.books.length)], [x + 0.015, 0.015 + h / 2, 0]);
				x += 0.034;
			}
		} else {
			const r = 0.035 + rand() * 0.035;
			const h = 0.08 + rand() * 0.14;
			p.add(new THREE.CylinderGeometry(r, r * (0.8 + rand() * 0.3), h, 10), m.jars[Math.floor(rand() * m.jars.length)], [x + r, 0.015 + h / 2, (rand() - 0.5) * 0.06]);
			x += 2 * r + 0.03;
		}
		x += 0.02;
	}
}

/** Lamp hanging from the ceiling at `position` (its top), `drop` below (`m.metal`, `m.lampShade`). */
export function pendantLamp(b, m, position, { drop = 1 } = {}) {
	const p = new Placer(b, position);
	p.add(new THREE.CylinderGeometry(0.006, 0.006, drop, 4), m.metal, [0, -drop / 2, 0]);
	p.add(new THREE.CylinderGeometry(0.05, 0.22, 0.2, 16, 1, true), m.metal, [0, -drop - 0.1, 0]);
	p.add(new THREE.CircleGeometry(0.2, 16), m.lampShade, [0, -drop - 0.19, 0], [Math.PI / 2, 0, 0]);
}

/**
 * Hydroponic planter: a trough of greens under a grow light (`m.pot`,
 * `m.leaves`, `m.metal`, `m.growLight`).
 */
export function planter(b, m, position, rotationY = 0, { length = 2, seed = 2 } = {}) {
	const p = new Placer(b, position, rotationY);
	const rand = random(seed);
	p.add(roundedBox(length, 0.3, 0.45, 0.04, 1), m.pot, [0, 0.55, 0]);
	for (const sx of [-1, 1]) p.add(box(0.05, 0.4, 0.35), m.metal, [sx * (length / 2 - 0.15), 0.2, 0]);
	for (let x = -length / 2 + 0.15; x < length / 2 - 0.1; x += 0.16) {
		const r = 0.07 + rand() * 0.06;
		p.add(new THREE.IcosahedronGeometry(r, 0), m.leaves, [x, 0.75 + rand() * 0.08, (rand() - 0.5) * 0.18]);
	}
	// The grow light on two posts.
	for (const sx of [-1, 1]) p.add(box(0.03, 0.75, 0.03), m.metal, [sx * (length / 2 - 0.05), 1.05, 0.15]);
	p.add(box(length, 0.04, 0.12), m.metal, [0, 1.43, 0]);
	p.add(box(length - 0.1, 0.012, 0.08), m.growLight, [0, 1.405, 0]);
}

/**
 * Candles with flickering flames (one instanced mesh for all flames).
 * Static wax is added to the builder; push the instance into env.effects.
 */
export class Candles {
	/**
	 * @param {THREE.Object3D} parent
	 * @param {import('./builder.js').StaticBuilder} b
	 * @param {{ wax: THREE.Material }} m
	 * @param {Array<[number, number, number, number?]>} spots x, y (base), z, height
	 */
	constructor(parent, b, m, spots) {
		this.bases = [];
		for (const [x, y, z, height = 0.12 + (this.bases.length % 3) * 0.05] of spots) {
			b.add(new THREE.CylinderGeometry(0.03, 0.032, height, 12), m.wax, { position: [x, y + height / 2, z] });
			this.bases.push(new THREE.Vector3(x, y + height + 0.03, z));
		}
		// Two crossed planes: a flame from every side.
		const plane = new THREE.PlaneGeometry(0.035, 0.07);
		const crossed = plane.clone().rotateY(Math.PI / 2);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([...plane.attributes.position.array, ...crossed.attributes.position.array], 3));
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute([...plane.attributes.uv.array, ...plane.attributes.uv.array], 2));
		geometry.setIndex([...plane.index.array, ...[...plane.index.array].map((i) => i + 4)]);
		this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({
			map: flame(), color: '#ffd59a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
		}), this.bases.length);
		this.mesh.frustumCulled = false;
		parent.add(this.mesh);
		this.matrix = new THREE.Matrix4();
		this.time = 0;
		this.tick(0);
	}

	tick(delta) {
		this.time += Math.min(delta, 100) / 1000;
		const t = this.time;
		this.bases.forEach((base, i) => {
			// Each flame on its own rhythm: a slow sway and a quick flicker.
			const flicker = 0.85 + 0.1 * Math.sin(t * 9 + i * 1.7) + 0.06 * Math.sin(t * 23 + i * 4.1);
			this.matrix.makeRotationZ(0.08 * Math.sin(t * 2.3 + i));
			this.matrix.scale(new THREE.Vector3(1, flicker, 1));
			this.matrix.setPosition(base.x, base.y + 0.035 * (flicker - 1), base.z);
			this.mesh.setMatrixAt(i, this.matrix);
		});
		this.mesh.instanceMatrix.needsUpdate = true;
	}
}

/** Round wall clock showing the real time (hands move). Push into env.effects. */
export class WallClock {
	/**
	 * Faces +z before rotation (hung on a wall facing the room).
	 * @param {THREE.Object3D} parent
	 * @param {import('./builder.js').StaticBuilder} b the rim is static
	 * @param {{ frame: THREE.Material }} m
	 */
	constructor(parent, b, m, position, rotationY = 0, { radius = 0.18 } = {}) {
		this.group = new THREE.Group();
		this.group.position.set(...position);
		this.group.rotation.y = rotationY;
		new Placer(b, position, rotationY).add(new THREE.CylinderGeometry(radius + 0.02, radius + 0.02, 0.04, 32), m.frame, [0, 0, 0], [Math.PI / 2, 0, 0]);
		const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshLambertMaterial({ map: clockFace() }));
		face.position.z = 0.021;
		this.group.add(face);
		const handMaterial = new THREE.MeshBasicMaterial({ color: '#1a120c' });
		const hand = (length, width) => {
			const geometry = new THREE.PlaneGeometry(width, length).translate(0, length / 2 - 0.015, 0);
			const mesh = new THREE.Mesh(geometry, handMaterial);
			mesh.position.z = 0.024;
			this.group.add(mesh);
			return mesh;
		};
		this.hour = hand(radius * 0.55, 0.018);
		this.minute = hand(radius * 0.82, 0.012);
		parent.add(this.group);
		this.tick();
	}

	tick() {
		const now = new Date();
		const minutes = now.getMinutes() + now.getSeconds() / 60;
		this.minute.rotation.z = -(minutes / 60) * Math.PI * 2;
		this.hour.rotation.z = -(((now.getHours() % 12) + minutes / 60) / 12) * Math.PI * 2;
	}
}

/**
 * Sci-fi status displays: one canvas whose four cells (radar, graph, bars,
 * readouts) are shown on any number of screens merged into the builder, plus
 * indicator lights. Static on purpose: a canvas redrawn a few times a second
 * looks choppy in VR. `material` dims with the house lights if added as a
 * fixture.
 */
export class StatusDisplays {
	constructor() {
		this.canvas = document.createElement('canvas');
		this.canvas.width = 512;
		this.canvas.height = 256;
		this.context = this.canvas.getContext('2d');
		this.texture = new THREE.CanvasTexture(this.canvas);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.material = new THREE.MeshBasicMaterial({ map: this.texture });
		this.atlas = { cols: 2, rows: 2, aspect: 2 };
		this.leds = new THREE.MeshBasicMaterial({ color: '#ff5a4a' });
		this.draw(4.2);
	}

	/** Adds a screen (cell 0–3) to the builder, facing -z before rotation. */
	addScreen(b, frameMaterial, position, rotationY, { width = 0.9, cell = 0 } = {}) {
		const height = width / this.atlas.aspect;
		const p = new Placer(b, position, rotationY);
		p.add(roundedBox(width + 0.08, height + 0.08, 0.06, 0.02, 1), frameMaterial, [0, 0, 0.02]);
		p.add(atlasPlane(width, height, this.atlas, cell), this.material, [0, 0, -0.012], [0, Math.PI, 0]);
	}

	/** A row of small indicator lights. */
	addLeds(b, position, rotationY, { count = 6, spacing = 0.05 } = {}) {
		const p = new Placer(b, position, rotationY);
		for (let i = 0; i < count; i++) p.add(box(0.02, 0.02, 0.01), this.leds, [(i - (count - 1) / 2) * spacing, 0, 0]);
	}

	/** Draws the displays as they are at `t` seconds of their animation. */
	draw(t) {
		const ctx = this.context;
		const w = 256;
		const h = 128;
		const cyan = '#4fd8ff';
		ctx.fillStyle = '#04121c';
		ctx.fillRect(0, 0, 512, 256);
		ctx.strokeStyle = cyan;
		ctx.fillStyle = cyan;
		ctx.lineWidth = 2;

		// Radar: rings, a sweep and a few blips.
		ctx.save();
		ctx.translate(w / 2, h / 2);
		for (const r of [20, 38, 56]) {
			ctx.globalAlpha = 0.4;
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.stroke();
		}
		const sweep = t * 1.5;
		ctx.globalAlpha = 0.35;
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.arc(0, 0, 56, sweep - 0.6, sweep);
		ctx.fill();
		ctx.globalAlpha = 1;
		for (let i = 0; i < 4; i++) {
			const a = i * 1.9 + 0.3;
			const fade = ((sweep - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
			ctx.globalAlpha = Math.max(0, 1 - fade / 3);
			ctx.fillRect(Math.cos(a) * (18 + i * 10) - 2, Math.sin(a) * (18 + i * 10) - 2, 5, 5);
		}
		ctx.restore();

		// Graph: two scrolling waves.
		ctx.save();
		ctx.translate(w, 0);
		ctx.globalAlpha = 0.25;
		for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 1, h);
		ctx.globalAlpha = 1;
		for (const [phase, color] of [[0, cyan], [1.3, '#ffb84f']]) {
			ctx.strokeStyle = color;
			ctx.beginPath();
			for (let x = 0; x <= w; x += 4) {
				const v = Math.sin((x / 30) + t * 2 + phase) * 22 + Math.sin((x / 11) + t * 5 + phase) * 7;
				ctx.lineTo(x, h / 2 + v);
			}
			ctx.stroke();
		}
		ctx.restore();

		// Bars, moving gently.
		ctx.save();
		ctx.translate(0, h);
		for (let i = 0; i < 10; i++) {
			const v = 0.35 + 0.3 * Math.sin(t * (0.7 + i * 0.13) + i) + 0.15 * Math.sin(t * 3 + i * 2);
			ctx.fillStyle = v > 0.72 ? '#ffb84f' : cyan;
			ctx.fillRect(16 + i * 23, h - 12 - v * 96, 15, v * 96);
		}
		ctx.restore();

		// Readouts: rows of blocks, like text, with a blinking cursor.
		ctx.save();
		ctx.translate(w, h);
		const rand = random(Math.floor(t * 2));
		for (let row = 0; row < 7; row++) {
			let x = 14;
			while (x < w - 30) {
				const len = 8 + rand() * 40;
				ctx.globalAlpha = 0.5 + rand() * 0.5;
				ctx.fillRect(x, 14 + row * 15, len, 7);
				x += len + 8;
			}
		}
		ctx.fillRect(14, 14 + 7 * 15, 10, 7);
		ctx.restore();
		this.texture.needsUpdate = true;
	}
}

/** A handrail from `start` to `end` (world points), on two standoffs (`m.handrail`). */
export function handrail(b, m, start, end, { offset = new THREE.Vector3(0, 0, 0) } = {}) {
	const a = new THREE.Vector3(...start);
	const c = new THREE.Vector3(...end);
	const length = a.distanceTo(c);
	const middle = a.clone().add(c).multiplyScalar(0.5);
	const bar = new THREE.CylinderGeometry(0.018, 0.018, length, 8);
	bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()));
	b.add(bar, m.handrail, { position: middle.toArray() });
	// Standoffs back to the wall (along -offset).
	const back = offset.clone();
	const standLength = back.length();
	if (standLength > 0) {
		for (const point of [a.clone().lerp(c, 0.08), a.clone().lerp(c, 0.92)]) {
			const stand = new THREE.CylinderGeometry(0.012, 0.012, standLength, 6);
			stand.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), back.clone().normalize()));
			b.add(stand, m.handrail, { position: point.clone().add(back.clone().multiplyScalar(0.5)).toArray() });
		}
	}
}

/**
 * Soft white cargo bag strapped to a wall (zero-g storage), facing -z before
 * rotation (`m.bag`, `m.strap`).
 */
export function cargoBag(b, m, position, rotationY = 0, { width = 0.5, height = 0.35, depth = 0.3, tilt = 0 } = {}) {
	const p = new Placer(b, position, rotationY);
	p.add(roundedBox(width, height, depth, 0.06, 1), m.bag, [0, 0, 0], [0, 0, tilt]);
	// Two straps around it, holding it to the wall.
	for (const x of [-width * 0.28, width * 0.28]) {
		const dx = Math.cos(tilt) * x;
		const dy = Math.sin(tilt) * x;
		p.add(box(0.04, height + 0.03, depth + 0.03), m.strap, [dx, dy, 0], [0, 0, tilt]);
	}
}

/** One floating object: geometries with vertex colors, merged. */
function coloured(parts) {
	const geometries = parts.map(([geometry, color, position = [0, 0, 0], rotation = [0, 0, 0]]) => {
		const g = geometry.toNonIndexed();
		g.rotateX(rotation[0]).rotateY(rotation[1]).rotateZ(rotation[2]);
		g.translate(...position);
		const c = new THREE.Color(color);
		const colors = new Float32Array(g.attributes.position.count * 3);
		for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
		g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		g.deleteAttribute('uv');
		return g;
	});
	const merged = new THREE.BufferGeometry();
	for (const name of ['position', 'normal', 'color']) {
		const arrays = geometries.map((g) => g.attributes[name].array);
		const total = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
		let offset = 0;
		for (const a of arrays) {
			total.set(a, offset);
			offset += a.length;
		}
		merged.setAttribute(name, new THREE.BufferAttribute(total, 3));
	}
	return merged;
}

/** The things drifting in a zero-g cabin. */
const FLOATERS = {
	pouch: () => coloured([
		[new THREE.BoxGeometry(0.11, 0.16, 0.025), '#c9ced6'],
		[new THREE.BoxGeometry(0.06, 0.04, 0.027), '#d9534f', [0, 0.02, 0]],
		[new THREE.CylinderGeometry(0.005, 0.005, 0.06, 6), '#f2f2f2', [0.03, 0.11, 0]],
	]),
	pen: () => coloured([
		[new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8), '#2d5fa8'],
		[new THREE.ConeGeometry(0.006, 0.015, 8), '#e8e8e8', [0, -0.077, 0], [Math.PI, 0, 0]],
	]),
	tablet: () => coloured([
		[new THREE.BoxGeometry(0.24, 0.17, 0.01), '#1b1f26'],
		[new THREE.PlaneGeometry(0.22, 0.15), '#3a6ea8', [0, 0, 0.0055]],
	]),
	plush: () => coloured([
		[new THREE.SphereGeometry(0.06, 12, 8), '#e0b07a', [0, -0.05, 0]],
		[new THREE.SphereGeometry(0.045, 12, 8), '#e0b07a', [0, 0.05, 0]],
		[new THREE.SphereGeometry(0.018, 8, 6), '#e0b07a', [-0.035, 0.09, 0]],
		[new THREE.SphereGeometry(0.018, 8, 6), '#e0b07a', [0.035, 0.09, 0]],
		[new THREE.SphereGeometry(0.008, 6, 4), '#1a1a1a', [-0.015, 0.06, 0.04]],
		[new THREE.SphereGeometry(0.008, 6, 4), '#1a1a1a', [0.015, 0.06, 0.04]],
	]),
};

// Floating: about a centimetre per second, and a gentle push back when the
// path ahead (a few seconds of it) leaves the object's box or reaches the
// keep-out zone, so it slows down, stops and drifts back without a visible
// bounce.
const FLOAT_SPEED = [0.008, 0.014]; // m/s
const FLOAT_LOOKAHEAD = 4; // s
const FLOAT_MIN_LOOKAHEAD = 0.05; // m, so a stopped object still sees ahead
const FLOAT_PUSH = 0.004; // m/s²
const FLOAT_SPEED_EASE = 10; // s to get back to cruising speed

/**
 * Objects drifting slowly in zero gravity, each inside its own box, turning
 * slowly. `keepOut(point)` marks where they must never go (between the viewer
 * and the screen). Push into env.effects.
 */
export class FloatingObjects {
	/**
	 * @param {THREE.Object3D} parent
	 * @param {Array<{ kind: 'pouch' | 'pen' | 'tablet' | 'plush' | 'water', min: number[], max: number[] }>} objects
	 * @param {{ seed?: number, keepOut?: (point: THREE.Vector3) => boolean }} [options]
	 */
	constructor(parent, objects, { seed = 5, keepOut = () => false } = {}) {
		this.keepOut = keepOut;
		this.ahead = new THREE.Vector3();
		this.push = new THREE.Vector3();
		this.next = new THREE.Vector3();
		const rand = random(seed);
		const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
		const water = new THREE.MeshLambertMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.55, depthWrite: false });
		this.items = objects.map(({ kind, min, max }) => {
			const mesh = kind === 'water'
				? new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), water)
				: new THREE.Mesh(FLOATERS[kind](), solid);
			const lo = new THREE.Vector3(...min);
			const hi = new THREE.Vector3(...max);
			// Start somewhere in the box, never in the keep-out zone.
			for (let attempt = 0; attempt < 30; attempt++) {
				mesh.position.set(lo.x + rand() * (hi.x - lo.x), lo.y + rand() * (hi.y - lo.y), lo.z + rand() * (hi.z - lo.z));
				if (!keepOut(mesh.position)) break;
			}
			mesh.rotation.set(rand() * 6, rand() * 6, rand() * 6);
			parent.add(mesh);
			const heading = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
			const speed = FLOAT_SPEED[0] + rand() * (FLOAT_SPEED[1] - FLOAT_SPEED[0]);
			// A slow tumble.
			const spin = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.12);
			return { mesh, lo, hi, velocity: heading.clone().multiplyScalar(speed), heading, speed, spin, wobble: kind === 'water' ? rand() * 6 : null };
		});
	}

	tick(delta) {
		const dt = Math.min(delta, 100) / 1000;
		for (const item of this.items) {
			const { mesh, lo, hi, velocity, heading, spin } = item;
			// Where it is heading over the next seconds.
			const reach = Math.max(velocity.length() * FLOAT_LOOKAHEAD, FLOAT_MIN_LOOKAHEAD);
			this.ahead.copy(mesh.position).addScaledVector(heading, reach);
			this.push.set(0, 0, 0);
			for (const axis of ['x', 'y', 'z']) {
				if (this.ahead[axis] < lo[axis]) this.push[axis] += 1;
				else if (this.ahead[axis] > hi[axis]) this.push[axis] -= 1;
			}
			// Towards the screen's line of sight: push straight back.
			if (this.keepOut(this.ahead)) this.push.sub(heading);
			if (this.push.lengthSq() > 0) velocity.addScaledVector(this.push.normalize(), FLOAT_PUSH * dt);
			// Ease back to cruising speed, in whatever direction it now goes
			// (nearly stopped, it keeps its heading until the push turns it).
			const speed = velocity.length();
			if (speed > 0.002) {
				heading.copy(velocity).divideScalar(speed);
				velocity.copy(heading).multiplyScalar(speed + (item.speed - speed) * Math.min(1, dt / FLOAT_SPEED_EASE));
			}

			this.next.copy(mesh.position).addScaledVector(velocity, dt);
			// Last resort, never reached in practice: stay out of the zone.
			if (!this.keepOut(this.next)) mesh.position.copy(this.next);
			mesh.rotation.x += spin.x * dt;
			mesh.rotation.y += spin.y * dt;
			mesh.rotation.z += spin.z * dt;
			if (item.wobble !== null) {
				// A water globule wobbles as it floats.
				item.wobble += dt * 1.5;
				mesh.scale.set(1 + 0.08 * Math.sin(item.wobble), 1 - 0.06 * Math.sin(item.wobble), 1 + 0.05 * Math.cos(item.wobble * 1.3));
			}
		}
	}
}
