// Cabin by the lake: a log cabin at night. A stone fireplace with a real
// fire, windows onto a moonlit lake (mountains, pines, stars) with rain
// running down the glass, a sofa, an armchair by the fire and a rug.

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { defineEnvironment } from '../kit/environment.js';
import { Fire } from '../kit/fire.js';
import { box, tiledBox, tiledPlane, wallWithOpenings } from '../kit/geometry.js';
import { EnvironmentLighting } from '../kit/lighting.js';
import { WindowRain } from '../kit/rain.js';
import { bookshelf, floorLamp, plant, recliner, rug, sofa, table, tableLamp } from '../kit/props.js';
import { SeatSpots } from '../kit/seating.js';
import { gradientSky, lake, moon, mountains, pines, starfield } from '../kit/sky.js';
import * as textures from '../kit/textures.js';

const ROOM = { halfWidth: 3.6, front: -4, back: 4, height: 3.2 };
// As big as the front wall allows (it fills the space between floor and beams).
const SCREEN = { x: 0, y: 1.6, z: -3.9, maxWidth: 4.6, maxHeight: 2.59 };
const SOFA_Z = 0.6;
const FIREPLACE = { z: 0.2, width: 1.9, depth: 0.7 };
// Windows: on the right wall (seen as [z, y, width, height]) and the back wall ([x, ...]).
const SIDE_WINDOWS = [{ x: -1.5, y: 0.9, width: 1.2, height: 1.3 }, { x: 1.5, y: 0.9, width: 1.2, height: 1.3 }];
const BACK_WINDOW = { x: 0.6, y: 0.85, width: 2.2, height: 1.45 };
const MOON_DIRECTION = new THREE.Vector3(0.75, 0.28, 0.6).normalize();

export const cabinLayout = {
	screen: { position: { x: SCREEN.x, y: SCREEN.y, z: SCREEN.z }, maxWidth: SCREEN.maxWidth, maxHeight: SCREEN.maxHeight },
	seat: { x: 0, y: 0, z: SOFA_Z },
	screenLight: true,
};

defineEnvironment('cabin', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);
		const m = {
			logs: lambert({ map: textures.logs('#80552f') }),
			planks: lambert({ map: textures.planks('#6b4a30') }),
			ceiling: lambert({ map: textures.planks('#5a3d26') }),
			beam: lambert({ map: textures.wood('#4a301c') }),
			stone: lambert({ map: textures.stone('#7a736b') }),
			soot: basic({ color: '#0a0705' }),
			wood: lambert({ map: textures.wood('#5a3a22') }),
			fabric: lambert({ map: textures.fabric('#6b5a45') }),
			leather: lambert({ map: textures.leather('#5a2e1a') }),
			legs: lambert({ color: '#22160e' }),
			metal: lambert({ color: '#3a3430' }),
			pot: lambert({ color: '#8a5a3a' }),
			leaves: lambert({ color: '#3f6b3a', flatShading: true }),
			rug: lambert({ map: textures.rug('#6b2a1e', '#d1b07a', '#2e3a2a') }),
			frame: lambert({ color: '#3a2616' }),
			black: basic({ color: '#050403' }),
			books: ['#7a2e2e', '#2e4a6b', '#3f5a36', '#8a6a3a', '#d8cfbf'].map((color) => lambert({ color })),
			lampShade: basic({ color: '#ffcf8f', side: THREE.DoubleSide }),
		};

		buildRoom(b, m);
		const seats = new SeatSpots();
		seats.add(sofa(b, { fabric: m.fabric, legs: m.legs }, [0, 0, SOFA_Z], 0, { seats: 3 }));
		// Armchair by the fire, turned towards it.
		seats.add(recliner(b, { fabric: m.leather, legs: m.legs }, [-1.9, 0, 2.2], Math.PI / 2 + 0.5));
		env.seats = seats;
		rug(b, m.rug, [0, 0, SOFA_Z - 1.1], 0, { width: 3.2, depth: 2.2 });
		table(b, m, [0, 0, SOFA_Z - 1.2], 0, { width: 1.1, depth: 0.6, height: 0.42 });
		table(b, m, [1.55, 0, SOFA_Z], 0, { width: 0.5, depth: 0.5, height: 0.55 });
		tableLamp(b, m, [1.55, 0.55, SOFA_Z]);
		floorLamp(b, m, [-1.4, 0, SOFA_Z + 0.35]);
		bookshelf(b, m, [-2.3, 0, ROOM.back - 0.2], 0, { width: 1.5, height: 2.1, seed: 12 });
		plant(b, m, [ROOM.halfWidth - 0.4, 0, -3.5], { size: 1.2, seed: 13 });
		env.group.add(b.build());

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: new THREE.Vector3(0, SCREEN.y - 0.2, SCREEN.z + 1),
			screenLightDistance: 9,
			ambient: '#ffdcb8',
			sky: '#ffd0a0',
			ground: '#2a1a10',
		});
		lighting.addFixture(m.lampShade, { min: 0.03 });
		env.lighting = lighting;

		// The fire keeps burning during the film.
		env.effects = [new Fire(env.group, {
			// On the stone hearth, right in front of the opening.
			position: new THREE.Vector3(-ROOM.halfWidth + FIREPLACE.depth + 0.15, 0.12, FIREPLACE.z),
			width: 0.75,
			lighting,
		})];
		env.effects.push(rainOnWindows(env.group));
		env.group.add(outside());
	},
});

