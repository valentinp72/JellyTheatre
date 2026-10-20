// An open fire: burning logs, animated flames and a flickering warm light.
// It keeps burning during the film (slightly lower), and is not affected by
// the room brightness setting: it is a real fire.

import * as THREE from 'three';
import { flame, glow } from './textures.js';

export class Fire {
	/**
	 * @param {THREE.Object3D} parent
	 * @param {object} options
	 * @param {THREE.Vector3} options.position base of the fire
	 * @param {number} [options.width]
	 * @param {import('./lighting.js').EnvironmentLighting} [options.lighting] to dim a little during the film
	 * @param {number} [options.intensity] of its light
	 */
	constructor(parent, { position, width = 0.8, lighting = null, intensity = 2.6 }) {
		this.lighting = lighting;
		this.intensity = intensity;
		this.group = new THREE.Group();
		this.group.position.copy(position);
		this.time = 0;

		// Logs.
		const bark = new THREE.MeshLambertMaterial({ color: '#2e1c10' });
		for (const [x, rz, ry] of [[-0.12, 0.1, 0.3], [0.14, -0.08, -0.25], [0, 0, 1.4]]) {
			const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, width * 0.9, 8), bark);
			log.rotation.set(0, ry, Math.PI / 2 + rz);
			log.position.set(x, 0.08, 0);
			this.group.add(log);
		}
		// Embers glowing under the logs.
		const embers = new THREE.Mesh(
			new THREE.PlaneGeometry(width, width * 0.5),
			new THREE.MeshBasicMaterial({ map: glow(), color: '#ff5a1a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
		);
		embers.rotation.x = -Math.PI / 2;
		embers.position.y = 0.02;
		this.group.add(embers);

		// Flames: additive sprites that waver and change size.
		const texture = flame();
		this.flames = [];
		const count = 7;
		for (let i = 0; i < count; i++) {
			const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
				map: texture,
				color: i % 3 === 0 ? '#ffd27a' : '#ff9a3c',
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
			}));
			const x = (i / (count - 1) - 0.5) * width * 0.75;
			const size = 0.3 + Math.random() * 0.2;
			sprite.userData = { x, size, phase: Math.random() * 10, speed: 5 + Math.random() * 4 };
			sprite.position.set(x, 0.15 + size * 0.45, 0);
			this.flames.push(sprite);
			this.group.add(sprite);
		}

		this.light = new THREE.PointLight('#ff8a3d', 2.5, 7, 1.6);
		this.light.position.set(0, 0.5, 0.25);
		this.group.add(this.light);
		parent.add(this.group);
	}

	tick(delta) {
		this.time += Math.min(delta, 100) / 1000;
		const t = this.time;
		for (const sprite of this.flames) {
			const { x, size, phase, speed } = sprite.userData;
			const flicker = 0.75 + 0.25 * Math.sin(t * speed + phase) * Math.sin(t * speed * 1.7 + phase * 2);
			const h = size * (0.8 + 0.4 * flicker);
			sprite.scale.set(size * 0.55 * (1.1 - flicker * 0.2), h, 1);
			sprite.position.set(x + Math.sin(t * 3 + phase) * 0.02, 0.12 + h * 0.45, 0);
			sprite.material.opacity = 0.65 + 0.35 * flicker;
		}
		// Flickering light: a few incommensurate waves (no visible pattern).
		const flicker = 0.8 + 0.12 * Math.sin(t * 7.3) + 0.08 * Math.sin(t * 13.1 + 1) + 0.06 * Math.sin(t * 23.7 + 2);
		const filmFactor = this.lighting ? 0.7 + 0.3 * this.lighting.level : 1;
		this.light.intensity = this.intensity * flicker * filmFactor;
	}
}
