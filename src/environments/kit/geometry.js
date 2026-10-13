// Geometry helpers for environments.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Rounded box (soft edges catch the light, unlike sharp boxes). */
export function roundedBox(width, height, depth, radius = 0.02, segments = 2) {
	return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, width / 2, height / 2, depth / 2));
}

export function box(width, height, depth) {
	return new THREE.BoxGeometry(width, height, depth);
}

/** Box whose UVs are scaled to its size: textures tile in meters, `scale` per repeat. */
export function tiledBox(width, height, depth, scale = 1) {
	const geometry = new THREE.BoxGeometry(width, height, depth);
	const uv = geometry.attributes.uv;
	const normal = geometry.attributes.normal;
	for (let i = 0; i < uv.count; i++) {
		const nx = Math.abs(normal.getX(i));
		const ny = Math.abs(normal.getY(i));
		// Pick the two dimensions of the face the vertex belongs to.
		const [u, v] = nx > 0.5 ? [depth, height] : ny > 0.5 ? [width, depth] : [width, height];
		uv.setXY(i, (uv.getX(i) * u) / scale, (uv.getY(i) * v) / scale);
	}
	return geometry;
}

/** Plane with UVs in meters (`scale` per texture repeat). */
export function tiledPlane(width, height, scale = 1) {
	const geometry = new THREE.PlaneGeometry(width, height);
	const uv = geometry.attributes.uv;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * width) / scale, (uv.getY(i) * height) / scale);
	return geometry;
}

/**
 * A hanging curtain with real folds: a plane waved along its width. The folds
 * are deeper at the bottom, like heavy fabric.
 */
export function foldedCurtain(width, height, { folds = 8, depth = 0.12, segments = 64 } = {}) {
	const geometry = new THREE.PlaneGeometry(width, height, segments, 4);
	const position = geometry.attributes.position;
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i);
		const y = position.getY(i);
		const weight = 0.6 + 0.4 * (0.5 - y / height); // deeper folds at the bottom
		position.setZ(i, Math.sin((x / width) * Math.PI * 2 * folds) * depth * weight);
	}
	geometry.computeVertexNormals();
	return geometry;
}

/**
 * Stairs climbing along +z: `steps` steps of `rise` × `run`, `width` wide,
 * starting at the origin (the first step's front edge).
 */
export function stairs(width, steps, rise, run) {
	const parts = [];
	for (let i = 0; i < steps; i++) {
		const height = rise * (i + 1);
		const step = tiledBox(width, height, run, 1);
		step.translate(0, height / 2, run * i + run / 2);
		parts.push(step);
	}
	return merge(parts);
}

/** Merges geometries (any mix of indexed / non-indexed) into one. */
export function merge(geometries) {
	const prepared = geometries.map((g) => {
		const geometry = g.index ? g.toNonIndexed() : g;
		if (!geometry.attributes.uv) {
			geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
		}
		for (const name of Object.keys(geometry.attributes)) {
			if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
		}
		return geometry;
	});
	return mergeGeometries(prepared, false);
}

/**
 * A flat wall (facing +z, centered on x, from y = 0 up) with rectangular
 * openings (windows, doors): the wall is cut into the rectangles around them.
 * @param {Array<{ x: number, y: number, width: number, height: number }>} openings
 * centered x, bottom y
 */
export function wallWithOpenings(width, height, openings, scale = 1) {
	const breaks = new Set([-width / 2, width / 2]);
	for (const o of openings) {
		breaks.add(o.x - o.width / 2);
		breaks.add(o.x + o.width / 2);
	}
	const xs = [...breaks].sort((a, b) => a - b);
	const parts = [];
	for (let i = 0; i < xs.length - 1; i++) {
		const x0 = xs[i];
		const x1 = xs[i + 1];
		const mid = (x0 + x1) / 2;
		// Vertical spans of this column not covered by an opening.
		const holes = openings
			.filter((o) => mid > o.x - o.width / 2 && mid < o.x + o.width / 2)
			.map((o) => [o.y, o.y + o.height])
			.sort((a, b) => a[0] - b[0]);
		let y = 0;
		for (const [bottom, top] of [...holes, [height, height]]) {
			if (bottom > y) {
				const piece = tiledPlane(x1 - x0, bottom - y, scale);
				// Keep the texture continuous across pieces (UVs from wall coordinates).
				const uv = piece.attributes.uv;
				const pos = piece.attributes.position;
				for (let k = 0; k < uv.count; k++) uv.setXY(k, (pos.getX(k) + mid + width / 2) / scale, (pos.getY(k) + (y + bottom) / 2) / scale);
				piece.translate(mid, (y + bottom) / 2, 0);
				parts.push(piece);
			}
			y = Math.max(y, top);
		}
	}
	return merge(parts);
}
