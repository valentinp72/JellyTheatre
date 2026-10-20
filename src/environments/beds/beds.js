// Bed cinema: a smaller sister of the movie theatre, made for watching lying
// down (in bed). Six beds in two rows instead of seats; the screen hangs high
// above the front of the room, leaned back towards the beds, in a sloping
// soffit. The theatre's style: acoustic bays with sconces and surround
// speakers, velvet curtains, a stage with the front speakers, exit doors, a
// projection booth and its beam. Side tables between the beds, with a lamp,
// popcorn and a drink.
//
// The room matches the body: the front row lies almost flat and looks high up
// at the screen, the back row sits up more and looks lower. Every bed carries
// its own head position (where the eyes go); the layout's is the front middle
// bed's. Coordinates: the screen faces +z and down, the beds' feet point to -z.

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { defineEnvironment } from '../kit/environment.js';
import { box, foldedCurtain, roundedBox, tiledBox, tiledPlane } from '../kit/geometry.js';
import { EnvironmentLighting, glowMaterial, projectorBeam } from '../kit/lighting.js';
import { Placer, speaker, tableLamp } from '../kit/props.js';
import { SeatSpots } from '../kit/seating.js';
import * as textures from '../kit/textures.js';

const deg = THREE.MathUtils.degToRad;

const ROOM = { halfWidth: 4, front: -5.6, back: 5.6, height: 8 };
const STAGE = { top: 0.45, depth: 1.3 };
// A bed: the mattress top is this high above its floor; its head end is a
// backrest raised by the row's recline, hinged this far from the headboard.
const BED = { width: 1.1, length: 2.25, top: 0.51, hinge: 0.85 };
const BED_XS = [-1.8, 0, 1.8];
// `z`: the headboard, `floor`: the back row is on a low platform.
const ROWS = [
	{ z: 0.35, floor: 0, recline: deg(20) },
	{ z: 3.45, floor: 0.3, recline: deg(38) },
];
const PLATFORM_FRONT = 0.95;
// Side tables between and beside the beds, at their heads.
const TABLE_XS = [-2.7, -0.9, 0.9, 2.7];

/** Along a raised backrest (from the hinge up), and out of it. */
const along = (recline) => new THREE.Vector3(0, Math.sin(recline), Math.cos(recline));
const outOf = (recline) => new THREE.Vector3(0, Math.cos(recline), -Math.sin(recline));
const hingeOf = (x, row) => new THREE.Vector3(x, row.floor + BED.top, row.z - BED.hinge);
/** The eyes of someone lying on a bed, head on the pillow. */
const headOf = (x, row) => hingeOf(x, row).addScaledVector(along(row.recline), 0.62).addScaledVector(outOf(row.recline), 0.24);
/** Rig floor position for a bed: under its middle (where the pointer aims). */
const seatOf = (x, row) => new THREE.Vector3(x, row.floor, row.z - 0.08 - BED.length / 2);

// The screen, seen from the front middle bed this high above the horizon and
// this far away, leaned back to face it.
const HEAD = headOf(0, ROWS[0]);
const SCREEN_ELEVATION = deg(55);
const SCREEN_DISTANCE = 6.6;
const SCREEN_SIZE = { maxWidth: 6.4, maxHeight: 3.6 };
const SCREEN_CENTER = HEAD.clone().addScaledVector(new THREE.Vector3(0, Math.sin(SCREEN_ELEVATION), -Math.cos(SCREEN_ELEVATION)), SCREEN_DISTANCE);
// The screen's plane: its up (leaning back over the beds) and its front.
const SCREEN_UP = new THREE.Vector3(0, Math.cos(SCREEN_ELEVATION), Math.sin(SCREEN_ELEVATION));
const SCREEN_NORMAL = new THREE.Vector3(0, -Math.sin(SCREEN_ELEVATION), Math.cos(SCREEN_ELEVATION));
/** A point of the screen's plane: `s` up it, `x` across, `d` in front of it. */
const onScreenPlane = (s, x = 0, d = 0) => SCREEN_CENTER.clone().addScaledVector(SCREEN_UP, s).add(new THREE.Vector3(x, 0, 0)).addScaledVector(SCREEN_NORMAL, d);
// The soffit holding the screen runs from the front wall up to the ceiling.
const SOFFIT_FROM = (ROOM.front - SCREEN_CENTER.z) / SCREEN_UP.z;
const SOFFIT_TO = (ROOM.height - SCREEN_CENTER.y) / SCREEN_UP.y;
const SOFFIT_FRONT_Y = onScreenPlane(SOFFIT_FROM).y;
/** Depth (z) where the soffit is at height `y`. */
const soffitZ = (y) => SCREEN_CENTER.z + ((y - SCREEN_CENTER.y) / SCREEN_UP.y) * SCREEN_UP.z;

