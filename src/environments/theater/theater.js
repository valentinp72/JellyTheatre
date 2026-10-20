// The movie theatre: stadium seating in a centre block and two side blocks,
// aisles with lit steps, acoustic wall bays with sconces and surround
// speakers, a stage with a proscenium and folded curtains, exit doors, a lit
// ceiling, and a projection booth whose beam takes the picture's color.
//
// Built from the environment kit (src/environments/kit/): static parts are
// merged by material, seats are instanced. Coordinates: the screen wall faces
// +z, the viewer looks towards -z.

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { defineEnvironment } from '../kit/environment.js';
import { box, foldedCurtain, tiledBox, tiledPlane } from '../kit/geometry.js';
import { EnvironmentLighting, glowMaterial, projectorBeam } from '../kit/lighting.js';
import { cinemaSeat, SeatRows } from '../kit/seating.js';
import * as textures from '../kit/textures.js';

const ROOM = { halfWidth: 10, front: -14, back: 12, height: 11 };
const SCREEN = { x: 0, y: 4.9, z: -13.3, maxWidth: 12.5, maxHeight: 7 };
const STAGE = { top: 1, front: -12 };

// Stadium seating: every row is 40 cm above the previous one, enough for the
// row in front never to hide the bottom of the screen.
const ROWS = 12;
const ROW_PITCH = 1.15;
const FIRST_ROW_Z = -6.4;
const RISE = 0.4;
const SEAT_WIDTH = 0.62;
const CENTER_SEATS = 15;
const SIDE_SEATS = 5;
const AISLE_WIDTH = 1.3;
const VIEWER_ROW = 6;

const rowZ = (row) => FIRST_ROW_Z + row * ROW_PITCH;
const rowFloor = (row) => row * RISE;

const centerHalf = (CENTER_SEATS * SEAT_WIDTH) / 2;
const aisles = [-1, 1].map((side) => {
	const inner = side * centerHalf;
	const outer = side * (centerHalf + AISLE_WIDTH);
	return { from: Math.min(inner, outer), to: Math.max(inner, outer) };
});
/** Seating segments across the room: blocks and aisles (aisles have half-steps). */
const SEGMENTS = [
	{ from: -ROOM.halfWidth, to: aisles[0].from, aisle: false },
	{ ...aisles[0], aisle: true },
	{ from: aisles[0].to, to: aisles[1].from, aisle: false },
	{ ...aisles[1], aisle: true },
	{ from: aisles[1].to, to: ROOM.halfWidth, aisle: false },
];

export const theaterLayout = {
	screen: { position: { x: SCREEN.x, y: SCREEN.y, z: SCREEN.z }, maxWidth: SCREEN.maxWidth, maxHeight: SCREEN.maxHeight },
	// Rig position: floor of the middle seat of the viewer row.
	seat: { x: 0, y: rowFloor(VIEWER_ROW), z: rowZ(VIEWER_ROW) },
	// Lit by the picture (see the "Screen light" setting).
	screenLight: true,
};

function seatPositions() {
	const sideStart = centerHalf + AISLE_WIDTH + SEAT_WIDTH / 2;
	const xs = [];
	for (let i = 0; i < CENTER_SEATS; i++) xs.push((i - (CENTER_SEATS - 1) / 2) * SEAT_WIDTH);
	for (let i = 0; i < SIDE_SEATS; i++) {
		const x = sideStart + i * SEAT_WIDTH;
		xs.push(x, -x);
	}
	return Array.from({ length: ROWS }, (_, row) => ({ z: rowZ(row), floor: rowFloor(row), xs }));
}