function buildRoom(b, m) {
	const { halfWidth, front, back, height } = ROOM;
	const depth = back - front;
	const midZ = (front + back) / 2;
	b.add(tiledPlane(halfWidth * 2, depth, 2), m.planks, { position: [0, 0, midZ], rotation: [-Math.PI / 2, 0, 0], walkable: true });
	b.add(tiledPlane(halfWidth * 2, depth, 2), m.ceiling, { position: [0, height, midZ], rotation: [Math.PI / 2, 0, 0] });
	for (let z = front + 1; z < back; z += 1.6) {
		b.add(tiledBox(halfWidth * 2, 0.22, 0.18, 1), m.beam, { position: [0, height - 0.11, z] });
	}

	// Log walls; the right and back walls have windows.
	b.add(tiledPlane(halfWidth * 2, height, 1), m.logs, { position: [0, height / 2, front] });
	b.add(tiledPlane(depth, height, 1), m.logs, { position: [-halfWidth, height / 2, midZ], rotation: [0, Math.PI / 2, 0] });
	b.add(wallWithOpenings(depth, height, SIDE_WINDOWS, 1), m.logs, { position: [halfWidth, 0, midZ], rotation: [0, -Math.PI / 2, 0] });
	b.add(wallWithOpenings(halfWidth * 2, height, [BACK_WINDOW], 1), m.logs, { position: [0, 0, back], rotation: [0, Math.PI, 0] });
	// (On the right wall, the wall's local x is the world z.)
	for (const w of SIDE_WINDOWS) windowFrame(b, m, [halfWidth - 0.04, w.y, midZ + w.x], w, -Math.PI / 2);
	windowFrame(b, m, [-BACK_WINDOW.x, BACK_WINDOW.y, back - 0.04], BACK_WINDOW, Math.PI);

	// Stone fireplace and chimney on the left wall.
	const fx = -halfWidth + FIREPLACE.depth / 2;
	b.add(tiledBox(FIREPLACE.depth, height, FIREPLACE.width, 1.2), m.stone, { position: [fx, height / 2, FIREPLACE.z] });
	// The hearth opening: a dark recess in front of the stone.
	const opening = { width: 1.0, height: 0.8 };
	b.add(box(0.02, opening.height, opening.width), m.soot, { position: [-halfWidth + FIREPLACE.depth + 0.011, 0.12 + opening.height / 2, FIREPLACE.z] });
	b.add(tiledBox(FIREPLACE.depth + 0.3, 0.12, FIREPLACE.width + 0.3, 1.2), m.stone, { position: [fx + 0.15, 0.06, FIREPLACE.z], walkable: true });
	b.add(tiledBox(0.25, 0.1, FIREPLACE.width + 0.2, 1), m.beam, { position: [-halfWidth + FIREPLACE.depth + 0.1, 1.25, FIREPLACE.z] });

	// Front wall: the screen in a dark wooden frame.
	b.add(new THREE.PlaneGeometry(SCREEN.maxWidth + 0.06, SCREEN.maxHeight + 0.06), m.black, { position: [SCREEN.x, SCREEN.y, SCREEN.z - 0.04] });
	const fw = SCREEN.maxWidth + 0.24;
	const fh = SCREEN.maxHeight + 0.24;
	for (const [w, h, x, y] of [[fw, 0.1, 0, fh / 2], [fw, 0.1, 0, -fh / 2], [0.1, fh, fw / 2, 0], [0.1, fh, -fw / 2, 0]]) {
		b.add(box(w, h, 0.06), m.frame, { position: [SCREEN.x + x, SCREEN.y + y, SCREEN.z - 0.02] });
	}
}

