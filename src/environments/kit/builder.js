// Collects the static parts of an environment and merges them into one mesh
// per material: a whole room in a handful of draw calls (important on a
// standalone headset).

import * as THREE from 'three';
import { merge } from './geometry.js';

export class StaticBuilder {
	constructor() {
		/** @type {Map<THREE.Material, { walkable: THREE.BufferGeometry[], other: THREE.BufferGeometry[] }>} */
		this.parts = new Map();
	}

	/**
	 * Adds a piece of geometry, placed with the given transform.
	 * @param {THREE.BufferGeometry} geometry (consumed: transformed in place)
	 * @param {THREE.Material} material
	 * @param {object} [options]
	 * @param {[number, number, number]} [options.position]
	 * @param {[number, number, number]} [options.rotation] Euler angles in radians
	 * @param {[number, number, number]} [options.scale]
	 * @param {boolean} [options.walkable] can be teleported onto (its upward faces)
	 */
	add(geometry, material, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], walkable = false } = {}) {
		const matrix = new THREE.Matrix4().compose(
			new THREE.Vector3(...position),
			new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
			new THREE.Vector3(...scale),
		);
		geometry.applyMatrix4(matrix);
		if (!this.parts.has(material)) this.parts.set(material, { walkable: [], other: [] });
		this.parts.get(material)[walkable ? 'walkable' : 'other'].push(geometry);
		return this;
	}

	/** Merges everything into a group (one mesh per material and walkability). */
	build() {
		const group = new THREE.Group();
		for (const [material, { walkable, other }] of this.parts) {
			for (const [list, isWalkable] of [[walkable, true], [other, false]]) {
				if (!list.length) continue;
				const mesh = new THREE.Mesh(merge(list), material);
				mesh.userData.teleport = isWalkable;
				mesh.matrixAutoUpdate = false;
				mesh.updateMatrix();
				group.add(mesh);
			}
		}
		this.parts.clear();
		return group;
	}
}