defineEnvironment('theater', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);

		const m = {
			carpet: lambert({ map: textures.carpet() }),
			wall: lambert({ color: '#3c383b' }),
			acoustic: lambert({ map: textures.acousticPanel('#57505a') }),
			wood: lambert({ map: textures.wood('#4a2f20') }),
			dark: lambert({ color: '#151315' }),
			black: basic({ color: '#050405' }),
			trim: lambert({ color: '#2a2729' }),
			velvet: lambert({ map: textures.velvet('#8a1c2b'), side: THREE.DoubleSide }),
			ceiling: lambert({ map: textures.ceilingTiles('#2a272b') }),
			speaker: lambert({ map: textures.grille() }),
			seatFabric: lambert({ map: textures.fabric('#7a4a52') }),
			seatFrame: lambert({ color: '#262325' }),
			// Light fixtures (emissive, dim with the house lights).
			sconce: basic({ color: '#ffd9a3' }),
			cove: basic({ color: '#ffb070' }),
			downlight: basic({ color: '#fff1d6' }),
			stepLight: basic({ color: '#ffb35c' }),
			stageLight: basic({ color: '#ffb35c' }),
			booth: basic({ color: '#7f93c9' }),
			// Exit signs stay lit during the film, but softly (the color dims the texture).
			exit: basic({ map: textures.sign('EXIT'), color: '#6f8576' }),
			sconceGlow: glowMaterial(textures.glow(), '#ffcf8a', 0.55),
			exitGlow: glowMaterial(textures.glow(), '#2bff8a', 0.1),
		};

		buildShell(b, m);
		buildSeating(b, m);
		buildWalls(b, m);
		buildScreenWall(b, m);
		buildBackWall(b, m);
		env.group.add(b.build());

		env.seats = new SeatRows({ rows: seatPositions(), model: cinemaSeat({ width: SEAT_WIDTH }), fabric: m.seatFabric, frame: m.seatFrame });

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: new THREE.Vector3(0, SCREEN.y - 0.3, SCREEN.z + 2),
			screenLightDistance: 34,
		});
		lighting.addFixture(m.sconce);
		lighting.addFixture(m.cove);
		lighting.addFixture(m.downlight);
		lighting.addGlow(m.sconceGlow);
		// Steps and stage edge stay faintly lit, so you can see where you walk.
		lighting.addFixture(m.stepLight, { min: 0.3 });
		lighting.addFixture(m.stageLight, { min: 0.12 });
		// The booth window stays lit: the projector is on.
		lighting.addFixture(m.booth, { min: 0.6, followBrightness: false });
		env.lighting = lighting;

		env.group.add(projectorBeam(lighting, new THREE.Vector3(0, 7.8, ROOM.back - 0.1), new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z), SCREEN));
	},
});

/** Floor, ceiling, walls, stage. */
function buildShell(b, m) {
	const { halfWidth, front, back, height } = ROOM;
	const depth = back - front;
	const midZ = (front + back) / 2;
	b.add(tiledPlane(halfWidth * 2, depth, 1.2), m.carpet, { position: [0, 0, midZ], rotation: [-Math.PI / 2, 0, 0] });
	b.add(tiledPlane(halfWidth * 2, depth, 1.2), m.ceiling, { position: [0, height, midZ], rotation: [Math.PI / 2, 0, 0] });
	for (const side of [-1, 1]) {
		b.add(new THREE.PlaneGeometry(depth, height), m.wall, { position: [side * halfWidth, height / 2, midZ], rotation: [0, -side * Math.PI / 2, 0] });
	}
	b.add(new THREE.PlaneGeometry(halfWidth * 2, height), m.wall, { position: [0, height / 2, front] });
	b.add(new THREE.PlaneGeometry(halfWidth * 2, height), m.wall, { position: [0, height / 2, back], rotation: [0, Math.PI, 0] });

	// Ceiling: a cove light along each side, and rows of downlights.
	for (const side of [-1, 1]) {
		b.add(box(0.06, 0.05, depth - 1), m.cove, { position: [side * (halfWidth - 0.35), height - 0.8, midZ] });
		b.add(box(0.3, 0.12, depth - 1), m.trim, { position: [side * (halfWidth - 0.2), height - 0.86, midZ] });
	}
	for (const x of [-6, -2, 2, 6]) {
		for (let z = front + 4; z < back - 1; z += 4) {
			b.add(new THREE.CircleGeometry(0.14, 20), m.downlight, { position: [x, height - 0.01, z], rotation: [Math.PI / 2, 0, 0] });
		}
	}

	// Stage under the screen, with a lit edge.
	const stageDepth = STAGE.front - front;
	b.add(tiledBox(halfWidth * 2, STAGE.top, stageDepth, 1.5), m.wood, { position: [0, STAGE.top / 2, front + stageDepth / 2] });
	b.add(box(halfWidth * 2, 0.025, 0.025), m.stageLight, { position: [0, STAGE.top - 0.02, STAGE.front + 0.01] });
}

