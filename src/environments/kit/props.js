// Furniture and room props, added to a StaticBuilder (merged by material).
// Each prop takes the builder, its materials, a position and a rotation
// around the vertical axis. Props face -z by default (towards the screen).

import * as THREE from 'three';
import { box, roundedBox } from './geometry.js';
import { random } from './textures.js';

/** Places geometries relative to an origin and a rotation around y. */
export class Placer {
	constructor(builder, [x, y, z] = [0, 0, 0], rotationY = 0) {
		this.builder = builder;
		this.origin = new THREE.Matrix4().compose(
			new THREE.Vector3(x, y, z),
			new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
			new THREE.Vector3(1, 1, 1),
		);
	}

	/** Adds `geometry` at a local position / rotation. */
	add(geometry, material, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], { walkable = false } = {}) {
		geometry.applyMatrix4(new THREE.Matrix4().compose(
			new THREE.Vector3(x, y, z),
			new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
			new THREE.Vector3(1, 1, 1),
		));
		geometry.applyMatrix4(this.origin);
		this.builder.add(geometry, material, { walkable });
		return this;
	}

	/** World position of a local point. */
	point([x, y, z]) {
		return new THREE.Vector3(x, y, z).applyMatrix4(this.origin);
	}
}

/**
 * Sofa with `seats` cushions. Returns the world positions where a viewer sits
 * (for teleport snapping).
 * @param {{ fabric: THREE.Material, legs: THREE.Material }} m
 */
export function sofa(b, m, position, rotationY = 0, { seats = 3, seatWidth = 0.68, depth = 0.95 } = {}) {
	const p = new Placer(b, position, rotationY);
	const width = seats * seatWidth + 0.36;
	p.add(roundedBox(width, 0.3, depth, 0.04, 1), m.fabric, [0, 0.27, 0]);
	p.add(roundedBox(width, 0.55, 0.22, 0.08, 1), m.fabric, [0, 0.62, depth / 2 - 0.11], [-0.12, 0, 0]);
	for (const side of [-1, 1]) p.add(roundedBox(0.18, 0.4, depth, 0.07, 1), m.fabric, [side * (width / 2 - 0.09), 0.5, 0]);
	const spots = [];
	for (let i = 0; i < seats; i++) {
		const x = (i - (seats - 1) / 2) * seatWidth;
		p.add(roundedBox(seatWidth - 0.04, 0.14, depth - 0.3, 0.06, 1), m.fabric, [x, 0.48, -0.08]);
		p.add(roundedBox(seatWidth - 0.06, 0.42, 0.16, 0.08, 1), m.fabric, [x, 0.75, depth / 2 - 0.26], [-0.18, 0, 0]);
		spots.push(p.point([x, 0, 0]));
	}
	for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
		p.add(box(0.06, 0.12, 0.06), m.legs, [sx * (width / 2 - 0.08), 0.06, sz * (depth / 2 - 0.08)]);
	}
	return spots;
}

/** A single wide recliner. Returns the seat position. */
export function recliner(b, m, position, rotationY = 0) {
	const p = new Placer(b, position, rotationY);
	p.add(roundedBox(0.62, 0.32, 0.8, 0.06, 1), m.fabric, [0, 0.3, 0]);
	p.add(roundedBox(0.56, 0.16, 0.6, 0.07, 1), m.fabric, [0, 0.52, -0.06]);
	p.add(roundedBox(0.6, 0.72, 0.2, 0.09, 1), m.fabric, [0, 0.82, 0.34], [-0.2, 0, 0]);
	for (const side of [-1, 1]) p.add(roundedBox(0.16, 0.48, 0.82, 0.07, 1), m.fabric, [side * 0.38, 0.45, 0.02]);
	// Footrest, folded out.
	p.add(roundedBox(0.5, 0.1, 0.36, 0.04, 1), m.fabric, [0, 0.4, -0.55], [0.15, 0, 0]);
	p.add(box(0.7, 0.06, 0.7), m.legs, [0, 0.03, 0.05]);
	return p.point([0, 0, 0]);
}