/** Window frame: sill, four sides and a cross of mullions. */
function windowFrame(b, m, [x, y, z], { width, height }, rotationY) {
	const t = 0.07;
	const parts = [
		[width + 2 * t, t, 0, -t / 2], [width + 2 * t, t, 0, height + t / 2],
		[t, height, -(width + t) / 2, height / 2], [t, height, (width + t) / 2, height / 2],
		[0.035, height, 0, height / 2], [width, 0.035, 0, height / 2],
	];
	const rotation = new THREE.Matrix4().makeRotationY(rotationY);
	for (const [w, h, lx, ly] of parts) {
		const offset = new THREE.Vector3(lx, 0, 0).applyMatrix4(rotation);
		b.add(box(w, h, 0.12), m.frame, { position: [x + offset.x, y + ly, z + offset.z], rotation: [0, rotationY, 0] });
	}
}

/** Rain on the window glass (drops and beads), and falling outside. */
function rainOnWindows(group) {
	const { halfWidth, front, back } = ROOM;
	const midZ = (front + back) / 2;
	const panes = SIDE_WINDOWS.map((w) => ({
		center: new THREE.Vector3(halfWidth - 0.02, w.y + w.height / 2, midZ + w.x),
		width: w.width,
		height: w.height,
		rotationY: -Math.PI / 2,
	}));
	panes.push({
		center: new THREE.Vector3(-BACK_WINDOW.x, BACK_WINDOW.y + BACK_WINDOW.height / 2, back - 0.02),
		width: BACK_WINDOW.width,
		height: BACK_WINDOW.height,
		rotationY: Math.PI,
	});
	return new WindowRain(group, {
		panes,
		// Outside the right wall and outside the back wall (never inside).
		outside: [
			{ min: new THREE.Vector3(halfWidth + 0.4, -1.2, front - 2), max: new THREE.Vector3(halfWidth + 9, 5, back + 2) },
			{ min: new THREE.Vector3(-halfWidth - 2, -1.2, back + 0.4), max: new THREE.Vector3(halfWidth + 2, 5, back + 9) },
		],
	});
}

/** The night outside: sky, stars, moon, mountains, a lake and pines. */
function outside() {
	const group = new THREE.Group();
	group.add(gradientSky([[0, '#03050c'], [0.42, '#0b1426'], [0.5, '#1a2236'], [0.55, '#05070c'], [1, '#020305']], 300));
	group.add(starfield({ count: 1500, radius: 280, minElevation: 0.06, seed: 21 }));
	const moonlight = moon({ size: 14 });
	moonlight.position.copy(MOON_DIRECTION).multiplyScalar(240);
	group.add(moonlight);
	group.add(mountains({ distance: 200, height: 38, color: '#0a1020', seed: 4 }));
	group.add(mountains({ distance: 140, height: 22, color: '#070b14', seed: 9 }));
	// The cabin stands on the shore: water below the windows, trees around.
	group.add(lake({ size: 600, y: -1.2, moonDirection: MOON_DIRECTION }));
	// Pines in view of the windows (+x and +z), leaving the moonlit lake open.
	group.add(pines({ count: 40, near: 14, far: 60, from: -0.9, to: 0.35, seed: 5 }));
	group.add(pines({ count: 30, near: 14, far: 60, from: 1.05, to: 2.2, seed: 6 }));
	group.add(pines({ count: 40, near: 70, far: 120, seed: 8 }));
	return group;
}