/** Stadium tiers (with half-steps and step lights in the aisles) and the back walkway. */
function buildSeating(b, m) {
	for (let row = 1; row < ROWS; row++) {
		const h = rowFloor(row);
		const zFront = rowZ(row) - ROW_PITCH / 2;
		for (const seg of SEGMENTS) {
			const width = seg.to - seg.from;
			const x = (seg.from + seg.to) / 2;
			if (!seg.aisle) {
				b.add(tiledBox(width, h, ROW_PITCH, 1.2), m.carpet, { position: [x, h / 2, rowZ(row)] });
				// Dark nosing on the tier edge.
				b.add(box(width, 0.03, 0.04), m.trim, { position: [x, h - 0.015, zFront + 0.02] });
				continue;
			}
			// Aisle: a half-step in the front half of each tier.
			const half = ROW_PITCH / 2;
			const low = h - RISE / 2;
			b.add(tiledBox(width, low, half, 1.2), m.carpet, { position: [x, low / 2, zFront + half / 2] });
			b.add(tiledBox(width, h, half, 1.2), m.carpet, { position: [x, h / 2, zFront + half * 1.5] });
			for (const [y, z] of [[low, zFront], [h, zFront + half]]) {
				b.add(box(width - 0.2, 0.025, 0.025), m.stepLight, { position: [x, y - 0.03, z + 0.005] });
			}
		}
	}
	// Back walkway behind the last row.
	const lastBack = rowZ(ROWS - 1) + ROW_PITCH / 2;
	const depth = ROOM.back - lastBack;
	const h = rowFloor(ROWS - 1);
	b.add(tiledBox(ROOM.halfWidth * 2, h, depth, 1.2), m.carpet, { position: [0, h / 2, lastBack + depth / 2] });
}

/** Acoustic bays, pilasters, sconces, surround speakers and exit doors on the side walls. */
function buildWalls(b, m) {
	const { halfWidth } = ROOM;
	const bayWidth = 3.2;
	const firstBay = -11.6;
	for (const side of [-1, 1]) {
		const wallX = side * halfWidth;
		const inward = -side;
		for (let i = 0, z = firstBay; z + bayWidth <= ROOM.back - 0.4; i++, z += bayWidth) {
			const center = z + bayWidth / 2;
			// Acoustic fabric panel and the pilaster that starts the bay.
			b.add(box(0.06, 7.6, bayWidth - 0.4), m.acoustic, { position: [wallX + inward * 0.03, 5.3, center] });
			b.add(box(0.22, ROOM.height, 0.34), m.dark, { position: [wallX + inward * 0.11, ROOM.height / 2, z] });
			// Sconce washing the wall upwards, with its halo.
			b.add(box(0.1, 0.32, 0.26), m.sconce, { position: [wallX + inward * 0.12, 6.4, center] });
			b.add(box(0.14, 0.08, 0.32), m.trim, { position: [wallX + inward * 0.12, 6.22, center] });
			b.add(new THREE.PlaneGeometry(1.5, 2.6), m.sconceGlow, { position: [wallX + inward * 0.08, 7.1, center], rotation: [0, inward * Math.PI / 2, 0] });
			// Surround speaker in every other bay.
			if (i % 2 === 1) b.add(box(0.26, 0.62, 0.46), m.speaker, { position: [wallX + inward * 0.16, 8.6, center] });
		}
		// Last pilaster at the back.
		b.add(box(0.22, ROOM.height, 0.34), m.dark, { position: [wallX + inward * 0.11, ROOM.height / 2, ROOM.back - 0.4] });

		// Exit door near the front, with its lit sign.
		const doorZ = -9.6;
		b.add(box(0.12, 2.6, 1.9), m.trim, { position: [wallX + inward * 0.06, 1.3, doorZ] });
		b.add(tiledBox(0.06, 2.4, 1.6, 1), m.wood, { position: [wallX + inward * 0.13, 1.2, doorZ] });
		b.add(new THREE.PlaneGeometry(0.62, 0.24), m.exit, { position: [wallX + inward * 0.17, 2.95, doorZ], rotation: [0, inward * Math.PI / 2, 0] });
		b.add(new THREE.PlaneGeometry(1.4, 0.8), m.exitGlow, { position: [wallX + inward * 0.15, 2.95, doorZ], rotation: [0, inward * Math.PI / 2, 0] });
	}
}

