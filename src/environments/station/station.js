// Space station lounge: an observation deck with a skylight over almost the
// whole ceiling (stars, a moon) and a glass floor under almost the whole deck,
// with a slowly turning planet below: the couches stand on an island over
// space. The screen hangs on a solid front wall;
// lounge couches, metal deck plates and cyan light strips inside.

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { defineEnvironment } from '../kit/environment.js';
import { box, roundedBox, tiledBox, wallWithOpenings } from '../kit/geometry.js';
import { EnvironmentLighting, glowMaterial } from '../kit/lighting.js';
import { plant, sofa } from '../kit/props.js';
import { SeatSpots } from '../kit/seating.js';
import { gradientSky, moon, planet, starfield } from '../kit/sky.js';
import * as textures from '../kit/textures.js';

// A tall deck, so the screen can fill most of the front wall.
const DECK = { halfWidth: 8, front: -9.5, back: 6, height: 7.5 };
const SCREEN = { x: 0, y: 3.75, z: -9.35, maxWidth: 11.5, maxHeight: 6.47 };
const COUCH_Z = -1;
// Openings: the skylight (in the ceiling) and the floor window, in world x/z.
const SKYLIGHT = { x: 0, z: -1.75, width: 13, depth: 12.5 };
// A metal walkway stays along the walls; everything else is glass.
const FLOOR_WINDOW = { x: 0, z: -1.75, width: 13, depth: 12.5 };
const FLOOR_THICKNESS = 0.45;

export const stationLayout = {
	screen: { position: { x: SCREEN.x, y: SCREEN.y, z: SCREEN.z }, maxWidth: SCREEN.maxWidth, maxHeight: SCREEN.maxHeight },
	seat: { x: 0, y: 0.25, z: COUCH_Z },
	screenLight: true,
};

defineEnvironment('station', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);
		const m = {
			deck: lambert({ map: textures.deckPlates('#6a7078') }),
			panel: lambert({ color: '#c9ced6' }),
			darkPanel: lambert({ color: '#2a2f38', side: THREE.DoubleSide }),
			rib: lambert({ color: '#8d939c' }),
			couch: lambert({ map: textures.fabric('#d9dde4') }),
			legs: lambert({ color: '#3a3f48' }),
			pot: lambert({ color: '#e6e8ec' }),
			leaves: lambert({ color: '#4e8a5a', flatShading: true }),
			glass: basic({ color: '#7fb4ff', transparent: true, opacity: 0.07, depthWrite: false }),
			// Fixtures.
			strip: basic({ color: '#4fd8ff' }),
			ceilingLight: basic({ color: '#e8f4ff' }),
			stripGlow: glowMaterial(textures.glow(), '#4fd8ff', 0.25),
			frameGlow: basic({ color: '#4fd8ff' }),
		};

		buildDeck(b, m);
		const seats = new SeatSpots();
		// Three couches on a low platform, the side ones turned towards the screen.
		b.add(tiledBox(9, 0.25, 3.2, 2), m.deck, { position: [0, 0.125, COUCH_Z + 0.4], walkable: true });
		b.add(box(9, 0.02, 0.03), m.strip, { position: [0, 0.03, COUCH_Z - 1.21] });
		const couchMaterials = { fabric: m.couch, legs: m.legs };
		seats.add(sofa(b, couchMaterials, [0, 0.25, COUCH_Z], 0, { seats: 3 }));
		seats.add(sofa(b, couchMaterials, [-3.2, 0.25, COUCH_Z + 0.5], 0.35, { seats: 2 }));
		seats.add(sofa(b, couchMaterials, [3.2, 0.25, COUCH_Z + 0.5], -0.35, { seats: 2 }));
		env.seats = seats;
		plant(b, m, [-6.8, 0, 4.8], { size: 1.4, seed: 4 });
		plant(b, m, [6.8, 0, 4.8], { size: 1.4, seed: 6 });

		// A thin glowing frame around the screen, on the front wall.
		const fw = SCREEN.maxWidth + 0.2;
		const fh = SCREEN.maxHeight + 0.2;
		for (const [w, h, x, y] of [[fw, 0.04, 0, fh / 2], [fw, 0.04, 0, -fh / 2], [0.04, fh, fw / 2, 0], [0.04, fh, -fw / 2, 0]]) {
			b.add(box(w, h, 0.04), m.frameGlow, { position: [SCREEN.x + x, SCREEN.y + y, SCREEN.z - 0.03] });
		}
		b.add(new THREE.PlaneGeometry(SCREEN.maxWidth + 0.1, SCREEN.maxHeight + 0.1), basic({ color: '#020306' }), { position: [SCREEN.x, SCREEN.y, SCREEN.z - 0.05] });
		env.group.add(b.build());

		// Space all around: stars, a moon above, a planet below.
		const space = new THREE.Group();
		space.add(gradientSky([[0, '#020309'], [0.5, '#05060f'], [1, '#020309']], 400));
		space.add(starfield({ count: 2500, radius: 380, seed: 11 }));
		const sun = new THREE.Vector3(0.6, 0.7, 0.35);
		// Right below the deck: it fills the view down through the glass floor,
		// its horizon curving away in front.
		const world = planet({ radius: 160, texture: textures.planetSurface(7), sun, atmosphere: '#7fb4ff' });
		world.position.set(0, -185, -25);
		world.rotation.x = 0.4;
		space.add(world);
		const satellite = moon({ size: 14, color: '#cfd3dc' });
		satellite.position.set(70, 230, -60);
		space.add(satellite);
		env.group.add(space);
		const surface = world.userData.surface;
		env.onTick = (delta) => {
			// One turn every ~20 minutes.
			surface.rotation.y += (Math.min(delta, 100) / 1000) * 0.005;
		};

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: new THREE.Vector3(0, SCREEN.y - 0.3, SCREEN.z + 1.5),
			screenLightDistance: 18,
			ambient: '#d6e6ff',
			sky: '#cfe2ff',
			ground: '#1a2030',
		});
		lighting.addFixture(m.ceilingLight);
		// Light strips and the screen frame stay faintly on: it's a spaceship.
		lighting.addFixture(m.strip, { min: 0.3 });
		lighting.addGlow(m.stripGlow, { min: 0.3 });
		lighting.addFixture(m.frameGlow, { min: 0.25 });
		env.lighting = lighting;
	},
});