/** Bookshelf with randomly sized books in a few colors. */
export function bookshelf(b, m, position, rotationY = 0, { width = 1.6, height = 2.2, depth = 0.34, shelves = 5, seed = 1 } = {}) {
	const p = new Placer(b, position, rotationY);
	const rand = random(seed);
	const t = 0.04;
	p.add(box(width, height, 0.02), m.wood, [0, height / 2, depth / 2 - 0.01]);
	for (const side of [-1, 1]) p.add(box(t, height, depth), m.wood, [side * (width / 2 - t / 2), height / 2, 0]);
	const spacing = (height - t) / shelves;
	for (let s = 0; s <= shelves; s++) {
		const y = t / 2 + s * spacing;
		p.add(box(width - 2 * t, t, depth), m.wood, [0, y, 0]);
		if (s === shelves) break;
		// Books on this shelf, with a few gaps and a leaning one.
		let x = -width / 2 + t + 0.02;
		while (x < width / 2 - t - 0.06) {
			const bw = 0.025 + rand() * 0.035;
			const bh = spacing * (0.55 + rand() * 0.35);
			if (rand() < 0.08) {
				x += 0.08;
				continue;
			}
			const material = m.books[Math.floor(rand() * m.books.length)];
			p.add(box(bw, bh, depth * (0.65 + rand() * 0.25)), material, [x + bw / 2, y + t / 2 + bh / 2, 0.02]);
			x += bw + 0.003;
		}
	}
}

/** Floor lamp with a glowing shade (`m.lampShade` is a light fixture). */
export function floorLamp(b, m, position, { height = 1.6 } = {}) {
	const p = new Placer(b, position);
	p.add(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), m.metal, [0, 0.02, 0]);
	p.add(new THREE.CylinderGeometry(0.015, 0.015, height, 8), m.metal, [0, height / 2, 0]);
	p.add(new THREE.CylinderGeometry(0.16, 0.24, 0.32, 20, 1, true), m.lampShade, [0, height + 0.05, 0]);
}

/** Table lamp. */
export function tableLamp(b, m, position) {
	const p = new Placer(b, position);
	p.add(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 12), m.metal, [0, 0.1, 0]);
	p.add(new THREE.CylinderGeometry(0.1, 0.15, 0.2, 16, 1, true), m.lampShade, [0, 0.3, 0]);
}

/** Potted plant: a pot and a cluster of low-poly leaves. */
export function plant(b, m, position, { size = 1, seed = 1 } = {}) {
	const p = new Placer(b, position);
	const rand = random(seed);
	p.add(new THREE.CylinderGeometry(0.17 * size, 0.13 * size, 0.32 * size, 12), m.pot, [0, 0.16 * size, 0]);
	for (let i = 0; i < 6; i++) {
		const r = (0.14 + rand() * 0.12) * size;
		const leaf = new THREE.IcosahedronGeometry(r, 0);
		p.add(leaf, m.leaves, [(rand() - 0.5) * 0.3 * size, (0.45 + rand() * 0.55) * size, (rand() - 0.5) * 0.3 * size]);
	}
}

/** Low table. */
export function table(b, m, position, rotationY = 0, { width = 1.1, depth = 0.6, height = 0.42 } = {}) {
	const p = new Placer(b, position, rotationY);
	p.add(roundedBox(width, 0.05, depth, 0.015, 1), m.wood, [0, height - 0.025, 0]);
	for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
		p.add(box(0.05, height - 0.05, 0.05), m.wood, [sx * (width / 2 - 0.06), (height - 0.05) / 2, sz * (depth / 2 - 0.06)]);
	}
}

/** Flat rug, just above the floor (walkable). */
export function rug(b, material, position, rotationY = 0, { width = 3, depth = 2 } = {}) {
	const p = new Placer(b, position, rotationY);
	p.add(new THREE.PlaneGeometry(width, depth), material, [0, 0.006, 0], [-Math.PI / 2, 0, 0], { walkable: true });
}

/** Tower speaker. */
export function speaker(b, m, position, rotationY = 0, { height = 1.1 } = {}) {
	const p = new Placer(b, position, rotationY);
	p.add(roundedBox(0.26, height, 0.32, 0.02, 1), m.cabinet, [0, height / 2, 0]);
	p.add(new THREE.PlaneGeometry(0.22, height - 0.08), m.grille, [0, height / 2, -0.161], [0, Math.PI, 0]);
}