export const bedsLayout = {
	screen: {
		position: { x: SCREEN_CENTER.x, y: SCREEN_CENTER.y, z: SCREEN_CENTER.z },
		...SCREEN_SIZE,
		tilt: THREE.MathUtils.radToDeg(SCREEN_ELEVATION),
	},
	seat: (({ x, y, z }) => ({ x, y, z }))(seatOf(0, ROWS[0])),
	head: { x: HEAD.x, y: HEAD.y, z: HEAD.z },
	screenLight: true,
};

defineEnvironment('beds', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);

		const m = {
			carpet: lambert({ map: textures.carpet() }),
			wall: lambert({ color: '#3c383b' }),
			acoustic: lambert({ map: textures.acousticPanel('#57505a') }),
			soffit: lambert({ map: textures.acousticPanel('#4a444c') }),
			wood: lambert({ map: textures.wood('#4a2f20') }),
			dark: lambert({ color: '#151315' }),
			black: basic({ color: '#050405' }),
			trim: lambert({ color: '#2a2729' }),
			velvet: lambert({ map: textures.velvet('#8a1c2b'), side: THREE.DoubleSide }),
			ceiling: lambert({ map: textures.ceilingTiles('#2a272b') }),
			grille: lambert({ map: textures.grille() }),
			cabinet: lambert({ color: '#1c1a1c' }),
			// The beds: upholstered like the theatre's seats, with pale linen.
			upholstery: lambert({ map: textures.fabric('#7a4a52') }),
			linen: lambert({ map: textures.fabric('#cfc8bb') }),
			pillow: lambert({ color: '#e4ded2' }),
			metal: lambert({ color: '#2a2729' }),
			popcornBox: lambert({ color: '#b8242c' }),
			popcorn: lambert({ color: '#f1dc9a' }),
			cup: lambert({ color: '#2a4a8a' }),
			lid: lambert({ color: '#e8e4dc' }),
			// Light fixtures (emissive, dim with the house lights).
			sconce: basic({ color: '#ffd9a3' }),
			cove: basic({ color: '#ffb070' }),
			downlight: basic({ color: '#fff1d6' }),
			stepLight: basic({ color: '#ffb35c' }),
			stageLight: basic({ color: '#ffb35c' }),
			lampShade: basic({ color: '#ffcf8f', side: THREE.DoubleSide }),
			booth: basic({ color: '#7f93c9' }),
			exit: basic({ map: textures.sign('EXIT'), color: '#6f8576' }),
			sconceGlow: glowMaterial(textures.glow(), '#ffcf8a', 0.5),
			exitGlow: glowMaterial(textures.glow(), '#2bff8a', 0.1),
		};

		buildShell(b, m);
		buildFront(b, m);
		buildSoffit(b, m);
		buildWalls(b, m);
		buildBackWall(b, m);
		const seats = new SeatSpots();
		for (const row of ROWS) {
			for (const x of BED_XS) {
				bed(b, m, x, row);
				seats.add(Object.assign(seatOf(x, row), { head: headOf(x, row) }));
			}
			for (const [i, x] of TABLE_XS.entries()) sideTable(b, m, [x, row.floor, row.z - 0.3], i);
		}
		env.seats = seats;
		env.group.add(b.build());

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: onScreenPlane(0, 0, 1.5),
			screenLightDistance: 16,
			screenLightScale: 0.6,
		});
		lighting.addFixture(m.sconce);
		lighting.addFixture(m.cove);
		lighting.addFixture(m.downlight);
		lighting.addGlow(m.sconceGlow);
		lighting.addFixture(m.lampShade, { min: 0.06 });
		// The platform's edge and the stage stay faintly lit, so you can see where you walk.
		lighting.addFixture(m.stepLight, { min: 0.3 });
		lighting.addFixture(m.stageLight, { min: 0.12 });
		// The booth window stays lit: the projector is on.
		lighting.addFixture(m.booth, { min: 0.6, followBrightness: false });
		env.lighting = lighting;

		env.group.add(projectorBeam(lighting, new THREE.Vector3(0, 3.3, ROOM.back - 0.1), SCREEN_CENTER, SCREEN_SIZE));
	},
});

