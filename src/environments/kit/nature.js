// Nature for outdoor environments: tree trunks and roots, ropes and vines,
// plants drawn as instanced leaf cards, and fireflies.

import * as THREE from 'three';
import { foliage, glow, random } from './textures.js';

/**
 * A tree trunk from the ground (origin) up: irregular, tapered and slightly
 * bent, its UVs in meters (`scale` per bark texture repeat).
 * @param {{ height: number, radius: number, top?: number, bend?: number, seed?: number, scale?: number }} options
 * top: radius at the top; bend: sideways drift of the top (m)
 */
export function trunk({ height, radius, top = radius * 0.55, bend = 0.3, seed = 1, scale = 1.5 }) {
	const rand = random(seed);
	const radial = 12;
	const rows = Math.max(4, Math.round(height / 1.5));
	const geometry = new THREE.CylinderGeometry(1, 1, height, radial, rows, true);
	geometry.translate(0, height / 2, 0);
	const position = geometry.attributes.position;
	const uv = geometry.attributes.uv;
	const phase = [rand() * 6, rand() * 6, rand() * 6];
	const drift = rand() * Math.PI * 2;
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i);
		const z = position.getZ(i);
		const y = position.getY(i);
		const t = y / height;
		const angle = Math.atan2(z, x);
		// Flared at the foot, lumpy all along.
		const lumps = 1 + 0.08 * Math.sin(angle * 3 + phase[0] + t * 4) + 0.05 * Math.sin(angle * 5 + phase[1]);
		const flare = 1 + 0.6 * Math.max(0, 1 - t * 8) ** 2;
		const r = (radius + (top - radius) * t) * lumps * flare;
		const sway = bend * Math.sin(t * Math.PI * 0.5) ** 2;
		position.setXYZ(i, Math.cos(angle) * r + Math.cos(drift) * sway, y, Math.sin(angle) * r + Math.sin(drift) * sway + 0.15 * bend * Math.sin(t * 5 + phase[2]));
		uv.setXY(i, (uv.getX(i) * 2 * Math.PI * radius) / scale, y / scale);
	}
	geometry.computeVertexNormals();
	return geometry;
}

/**
 * Buttress roots: thin fins spreading from the foot of a trunk, highest
 * against it and sloping down to the ground.
 */
export function buttressRoots({ radius, count = 5, height = 1.4, reach = 1.3, seed = 1 }) {
	const rand = random(seed);
	const parts = [];
	const start = rand() * Math.PI * 2;
	for (let i = 0; i < count; i++) {
		const length = reach * (0.6 + rand() * 0.6);
		const tall = height * (0.6 + rand() * 0.5);
		const fin = new THREE.BoxGeometry(length, tall, 0.09, 6, 1, 1);
		fin.translate(length / 2, tall / 2, 0);
		const position = fin.attributes.position;
		for (let k = 0; k < position.count; k++) {
			const x = position.getX(k);
			const t = Math.min(1, Math.max(0, x / length));
			// Concave slope from the trunk to the tip, which sinks into the ground.
			position.setY(k, position.getY(k) * (1 - t) ** 1.8 - 0.05 * t);
			position.setZ(k, position.getZ(k) * (1.6 - t) + Math.sin(t * 3 + i) * 0.08);
		}
		fin.computeVertexNormals();
		fin.translate(radius * 0.7, 0, 0);
		fin.rotateY(start + (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.6);
		parts.push(fin);
	}
	return parts;
}

/** A rope or vine along `points` (a smooth curve through them). */
export function rope(points, radius = 0.012, { segments = 0, radial = 5 } = {}) {
	const curve = new THREE.CatmullRomCurve3(points);
	const count = segments || Math.max(2, Math.round(curve.getLength() * 6));
	return new THREE.TubeGeometry(curve, count, radius, radial, false);
}

/** Points of a rope hanging between `a` and `b`, sagging by `sag` in the middle. */
export function sagging(a, b, sag, count = 12) {
	const points = [];
	for (let i = 0; i <= count; i++) {
		const t = i / count;
		points.push(new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t)));
	}
	return points;
}

/** A leaf card: a plane hinged at its bottom edge, arching forward (+z). */
function leafCard(arch) {
	const geometry = new THREE.PlaneGeometry(1, 1, 1, 4);
	geometry.translate(0, 0.5, 0);
	const position = geometry.attributes.position;
	for (let i = 0; i < position.count; i++) {
		const y = position.getY(i);
		position.setZ(i, arch * y * y);
	}
	geometry.computeVertexNormals();
	return geometry;
}