/** Masking, proscenium frame and curtains around the screen. */
function buildScreenWall(b, m) {
	const { halfWidth, front, height } = ROOM;
	// Black masking behind the screen.
	b.add(new THREE.PlaneGeometry(SCREEN.maxWidth + 1.4, SCREEN.maxHeight + 1.6), m.black, { position: [SCREEN.x, SCREEN.y, SCREEN.z - 0.08] });
	// Proscenium: two pillars and a header.
	const frameX = SCREEN.maxWidth / 2 + 0.95;
	const frameTop = SCREEN.y + SCREEN.maxHeight / 2 + 1.1;
	for (const side of [-1, 1]) {
		const h = frameTop - STAGE.top;
		b.add(box(0.5, h, 0.5), m.dark, { position: [side * frameX, STAGE.top + h / 2, SCREEN.z + 0.1] });
	}
	b.add(box(frameX * 2 + 0.5, 0.6, 0.5), m.dark, { position: [0, frameTop + 0.3, SCREEN.z + 0.1] });

	// Side curtains (folded) from the proscenium to the walls, and a valance.
	const curtainWidth = halfWidth - frameX - 0.2;
	for (const side of [-1, 1]) {
		const x = side * (frameX + 0.2 + curtainWidth / 2);
		b.add(foldedCurtain(curtainWidth, height - STAGE.top, { folds: 7, depth: 0.14 }), m.velvet, { position: [x, STAGE.top + (height - STAGE.top) / 2, front + 0.35] });
	}
	b.add(foldedCurtain(halfWidth * 2, 1.1, { folds: 34, depth: 0.07 }), m.velvet, { position: [0, height - 0.55, SCREEN.z + 0.45] });
}

/** Projection booth windows on the back wall. */
function buildBackWall(b, m) {
	const y = 7.8;
	for (const [x, w, h] of [[0, 1.8, 0.9], [-3.4, 1, 0.6], [3.4, 1, 0.6]]) {
		// Lit glass, in a frame made of four bars around it.
		b.add(new THREE.PlaneGeometry(w, h), m.booth, { position: [x, y, ROOM.back - 0.02], rotation: [0, Math.PI, 0] });
		const t = 0.08;
		for (const [bw, bh, bx, by] of [[w + 2 * t, t, 0, (h + t) / 2], [w + 2 * t, t, 0, -(h + t) / 2], [t, h, (w + t) / 2, 0], [t, h, -(w + t) / 2, 0]]) {
			b.add(box(bw, bh, 0.08), m.trim, { position: [x + bx, y + by, ROOM.back - 0.04] });
		}
	}
}