/** Floor, ceiling, walls, the back row's platform. */
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

	// Ceiling behind the soffit: a cove light along each side, downlights over the aisles.
	const coveY = height - 0.6;
	const coveFrom = soffitZ(coveY) + 0.15;
	for (const side of [-1, 1]) {
		const length = back - 0.3 - coveFrom;
		b.add(box(0.06, 0.05, length), m.cove, { position: [side * (halfWidth - 0.3), coveY, coveFrom + length / 2] });
		b.add(box(0.26, 0.1, length), m.trim, { position: [side * (halfWidth - 0.17), coveY - 0.05, coveFrom + length / 2] });
		for (const z of [-0.4, 2.1, 4.6]) {
			b.add(new THREE.CircleGeometry(0.12, 20), m.downlight, { position: [side * 3.1, height - 0.01, z], rotation: [Math.PI / 2, 0, 0] });
		}
	}

	// The back row's platform, with a lit edge.
	const platform = ROWS[1].floor;
	const platformDepth = back - PLATFORM_FRONT;
	b.add(tiledBox(halfWidth * 2, platform, platformDepth, 1.2), m.carpet, { position: [0, platform / 2, PLATFORM_FRONT + platformDepth / 2] });
	b.add(box(halfWidth * 2, 0.03, 0.04), m.trim, { position: [0, platform - 0.015, PLATFORM_FRONT + 0.02] });
	b.add(box(halfWidth * 2 - 0.4, 0.025, 0.025), m.stepLight, { position: [0, platform - 0.06, PLATFORM_FRONT - 0.005] });
}

/** A low stage with the front speakers, and a velvet curtain over the front wall. */
function buildFront(b, m) {
	const { halfWidth, front } = ROOM;
	b.add(tiledBox(halfWidth * 2, STAGE.top, STAGE.depth, 1.5), m.wood, { position: [0, STAGE.top / 2, front + STAGE.depth / 2] });
	b.add(box(halfWidth * 2, 0.025, 0.025), m.stageLight, { position: [0, STAGE.top - 0.02, front + STAGE.depth + 0.01] });
	for (const x of [-2.7, 0, 2.7]) speaker(b, m, [x, STAGE.top, front + 0.75], Math.PI, { height: 1.2 });
	const height = SOFFIT_FRONT_Y - STAGE.top;
	b.add(foldedCurtain(halfWidth * 2, height, { folds: 24, depth: 0.12 }), m.velvet, { position: [0, STAGE.top + height / 2, front + 0.25] });
	b.add(box(halfWidth * 2, 0.22, 0.3), m.dark, { position: [0, SOFFIT_FRONT_Y - 0.11, front + 0.15] });
}

/** The sloping soffit, from the front wall to the ceiling: masking and a frame around the screen. */
function buildSoffit(b, m) {
	const rotation = [SCREEN_ELEVATION, 0, 0];
	const at = (s, x, d) => onScreenPlane(s, x, d).toArray();
	const length = SOFFIT_TO - SOFFIT_FROM;
	b.add(tiledPlane(ROOM.halfWidth * 2, length, 1.6), m.soffit, { position: at((SOFFIT_FROM + SOFFIT_TO) / 2, 0, -0.1), rotation });
	const maskW = SCREEN_SIZE.maxWidth + 0.7;
	const maskH = SCREEN_SIZE.maxHeight + 0.7;
	b.add(new THREE.PlaneGeometry(maskW, maskH), m.black, { position: at(0, 0, -0.06), rotation });
	const bar = 0.24;
	for (const side of [-1, 1]) {
		b.add(box(maskW + 2 * bar, bar, 0.16), m.dark, { position: at(side * (maskH + bar) / 2, 0, -0.04), rotation });
		b.add(box(bar, maskH, 0.16), m.dark, { position: at(0, side * (maskW + bar) / 2, -0.04), rotation });
	}
}

