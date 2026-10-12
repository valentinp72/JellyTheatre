// Cinema seats: a seat model (upholstery + frame) drawn for every seat with
// two instanced meshes, laid out in rows. Knows where every seat is, to snap
// teleports onto them.

import * as THREE from 'three';
import { merge, roundedBox } from './geometry.js';

/**
 * A cinema seat, origin on the floor at the seat's center, facing -z (the
 * screen). Its left armrest belongs to it; the row's last right armrest is
 * the separate `end` piece.
 */
export function cinemaSeat({ width = 0.62 } = {}) {
	// Low-poly on purpose (one bevel segment): ~450 triangles per seat, and a
	// theatre has hundreds of them. The back stops at 1.1 m, so the row behind
	// still sees the bottom of the screen.
	const inner = width - 0.09;
	const cushion = roundedBox(inner, 0.13, 0.5, 0.04, 1);
	cushion.rotateX(0.05);
	cushion.translate(0, 0.45, -0.02);
	const back = roundedBox(inner, 0.64, 0.13, 0.05, 1);
	back.rotateX(-0.15);
	back.translate(0, 0.8, 0.28);

	const armrest = () => {
		const top = roundedBox(0.075, 0.05, 0.54, 0.02, 1);
		top.translate(0, 0.67, 0.01);
		const panel = roundedBox(0.05, 0.64, 0.56, 0.02, 1);
		panel.translate(0, 0.32, 0.03);
		const cup = new THREE.CylinderGeometry(0.04, 0.033, 0.06, 8, 1, true);
		cup.translate(0, 0.66, -0.24);
		return [top, panel, cup];
	};
	const left = armrest().map((g) => g.translate(-width / 2, 0, 0));
	return {
		fabric: merge([cushion, back]),
		frame: merge(left),
		end: merge(armrest()),
		width,
	};
}

export class SeatRows {
	/**
	 * @param {object} options
	 * @param {Array<{ z: number, floor: number, xs: number[] }>} options.rows seat centers per row
	 * @param {ReturnType<typeof cinemaSeat>} options.model
	 * @param {THREE.Material} options.fabric
	 * @param {THREE.Material} options.frame
	 * @param {number} [options.blockGap] distance between seats above which a new block (and armrest) starts
	 */
	constructor({ rows, model, fabric, frame, blockGap }) {
		this.seats = [];
		const gap = blockGap ?? model.width * 1.5;
		const ends = [];
		for (const row of rows) {
			const xs = [...row.xs].sort((a, b) => a - b);
			xs.forEach((x, i) => {
				this.seats.push(new THREE.Vector3(x, row.floor, row.z));
				// Close each block with a right armrest.
				if (i === xs.length - 1 || xs[i + 1] - x > gap) ends.push(new THREE.Vector3(x + model.width / 2, row.floor, row.z));
			});
		}

		this.group = new THREE.Group();
		const matrix = new THREE.Matrix4();
		const place = (mesh, positions) => {
			positions.forEach((p, i) => mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)));
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			this.group.add(mesh);
		};
		place(new THREE.InstancedMesh(model.fabric, fabric, this.seats.length), this.seats);
		place(new THREE.InstancedMesh(model.frame, frame, this.seats.length), this.seats);
		place(new THREE.InstancedMesh(model.end, frame, ends.length), ends);
	}

	/** The seat nearest to `point` (horizontally) if within `maxDistance`, else null. */
	snap(point, maxDistance = 0.7) {
		let best = null;
		let bestDistance = maxDistance;
		for (const seat of this.seats) {
			const distance = Math.hypot(seat.x - point.x, seat.z - point.z);
			if (distance < bestDistance && Math.abs(seat.y - point.y) < 0.6) {
				best = seat;
				bestDistance = distance;
			}
		}
		return best?.clone() ?? null;
	}
}