/**
 * Plants as leaf cards: every leaf is an instance of one card per foliage
 * kind (one draw call per kind), tinted per leaf.
 */
export class PlantCards {
	constructor() {
		/** @type {Map<string, Array<{ matrix: THREE.Matrix4, color: THREE.Color }>>} */
		this.leaves = new Map();
		this.rand = random(101);
	}

	/**
	 * Adds one leaf card.
	 * @param {'frond' | 'broad' | 'canopy'} kind
	 * @param {THREE.Vector3} base where the leaf starts
	 * @param {THREE.Quaternion} rotation the card's up is its length, +z its face
	 * @param {[number, number]} size width, length
	 * @param {string | THREE.Color} color
	 */
	leaf(kind, base, rotation, [width, length], color) {
		if (!this.leaves.has(kind)) this.leaves.set(kind, []);
		const tint = new THREE.Color(color).multiplyScalar(0.8 + this.rand() * 0.35);
		this.leaves.get(kind).push({ matrix: new THREE.Matrix4().compose(base, rotation, new THREE.Vector3(width, length, length)), color: tint });
	}

	/**
	 * A plant: `count` leaves fanning out of the ground at `base`, rising at
	 * `rise` (radians from the horizontal) and arching over.
	 */
	plant(kind, base, { count = 6, size = [0.5, 1.2], rise = 0.9, color = '#5f8a3a', seed = 1 } = {}) {
		const rand = random(seed);
		const start = rand() * Math.PI * 2;
		for (let i = 0; i < count; i++) {
			const yaw = start + (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.5;
			const tilt = Math.PI / 2 - rise * (0.75 + rand() * 0.5);
			const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, (rand() - 0.5) * 0.4, 'YXZ'));
			const scale = 0.75 + rand() * 0.5;
			this.leaf(kind, base, rotation, [size[0] * scale, size[1] * scale], color);
		}
	}

	/**
	 * A clump of foliage (`canopy` cards in several directions) around
	 * `center`, as tree crowns are seen from below.
	 */
	clump(center, { size = 4, cards = 3, color = '#3f6b32', seed = 1 } = {}) {
		const rand = random(seed);
		for (let i = 0; i < cards; i++) {
			const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (rand() - 0.5) * 1.2, rand() * Math.PI * 2, (rand() - 0.5) * 1.2, 'YXZ'));
			const s = size * (0.7 + rand() * 0.6);
			// Cards are hinged at the bottom: center them on the clump.
			const offset = new THREE.Vector3(0, -s / 2, 0).applyQuaternion(rotation);
			const jitter = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.5, rand() - 0.5).multiplyScalar(size * 0.4);
			this.leaf('canopy', center.clone().add(offset).add(jitter), rotation, [s, s], color);
		}
	}

	/** One instanced mesh per foliage kind. */
	build() {
		const group = new THREE.Group();
		const arches = { frond: 0.25, broad: 0.35, canopy: 0.05 };
		for (const [kind, leaves] of this.leaves) {
			const material = new THREE.MeshLambertMaterial({ map: foliage(kind), alphaTest: 0.5, side: THREE.DoubleSide });
			const mesh = new THREE.InstancedMesh(leafCard(arches[kind]), material, leaves.length);
			leaves.forEach(({ matrix, color }, i) => {
				mesh.setMatrixAt(i, matrix);
				mesh.setColorAt(i, color);
			});
			mesh.computeBoundingSphere();
			group.add(mesh);
		}
		return group;
	}
}

/**
 * Fireflies: glowing dots wandering slowly and blinking, animated on the GPU
 * (one draw call). Billboards built in view space, so both eyes agree (GPU
 * points are unreliable in headsets). Push into env.effects.
 */
