// Space station Cupola, in orbit and in zero gravity, after the ISS's: a
// small faceted dome. Six big trapezoid windows slope from a hexagonal base
// ring towards the top panel, where the screen is set (in place of the real
// Cupola's central window): around the picture, the planet below, the moon,
// the stars and the station's solar arrays. The viewer floats in a crew seat clamped on two rails across
// the base ring; behind, a short skirt with lockers, a hatch and cargo bags.
// A few things drift slowly in the air, never between the eyes and the
// screen.

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { cargoBag, FloatingObjects, handrail, StatusDisplays } from '../kit/decor.js';
import { defineEnvironment } from '../kit/environment.js';
import { box, roundedBox } from '../kit/geometry.js';
import { EnvironmentLighting } from '../kit/lighting.js';
import { Placer } from '../kit/props.js';
import { SeatSpots } from '../kit/seating.js';
import { gradientSky, moon, planet, starfield } from '../kit/sky.js';
import * as textures from '../kit/textures.js';

// The dome's axis runs along -z at eye height. Hexagons are given by their
// circumradius; the base ring is at z = 0, the top panel (the screen) in front.
const CUPOLA = { axisY: 1.35, base: 1.6, top: 1.25, depth: 1.25, skirt: 1.0 };
// The viewer's seat (rig, feet) at the base: the eyes end up on the axis.
const SEAT = { x: 0, y: 0.15, z: 0.25 };
const EYE = new THREE.Vector3(0, CUPOLA.axisY, SEAT.z);
const RAIL_Y = 0.32;
// On the top panel: the largest 16:9 picture (with its border) that stays
// clear of the struts along the panel's edges.
const SCREEN = { x: 0, y: CUPOLA.axisY, z: -CUPOLA.depth + 0.018, maxWidth: 1.65, maxHeight: 0.928 };
const SCREEN_BORDER = 0.035;

export const stationLayout = {
	screen: { position: { x: SCREEN.x, y: SCREEN.y, z: SCREEN.z }, maxWidth: SCREEN.maxWidth, maxHeight: SCREEN.maxHeight },
	seat: { x: SEAT.x, y: SEAT.y, z: SEAT.z },
	screenLight: true,
	// The library, when not on the screen, stays inside the dome.
	menuDistance: 1.1,
};

defineEnvironment('station', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);
		const m = {
			frame: lambert({ color: '#d9dbe0', side: THREE.DoubleSide }),
			panel: lambert({ map: textures.stationPanel(), side: THREE.DoubleSide }),
			strut: lambert({ color: '#a7adb6' }),
			lockers: lambert({ map: textures.rackPanel('lockers'), side: THREE.DoubleSide }),
			dark: lambert({ color: '#2a2f38', side: THREE.DoubleSide }),
			metal: lambert({ color: '#7d838c' }),
			seat: lambert({ map: textures.fabric('#3c4a5e') }),
			handrail: lambert({ color: '#d9b84a' }),
			bag: lambert({ map: textures.fabric('#d8d0b8') }),
			strap: lambert({ color: '#2f4f8a' }),
			glass: basic({ color: '#9fc4ff', transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }),
			// Fixtures.
			light: basic({ color: '#f2f6ff' }),
		};
		const displays = new StatusDisplays();

		buildDome(b, m);
		buildSkirt(b, m, displays);
		buildSeat(b, m);
		env.seats = new SeatSpots([new THREE.Vector3(SEAT.x, SEAT.y, SEAT.z)]);
		env.group.add(b.build());

		const { group: space, surface } = outside();
		env.group.add(space);
		env.onTick = (delta) => {
			// The planet turns once every ~20 minutes.
			surface.rotation.y += (Math.min(delta, 100) / 1000) * 0.005;
		};
		env.effects = [floaters(env.group)];

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: new THREE.Vector3(0, SCREEN.y, SCREEN.z + 0.6),
			screenLightDistance: 4,
			// The panels are right next to the screen, and pale: a little light goes far.
			screenLightScale: 0.06,
			ambient: '#e6eeff',
			sky: '#eef3ff',
			ground: '#3a4252',
			ambientIntensity: 0.4,
			hemiIntensity: 1.2,
		});
		lighting.addFixture(m.light, { min: 0.12 });
		lighting.addFixture(displays.material, { min: 0.35 });
		env.lighting = lighting;
	},
});