/** Acoustic bays, pilasters, sconces, surround speakers and exit doors on the side walls. */
function buildWalls(b, m) {
	const { halfWidth, front, back, height } = ROOM;
	const bays = 5;
	const bayWidth = (back - front) / bays;
	for (const side of [-1, 1]) {
		const wallX = side * halfWidth;
		const inward = -side;
		for (let i = 0; i < bays; i++) {
			const z = front + i * bayWidth;
			const center = z + bayWidth / 2;
			b.add(box(0.05, 5.5, bayWidth - 0.36), m.acoustic, { position: [wallX + inward * 0.025, 3.9, center] });
			if (i > 0) b.add(box(0.2, height, 0.3), m.dark, { position: [wallX + inward * 0.1, height / 2, z] });
			b.add(box(0.09, 0.28, 0.22), m.sconce, { position: [wallX + inward * 0.1, 4.65, center] });
			b.add(box(0.12, 0.07, 0.28), m.trim, { position: [wallX + inward * 0.1, 4.48, center] });
			b.add(new THREE.PlaneGeometry(1.2, 2.1), m.sconceGlow, { position: [wallX + inward * 0.07, 5.2, center], rotation: [0, inward * Math.PI / 2, 0] });
			if (i % 2 === 1) b.add(box(0.24, 0.55, 0.4), m.grille, { position: [wallX + inward * 0.14, 6.1, center] });
		}

		// Exit door near the front, with its lit sign.
		const doorZ = front + bayWidth / 2;
		b.add(box(0.12, 2.6, 1.7), m.trim, { position: [wallX + inward * 0.06, 1.3, doorZ] });
		b.add(tiledBox(0.06, 2.4, 1.4, 1), m.wood, { position: [wallX + inward * 0.13, 1.2, doorZ] });
		b.add(new THREE.PlaneGeometry(0.62, 0.24), m.exit, { position: [wallX + inward * 0.17, 2.95, doorZ], rotation: [0, inward * Math.PI / 2, 0] });
		b.add(new THREE.PlaneGeometry(1.4, 0.8), m.exitGlow, { position: [wallX + inward * 0.15, 2.95, doorZ], rotation: [0, inward * Math.PI / 2, 0] });
	}
}

/** Projection booth windows on the back wall, low above the platform. */
function buildBackWall(b, m) {
	const y = 3.3;
	for (const [x, w, h] of [[0, 1.4, 0.7], [-2.2, 0.8, 0.5], [2.2, 0.8, 0.5]]) {
		b.add(new THREE.PlaneGeometry(w, h), m.booth, { position: [x, y, ROOM.back - 0.02], rotation: [0, Math.PI, 0] });
		const t = 0.07;
		for (const [bw, bh, bx, by] of [[w + 2 * t, t, 0, (h + t) / 2], [w + 2 * t, t, 0, -(h + t) / 2], [t, h, (w + t) / 2, 0], [t, h, -(w + t) / 2, 0]]) {
			b.add(box(bw, bh, 0.07), m.trim, { position: [x + bx, y + by, ROOM.back - 0.035] });
		}
	}
}

/** Triangular block under a raised backrest: `length` along the bed, rising by `angle`. */
function wedge(width, length, angle) {
	const shape = new THREE.Shape([
		new THREE.Vector2(0, 0),
		new THREE.Vector2(length * Math.cos(angle), 0),
		new THREE.Vector2(length * Math.cos(angle), length * Math.sin(angle)),
	]);
	// Shape in (z, y), extruded across the bed.
	return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).translate(0, 0, -width / 2).rotateY(-Math.PI / 2);
}