export class Fireflies {
	/**
	 * @param {THREE.Object3D} parent
	 * @param {THREE.Vector3[]} spots where each firefly wanders around
	 * @param {{ color?: string, size?: number, roam?: number, seed?: number }} [options]
	 */
	constructor(parent, spots, { color = '#d4ff6a', size = 0.035, roam = 0.6, seed = 7 } = {}) {
		const rand = random(seed);
		const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
		const count = spots.length;
		const centers = new Float32Array(count * 18);
		const offsets = new Float32Array(count * 12);
		const params = new Float32Array(count * 24);
		spots.forEach((spot, i) => {
			// Wandering speeds, phases and blink rhythm.
			const p = [0.15 + rand() * 0.25, rand() * 6.28, 0.4 + rand() * 0.5, 0.6 + rand() * 0.8];
			corners.forEach(([cx, cy], k) => {
				centers.set([spot.x, spot.y, spot.z], (i * 6 + k) * 3);
				offsets.set([cx, cy], (i * 6 + k) * 2);
				params.set(p, (i * 6 + k) * 4);
			});
		});
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(centers, 3));
		geometry.setAttribute('corner', new THREE.BufferAttribute(offsets, 2));
		geometry.setAttribute('params', new THREE.BufferAttribute(params, 4));
		this.material = new THREE.ShaderMaterial({
			uniforms: {
				map: { value: glow() },
				color: { value: new THREE.Color(color) },
				time: { value: 0 },
				size: { value: size },
				roam: { value: roam },
			},
			vertexShader: `
				attribute vec2 corner;
				attribute vec4 params;
				uniform float time;
				uniform float size;
				uniform float roam;
				varying vec2 vUv;
				varying float vLight;
				void main() {
					float speed = params.x;
					float phase = params.y;
					vec3 wander = vec3(
						sin(time * speed + phase) + 0.5 * sin(time * speed * 2.3 + phase * 3.0),
						0.5 * sin(time * speed * 1.7 + phase * 2.0),
						cos(time * speed * 0.8 + phase) + 0.5 * sin(time * speed * 1.9 + phase)
					) * roam;
					vec4 center = modelViewMatrix * vec4(position + wander, 1.0);
					// A slow glow that swells and fades, then rests dark.
					float pulse = sin(time * params.z + phase * 5.0);
					vLight = smoothstep(0.2, 1.0, pulse) * params.w;
					center.xy += corner * size * (0.6 + 0.4 * vLight);
					vUv = corner * 0.5 + 0.5;
					gl_Position = projectionMatrix * center;
				}`,
			fragmentShader: `
				uniform sampler2D map;
				uniform vec3 color;
				varying vec2 vUv;
				varying float vLight;
				void main() {
					gl_FragColor = vec4(color * texture2D(map, vUv).a * vLight, 1.0);
					#include <colorspace_fragment>
				}`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		});
		this.mesh = new THREE.Mesh(geometry, this.material);
		this.mesh.frustumCulled = false;
		parent.add(this.mesh);
		this.time = 0;
	}

	tick(delta) {
		this.time += Math.min(delta, 100) / 1000;
		this.material.uniforms.time.value = this.time;
	}
}

/**
 * The edge of a forest seen from inside it: a ring of rounded crown
 * silhouettes at `distance`, between `low` and `high` meters tall.
 */
export function treeline({ distance = 40, low = 10, high = 20, color = '#060b0a', seed = 1, segments = 480 } = {}) {
	const rand = random(seed);
	const crowns = [];
	for (let angle = 0; angle < Math.PI * 2; angle += 0.04 + rand() * 0.06) {
		crowns.push({ angle, width: 0.04 + rand() * 0.07, top: low + rand() * (high - low) });
	}
	const heightAt = (angle) => {
		let h = low * 0.7;
		for (const crown of crowns) {
			let d = Math.abs(angle - crown.angle);
			d = Math.min(d, Math.PI * 2 - d) / crown.width;
			if (d < 1) h = Math.max(h, crown.top - crown.width * distance * 0.35 * (1 - Math.sqrt(1 - d * d)));
		}
		return h;
	};
	const positions = [];
	for (let i = 0; i < segments; i++) {
		const a0 = (i / segments) * Math.PI * 2;
		const a1 = ((i + 1) / segments) * Math.PI * 2;
		const [x0, z0, x1, z1] = [Math.cos(a0) * distance, Math.sin(a0) * distance, Math.cos(a1) * distance, Math.sin(a1) * distance];
		const [h0, h1] = [heightAt(a0), heightAt(a1)];
		positions.push(x0, -1, z0, x1, -1, z1, x1, h1, z1, x0, -1, z0, x1, h1, z1, x0, h0, z0);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
}