/** Hexagon vertex k (0–5) of circumradius r at depth z: a flat edge at the top and bottom. */
function vertex(k, r, z) {
	const theta = Math.PI / 6 + (k * Math.PI) / 3;
	return new THREE.Vector3(Math.sin(theta) * r, CUPOLA.axisY + Math.cos(theta) * r, z);
}

/** A quad (p0 p1 p2 p3, in order around it) with 0–1 UVs. */
function quad(p0, p1, p2, p3) {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([...p0.toArray(), ...p1.toArray(), ...p2.toArray(), ...p3.toArray()], 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
	geometry.setIndex([0, 1, 2, 0, 2, 3]);
	geometry.computeVertexNormals();
	return geometry;
}

/** A bar between two points. */
function bar(b, material, from, to, radius = 0.035, sides = 8) {
	const geometry = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), sides);
	geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
	b.add(geometry, material, { position: from.clone().add(to).multiplyScalar(0.5).toArray() });
}

/** The dome: six trapezoid windows in their frames, and the top panel with the screen. */
function buildDome(b, m) {
	const { base, top, depth } = CUPOLA;
	const zTop = -depth;
	for (let k = 0; k < 6; k++) {
		const outer = [vertex(k, base, 0), vertex(k + 1, base, 0), vertex(k + 1, top, zTop), vertex(k, top, zTop)];
		// The window: the face shrunk towards its center, a frame around it.
		const center = outer.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(0.25);
		const inner = outer.map((p) => center.clone().lerp(p, 0.84));
		b.add(quad(...inner), m.glass);
		for (let i = 0; i < 4; i++) b.add(quad(outer[i], outer[(i + 1) % 4], inner[(i + 1) % 4], inner[i]), m.frame);
		// Struts along the edges.
		bar(b, m.strut, vertex(k, base, 0), vertex(k, top, zTop), 0.04);
		bar(b, m.strut, vertex(k, base, 0), vertex(k + 1, base, 0), 0.05);
		bar(b, m.strut, vertex(k, top, zTop), vertex(k + 1, top, zTop), 0.04);
	}
	// Top panel: station plating, the screen in a thin metal border on it,
	// handrails on both sides.
	const plate = new THREE.Shape();
	for (let k = 0; k <= 6; k++) {
		const p = vertex(k, top, 0);
		if (k === 0) plate.moveTo(p.x, p.y - CUPOLA.axisY);
		else plate.lineTo(p.x, p.y - CUPOLA.axisY);
	}
	const plating = new THREE.ShapeGeometry(plate);
	// Its UVs are in metres: the texture covers 2.6 m, centered.
	const uv = plating.attributes.uv;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2.6 + 0.5, uv.getY(i) / 2.6 + 0.5);
	b.add(plating, m.panel, { position: [0, CUPOLA.axisY, zTop] });
	const bw = SCREEN.maxWidth + 2 * SCREEN_BORDER;
	const bh = SCREEN.maxHeight + 2 * SCREEN_BORDER;
	// The border is a dark plate under the picture: also the black bars of wide films.
	b.add(roundedBox(bw, bh, 0.02, 0.012, 1), m.dark, { position: [SCREEN.x, SCREEN.y, zTop + 0.006] });
	for (const side of [-1, 1]) {
		const x = side * (bw / 2 + 0.11);
		handrail(b, m, [x, CUPOLA.axisY - 0.28, zTop + 0.09], [x, CUPOLA.axisY + 0.28, zTop + 0.09], { offset: new THREE.Vector3(0, 0, -0.08) });
	}
	// Handrails around the base ring, as in the real Cupola.
	for (let k = 0; k < 6; k++) {
		const a = vertex(k, base - 0.22, -0.12);
		const c = vertex(k + 1, base - 0.22, -0.12);
		const out = vertex(k, base, 0).sub(vertex(k, base - 0.22, -0.12)).multiplyScalar(0.5);
		// Shorter than the edge, so the corners stay clear.
		handrail(b, m, a.clone().lerp(c, 0.2).toArray(), a.clone().lerp(c, 0.8).toArray(), { offset: out });
	}
}