function buildDeck(b, m) {
	const { halfWidth, front, back, height } = DECK;
	const depth = back - front;
	const midZ = (front + back) / 2;

	// Floor with the window opening (the floor's local y runs from the back
	// wall towards the front), the opening's thick edges and its glass.
	const floorOpening = { x: FLOOR_WINDOW.x, y: back - (FLOOR_WINDOW.z + FLOOR_WINDOW.depth / 2), width: FLOOR_WINDOW.width, height: FLOOR_WINDOW.depth };
	const floor = wallWithOpenings(halfWidth * 2, depth, [floorOpening], 2);
	b.add(floor, m.deck, { position: [0, 0, back], rotation: [-Math.PI / 2, 0, 0], walkable: true });
	frameOpening(b, m, FLOOR_WINDOW, 0, -FLOOR_THICKNESS);
	b.add(new THREE.PlaneGeometry(FLOOR_WINDOW.width, FLOOR_WINDOW.depth), m.glass, {
		position: [FLOOR_WINDOW.x, -0.02, FLOOR_WINDOW.z],
		rotation: [-Math.PI / 2, 0, 0],
		walkable: true,
	});
	for (const [w, d, x, z] of rimOf(FLOOR_WINDOW, 0.03)) b.add(box(w, 0.02, d), m.strip, { position: [x, 0.01, z] });
	// Structural beams under the glass, so it still reads as a floor.
	const beamY = -0.12;
	for (let i = 1; i < 4; i++) {
		const x = FLOOR_WINDOW.x - FLOOR_WINDOW.width / 2 + (FLOOR_WINDOW.width * i) / 4;
		b.add(box(0.12, 0.2, FLOOR_WINDOW.depth), m.rib, { position: [x, beamY, FLOOR_WINDOW.z] });
	}
	for (let i = 1; i < 4; i++) {
		const z = FLOOR_WINDOW.z - FLOOR_WINDOW.depth / 2 + (FLOOR_WINDOW.depth * i) / 4;
		b.add(box(FLOOR_WINDOW.width, 0.2, 0.12), m.rib, { position: [FLOOR_WINDOW.x, beamY, z] });
	}

	// Ceiling with the skylight (the ceiling's local y runs from the front wall
	// towards the back), crossed by ribs.
	const skylightOpening = { x: SKYLIGHT.x, y: (SKYLIGHT.z - SKYLIGHT.depth / 2) - front, width: SKYLIGHT.width, height: SKYLIGHT.depth };
	b.add(wallWithOpenings(halfWidth * 2, depth, [skylightOpening], 2), m.darkPanel, { position: [0, height, front], rotation: [Math.PI / 2, 0, 0] });
	frameOpening(b, m, SKYLIGHT, height, 0.5);
	for (let z = SKYLIGHT.z - SKYLIGHT.depth / 2 + 2.5; z < SKYLIGHT.z + SKYLIGHT.depth / 2 - 0.5; z += 2.5) {
		b.add(roundedBox(SKYLIGHT.width, 0.25, 0.25, 0.08, 1), m.rib, { position: [SKYLIGHT.x, height + 0.3, z] });
	}
	for (const x of [-SKYLIGHT.width / 3, 0, SKYLIGHT.width / 3]) {
		b.add(roundedBox(0.25, 0.25, SKYLIGHT.depth, 0.08, 1), m.rib, { position: [x, height + 0.32, SKYLIGHT.z] });
	}
	// Light lines on the solid ceiling, along the walls.
	for (const x of [-7.1, 7.1]) b.add(box(0.12, 0.02, depth - 2), m.ceilingLight, { position: [x, height - 0.02, midZ] });

	// Side walls: white panels between ribs, cyan strips along floor and top.
	for (const side of [-1, 1]) {
		const x = side * halfWidth;
		const inward = -side;
		b.add(new THREE.PlaneGeometry(depth, height), m.panel, { position: [x, height / 2, midZ], rotation: [0, inward * Math.PI / 2, 0] });
		for (let z = front + 2; z < back; z += 2.5) {
			b.add(roundedBox(0.3, height, 0.4, 0.08, 1), m.rib, { position: [x + inward * 0.15, height / 2, z] });
		}
		for (const y of [0.15, height - 0.35]) {
			b.add(box(0.04, 0.05, depth - 0.5), m.strip, { position: [x + inward * 0.33, y, midZ] });
			b.add(new THREE.PlaneGeometry(depth - 0.5, 0.6), m.stripGlow, { position: [x + inward * 0.31, y, midZ], rotation: [0, inward * Math.PI / 2, 0] });
		}
	}
	// Front wall (the screen hangs on it) and back wall.
	b.add(new THREE.PlaneGeometry(halfWidth * 2, height), m.panel, { position: [0, height / 2, front] });
	for (const x of [-halfWidth + 1, halfWidth - 1]) {
		b.add(roundedBox(0.3, height, 0.4, 0.08, 1), m.rib, { position: [x, height / 2, front + 0.15] });
	}
	b.add(box(halfWidth * 2, 0.05, 0.04), m.strip, { position: [0, 0.15, front + 0.33] });
	b.add(new THREE.PlaneGeometry(halfWidth * 2, height), m.panel, { position: [0, height / 2, back], rotation: [0, Math.PI, 0] });
	b.add(box(halfWidth * 2, 0.05, 0.04), m.strip, { position: [0, 0.15, back - 0.33] });
}