/**
 * A cinema bed, its head at the headboard (`row.z`), feet towards the screen:
 * upholstered base and headboard, a mattress whose head end is raised by the
 * row's recline, a pillow and a velvet throw folded at the foot.
 */
function bed(b, m, x, row) {
	const { floor, recline } = row;
	const foot = row.z - 0.08 - BED.length;
	const middle = row.z - 0.08 - BED.length / 2;
	const add = (geometry, material, [px, py, pz], rotation = [0, 0, 0]) => b.add(geometry, material, { position: [px, py, pz], rotation });
	add(box(BED.width - 0.12, 0.1, BED.length - 0.16), m.dark, [x, floor + 0.05, middle]);
	add(box(BED.width - 0.3, 0.02, 0.02), m.stepLight, [x, floor + 0.05, foot + 0.07]);
	add(roundedBox(BED.width + 0.08, 0.26, BED.length, 0.04), m.upholstery, [x, floor + 0.23, middle]);
	// The headboard rises a little above the raised backrest.
	const headboard = BED.top + BED.hinge * Math.sin(recline) + 0.15;
	add(roundedBox(BED.width + 0.12, headboard, 0.16, 0.05), m.upholstery, [x, floor + headboard / 2, row.z]);

	// Mattress: flat from the foot to the hinge, then the raised backrest on its wedge.
	const hinge = hingeOf(x, row);
	const flat = hinge.z - (foot + 0.04);
	add(roundedBox(BED.width - 0.04, 0.15, flat, 0.05), m.linen, [x, floor + BED.top - 0.075, foot + 0.04 + flat / 2]);
	add(wedge(BED.width - 0.08, BED.hinge - 0.1, recline), m.upholstery, [x, floor + 0.36, hinge.z]);
	const rest = hinge.clone().addScaledVector(along(recline), BED.hinge / 2).addScaledVector(outOf(recline), -0.075);
	add(roundedBox(BED.width - 0.04, 0.15, BED.hinge, 0.05), m.linen, rest.toArray(), [-recline, 0, 0]);
	const pillow = hinge.clone().addScaledVector(along(recline), 0.6).addScaledVector(outOf(recline), 0.05);
	add(roundedBox(0.62, 0.11, 0.36, 0.05), m.pillow, pillow.toArray(), [-recline, 0, 0]);

	// The throw, folded on the foot and hanging over its end.
	add(roundedBox(BED.width + 0.02, 0.04, 0.55, 0.015), m.velvet, [x, floor + BED.top + 0.015, foot + 0.33]);
	add(box(BED.width + 0.02, 0.2, 0.03), m.velvet, [x, floor + BED.top - 0.08, foot + 0.045]);
}

/** Round side table with a lamp, a box of popcorn and a drink. */
function sideTable(b, m, position, seed) {
	const p = new Placer(b, position);
	const top = 0.55;
	p.add(new THREE.CylinderGeometry(0.17, 0.2, 0.02, 16), m.metal, [0, 0.01, 0]);
	p.add(new THREE.CylinderGeometry(0.025, 0.025, top - 0.03, 8), m.metal, [0, (top - 0.03) / 2, 0]);
	p.add(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 20), m.wood, [0, top - 0.015, 0]);
	tableLamp(b, m, p.point([0, top, 0.09]).toArray());
	// Popcorn and the drink on the side facing the screen, alternating sides.
	const side = seed % 2 ? 1 : -1;
	p.add(new THREE.CylinderGeometry(0.075, 0.058, 0.17, 10), m.popcornBox, [side * 0.1, top + 0.085, -0.1]);
	p.add(new THREE.SphereGeometry(0.073, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), m.popcorn, [side * 0.1, top + 0.17, -0.1]);
	p.add(new THREE.CylinderGeometry(0.042, 0.033, 0.15, 10), m.cup, [-side * 0.11, top + 0.075, -0.08]);
	p.add(new THREE.CylinderGeometry(0.044, 0.044, 0.012, 10), m.lid, [-side * 0.11, top + 0.156, -0.08]);
	p.add(box(0.008, 0.11, 0.008), m.lid, [-side * 0.11 + 0.012, top + 0.2, -0.08], [0, 0, -0.25]);
}
