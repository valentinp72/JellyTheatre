// Rain on window panes, and falling outside.
//
// On the glass: drops cling, then slide down at their own speed (stretched
// while they move), pause, slide again, and re-form at the top when they reach
// the bottom; small beads appear, stay a while and fade. Outside: thin
// slanted streaks falling. Instanced: a few draw calls in total.

import * as THREE from 'three';
import { droplet } from './textures.js';

export class WindowRain {
	/**
	 * @param {THREE.Object3D} parent
	 * @param {object} options
	 * @param {Array<{ center: THREE.Vector3, width: number, height: number, rotationY: number }>} options.panes
	 * window panes, facing the room (a pane's +z, once rotated, points inside)
	 * @param {Array<{ min: THREE.Vector3, max: THREE.Vector3 }>} [options.outside] boxes where it rains outside
	 */
	constructor(parent, { panes, outside = null, dropsPerPane = 26, beadsPerPane = 45, seed = 1 }) {
		let s = seed;
		this.rand = () => {
			s = (s * 1664525 + 1013904223) >>> 0;
			return s / 4294967296;
		};
		this.panes = panes.map((pane) => ({
			...pane,
			matrix: new THREE.Matrix4().compose(
				pane.center,
				new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pane.rotationY),
				new THREE.Vector3(1, 1, 1),
			),
		}));

		const material = new THREE.MeshBasicMaterial({ map: droplet(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
		const quad = new THREE.PlaneGeometry(1, 1);
		this.drops = [];
		this.beads = [];
		for (const [index, pane] of this.panes.entries()) {
			for (let i = 0; i < dropsPerPane; i++) this.drops.push(this.newDrop(index, pane, true));
			for (let i = 0; i < beadsPerPane; i++) this.beads.push(this.newBead(index, pane, true));
		}
		this.dropMesh = new THREE.InstancedMesh(quad, material, this.drops.length);
		this.beadMesh = new THREE.InstancedMesh(quad, material, this.beads.length);
		for (const mesh of [this.dropMesh, this.beadMesh]) {
			mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
			mesh.frustumCulled = false;
			parent.add(mesh);
		}

		this.outside = outside ? this.buildOutside(parent, outside) : null;
		this.matrix = new THREE.Matrix4();
		this.tick(0);
	}

	newDrop(paneIndex, pane, anywhere) {
		const rand = this.rand;
		return {
			pane: paneIndex,
			x: (rand() - 0.5) * pane.width * 0.94,
			y: anywhere ? (rand() - 0.5) * pane.height : pane.height / 2 - 0.02,
			size: 0.012 + rand() * 0.018,
			speed: 0,
			// Clinging for a while before the first slide.
			pause: rand() * 6,
			brightness: 0.5 + rand() * 0.5,
		};
	}

	newBead(paneIndex, pane, anywhere) {
		const rand = this.rand;
		return {
			pane: paneIndex,
			x: (rand() - 0.5) * pane.width * 0.96,
			y: (rand() - 0.5) * pane.height * 0.96,
			size: 0.004 + rand() * 0.007,
			life: anywhere ? rand() * 8 : 0,
			duration: 4 + rand() * 8,
		};
	}

	tick(delta) {
		const dt = Math.min(delta, 100) / 1000;
		const rand = this.rand;
		const color = new THREE.Color();
		const position = new THREE.Vector3();
		const scale = new THREE.Vector3();

		this.drops.forEach((drop, i) => {
			const pane = this.panes[drop.pane];
			if (drop.pause > 0) {
				drop.pause -= dt;
				drop.speed = 0;
			} else {
				// Sliding: accelerate towards its own pace, sometimes stopping again.
				const target = 0.05 + drop.size * 14;
				drop.speed += (target - drop.speed) * Math.min(1, dt * 3);
				drop.y -= drop.speed * dt;
				drop.x += Math.sin(drop.y * 40 + i) * 0.002;
				if (rand() < dt * 0.35) drop.pause = 0.3 + rand() * 2.5;
			}
			if (drop.y < -pane.height / 2 + 0.02) this.drops[i] = this.newDrop(drop.pane, pane, false);
			const d = this.drops[i];
			const stretch = 1 + d.speed * 6;
			position.set(d.x, d.y + (d.size * (stretch - 1)) / 2, 0.006).applyMatrix4(pane.matrix);
			scale.set(d.size, d.size * stretch, 1);
			this.matrix.compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pane.rotationY), scale);
			this.dropMesh.setMatrixAt(i, this.matrix);
			this.dropMesh.setColorAt(i, color.setScalar(d.brightness));
		});

		this.beads.forEach((bead, i) => {
			const pane = this.panes[bead.pane];
			bead.life += dt;
			if (bead.life > bead.duration) this.beads[i] = this.newBead(bead.pane, pane, false);
			const b = this.beads[i];
			// Fade in, stay, fade out.
			const t = b.life / b.duration;
			const alpha = Math.min(1, t * 5) * Math.min(1, (1 - t) * 4);
			position.set(b.x, b.y, 0.005).applyMatrix4(pane.matrix);
			scale.setScalar(b.size);
			this.matrix.compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pane.rotationY), scale);
			this.beadMesh.setMatrixAt(i, this.matrix);
			this.beadMesh.setColorAt(i, color.setScalar(0.7 * alpha));
		});
		for (const mesh of [this.dropMesh, this.beadMesh]) {
			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;
		}

		if (this.outside) this.tickOutside(dt);
	}

	buildOutside(parent, boxes, perBox = 260) {
		const rand = this.rand;
		const streaks = [];
		for (const { min, max } of boxes) {
			for (let i = 0; i < perBox; i++) {
				streaks.push({
					min,
					max,
					x: min.x + rand() * (max.x - min.x),
					y: min.y + rand() * (max.y - min.y),
					z: min.z + rand() * (max.z - min.z),
					length: 0.25 + rand() * 0.3,
					speed: 6 + rand() * 3,
				});
			}
		}
		const positions = new Float32Array(streaks.length * 6);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#8fa3c0', transparent: true, opacity: 0.35, depthWrite: false }));
		lines.frustumCulled = false;
		parent.add(lines);
		return { lines, streaks };
	}

	tickOutside(dt) {
		const { lines, streaks } = this.outside;
		const positions = lines.geometry.attributes.position.array;
		const wind = 0.18; // horizontal drift per vertical meter
		streaks.forEach((s, i) => {
			const { min, max } = s;
			s.y -= s.speed * dt;
			s.x -= s.speed * dt * wind;
			if (s.y < min.y) {
				s.y = max.y;
				s.x = min.x + this.rand() * (max.x - min.x);
			}
			if (s.x < min.x) s.x += max.x - min.x;
			positions.set([s.x, s.y, s.z, s.x + s.length * wind, s.y + s.length, s.z], i * 6);
		});
		lines.geometry.attributes.position.needsUpdate = true;
	}
}