/** Four bars around an opening ({x, z, width, depth}), slightly inside it. */
function rimOf(opening, thickness) {
	const { x, z, width, depth } = opening;
	return [
		[width, thickness, x, z - depth / 2 + thickness / 2],
		[width, thickness, x, z + depth / 2 - thickness / 2],
		[thickness, depth, x - width / 2 + thickness / 2, z],
		[thickness, depth, x + width / 2 - thickness / 2, z],
	];
}

/** The thickness around an opening in the floor or ceiling (walls going from `y` by `height`). */
function frameOpening(b, m, opening, y, height) {
	const { x, z, width, depth } = opening;
	const h = Math.abs(height);
	const cy = y + height / 2;
	b.add(new THREE.PlaneGeometry(width, h), m.darkPanel, { position: [x, cy, z - depth / 2] });
	b.add(new THREE.PlaneGeometry(width, h), m.darkPanel, { position: [x, cy, z + depth / 2] });
	b.add(new THREE.PlaneGeometry(depth, h), m.darkPanel, { position: [x - width / 2, cy, z], rotation: [0, Math.PI / 2, 0] });
	b.add(new THREE.PlaneGeometry(depth, h), m.darkPanel, { position: [x + width / 2, cy, z], rotation: [0, Math.PI / 2, 0] });
}