/** The skirt behind the viewer: lockers, lights, a hatch, bags, two laptops. */
function buildSkirt(b, m, displays) {
	const { base, skirt } = CUPOLA;
	for (let k = 0; k < 6; k++) {
		const a = vertex(k, base, 0);
		const c = vertex(k + 1, base, 0);
		b.add(quad(a, c, vertex(k + 1, base, skirt), vertex(k, base, skirt)), m.lockers);
		bar(b, m.strut, vertex(k, base, skirt), vertex(k + 1, base, skirt), 0.05);
		bar(b, m.strut, vertex(k, base, 0), vertex(k, base, skirt), 0.035);
	}
	// Light panels on the two upper faces.
	for (const k of [5, 0]) {
		// Inset in the face, a little in front of it.
		const corners = [vertex(k, base, 0.2), vertex(k + 1, base, 0.2), vertex(k + 1, base, skirt - 0.2), vertex(k, base, skirt - 0.2)];
		const center = corners.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(0.25);
		const toAxis = new THREE.Vector3(0, CUPOLA.axisY, center.z).sub(center).normalize().multiplyScalar(0.01);
		b.add(quad(...corners.map((p) => center.clone().lerp(p, 0.6).add(toAxis))), m.light);
	}
	// Back wall: the hatch to the station, cargo bags around it.
	const wall = new THREE.Shape();
	for (let k = 0; k <= 6; k++) {
		const p = vertex(k, base, 0);
		if (k === 0) wall.moveTo(p.x, p.y - CUPOLA.axisY);
		else wall.lineTo(p.x, p.y - CUPOLA.axisY);
	}
	b.add(new THREE.ShapeGeometry(wall), m.frame, { position: [0, CUPOLA.axisY, skirt], rotation: [0, Math.PI, 0] });
	const hatch = new Placer(b, [0, CUPOLA.axisY + 0.1, skirt - 0.02], Math.PI);
	hatch.add(new THREE.TorusGeometry(0.5, 0.05, 8, 40), m.strut);
	hatch.add(new THREE.CircleGeometry(0.47, 40), m.dark, [0, 0, 0.01]);
	hatch.add(box(0.3, 0.04, 0.05), m.handrail, [0, -0.18, 0.04]);
	for (const [x, y, w, h, tilt] of [[-0.95, 1.6, 0.45, 0.32, 0.06], [0.95, 1.0, 0.45, 0.32, -0.08], [-0.8, 0.6, 0.4, 0.28, 0.1]]) {
		cargoBag(b, m, [x, y, skirt - 0.17], 0, { width: w, height: h, depth: 0.28, tilt });
	}
	// Two laptops on the lower side faces, turned towards the seat (the
	// robotic arm workstation of the real Cupola).
	for (const side of [-1, 1]) {
		const position = new THREE.Vector3(side * 1.0, 0.95, 0.35);
		const facing = Math.atan2(position.x - SEAT.x, position.z - (SEAT.z + 0.1)) ;
		const l = new Placer(b, position.toArray(), facing);
		l.add(box(0.32, 0.02, 0.22), m.dark);
		displays.addScreen(b, m.dark, l.point([0, 0.11, 0.11]).toArray(), facing, { width: 0.28, cell: side < 0 ? 0 : 3 });
		bar(b, m.metal, position.clone().add(new THREE.Vector3(0, -0.02, 0)), new THREE.Vector3(side * 1.25, 0.75, 0.35), 0.015, 6);
	}
}

/** The crew seat, clamped on two rails crossing the base ring. */
function buildSeat(b, m) {
	// Half the hexagon's width at the rails' height (they end on its lower faces).
	const inradius = CUPOLA.base * Math.cos(Math.PI / 6);
	const below = CUPOLA.axisY - RAIL_Y;
	const halfWidth = CUPOLA.base / 2 + (CUPOLA.base / 2) * (1 - below / inradius) - 0.03;
	for (const dz of [-0.16, 0.2]) {
		const z = SEAT.z + dz;
		bar(b, m.metal, new THREE.Vector3(-halfWidth, RAIL_Y, z), new THREE.Vector3(halfWidth, RAIL_Y, z), 0.03, 10);
		for (const side of [-1, 1]) b.add(box(0.1, 0.12, 0.12), m.dark, { position: [side * (halfWidth - 0.03), RAIL_Y, z] });
	}

	const p = new Placer(b, [SEAT.x, 0, SEAT.z]);
	for (const dz of [-0.16, 0.2]) {
		for (const x of [-0.18, 0.18]) p.add(roundedBox(0.1, 0.09, 0.09, 0.02, 1), m.dark, [x, RAIL_Y, dz]);
	}
	p.add(box(0.5, 0.05, 0.46), m.dark, [0, RAIL_Y + 0.06, 0.02]);
	p.add(box(0.12, 0.12, 0.12), m.metal, [0, RAIL_Y + 0.14, 0.05]);
	// Seat pan, reclined back, headrest, armrests.
	p.add(roundedBox(0.56, 0.1, 0.5, 0.04, 1), m.seat, [0, 0.5, -0.02]);
	p.add(roundedBox(0.56, 0.75, 0.1, 0.04, 1), m.seat, [0, 0.9, 0.3], [-0.22, 0, 0]);
	p.add(roundedBox(0.3, 0.2, 0.09, 0.04, 1), m.seat, [0, 1.43, 0.43], [-0.22, 0, 0]);
	for (const side of [-1, 1]) {
		p.add(roundedBox(0.07, 0.06, 0.42, 0.02, 1), m.dark, [side * 0.33, 0.7, 0]);
		p.add(box(0.03, 0.2, 0.03), m.metal, [side * 0.33, 0.6, 0.12]);
	}
	// Lap strap with its buckle; foot loops on the lowest strut of the base ring.
	p.add(box(0.5, 0.012, 0.05), m.strap, [0, 0.62, -0.08]);
	p.add(box(0.06, 0.016, 0.045), m.handrail, [0, 0.625, -0.08]);
	const bottom = vertex(2, CUPOLA.base, 0).y;
	for (const x of [-0.15, 0.15]) {
		b.add(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), m.strap, { position: [x, bottom + 0.04, -0.02] });
	}
}

/** Whether a point is between the viewer's eyes and the screen (with a margin). */
function inFrontOfScreen(point) {
	const t = (EYE.z - point.z) / (EYE.z - SCREEN.z);
	if (t < -0.1 || t > 1.1) return false;
	const margin = 0.18;
	const halfWidth = (SCREEN.maxWidth / 2) * Math.max(t, 0) + margin;
	const halfHeight = (SCREEN.maxHeight / 2) * Math.max(t, 0) + margin;
	return Math.abs(point.x - SCREEN.x) < halfWidth && Math.abs(point.y - EYE.y + (EYE.y - SCREEN.y) * t) < halfHeight;
}

/** Things drifting in the air, never between the eyes and the screen. */
function floaters(group) {
	return new FloatingObjects(group, [
		{ kind: 'tablet', min: [-0.5, 1.95, 0.5], max: [0.5, 2.3, 0.8] },
		{ kind: 'pouch', min: [-1.0, 1.0, -0.6], max: [-0.78, 1.6, -0.15] },
		{ kind: 'water', min: [0.72, 1.05, -0.65], max: [0.92, 1.55, -0.2] },
		{ kind: 'pen', min: [-0.35, 1.98, -0.6], max: [0.35, 2.2, -0.2] },
		{ kind: 'plush', min: [-1.0, 0.65, 0.55], max: [-0.6, 1.0, 0.85] },
	], { keepOut: inFrontOfScreen });
}

/** Space: stars, the moon, the planet below, the station's solar arrays. */
function outside() {
	const group = new THREE.Group();
	group.add(gradientSky([[0, '#020309'], [0.5, '#05060f'], [1, '#020309']], 400));
	group.add(starfield({ count: 2500, radius: 380, seed: 11 }));
	const sun = new THREE.Vector3(0.6, 0.7, 0.35);
	// Big and close below: it fills the lower windows, its horizon curving away.
	const world = planet({ radius: 160, texture: textures.planetSurface(7), sun, atmosphere: '#7fb4ff' });
	world.position.set(0, -168, -40);
	world.rotation.x = 0.4;
	group.add(world);
	// The moon, up and to the left, in the upper windows.
	const satellite = moon({ size: 16, color: '#d6d9e0' });
	satellite.position.copy(new THREE.Vector3(-0.55, 0.5, -0.67).normalize().multiplyScalar(240));
	group.add(satellite);
	// The station's truss and solar arrays, off to the right.
	const arrays = new THREE.Group();
	arrays.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 60), new THREE.MeshLambertMaterial({ color: '#8d939c' })));
	const cells = new THREE.MeshLambertMaterial({ map: textures.repeated(textures.solarPanel(), 2, 12), side: THREE.DoubleSide });
	for (const z of [-22, -16, 16, 22]) {
		const wing = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 34), cells);
		wing.rotation.set(0, Math.PI / 2, 0.35);
		wing.position.set(0, 0, z);
		wing.rotation.order = 'YXZ';
		arrays.add(wing);
	}
	arrays.position.set(24, 6, -8);
	arrays.rotation.y = -0.35;
	group.add(arrays);
	return { group, surface: world.userData.surface };
}
