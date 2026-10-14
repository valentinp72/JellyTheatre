// Home cinema: a private screening room. Three recliners up front, a sofa on a
// riser behind, wood wainscoting under acoustic fabric, a plaster ceiling with
// a recessed star panel, bookshelves, lamps, plants, a rug, tower speakers and
// slatted acoustic panels beside the screen, a media console under it, art
// posters with picture lights, and a popcorn machine in the corner.

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { defineEnvironment } from '../kit/environment.js';
import { framedPicture, popcornMachine, sideboard } from '../kit/decor.js';
import { box, tiledBox, tiledPlane } from '../kit/geometry.js';
import { EnvironmentLighting, glowMaterial } from '../kit/lighting.js';
import { bookshelf, floorLamp, Placer, plant, recliner, rug, sofa, speaker, table, tableLamp } from '../kit/props.js';
import { SeatSpots } from '../kit/seating.js';
import { ceilingStars } from '../kit/sky.js';
import * as textures from '../kit/textures.js';

const ROOM = { halfWidth: 2.7, front: -3.6, back: 3.4, height: 2.7 };
const SCREEN = { x: 0, y: 1.45, z: -3.5, maxWidth: 3.4, maxHeight: 1.91 };
const RISER = { from: 1.45, top: 0.3 };
const FRONT_ROW_Z = 0.5;
// The recessed star panel in the middle of the ceiling.
const PANEL = { width: 3.4, depth: 4.6, z: -0.3, recess: 0.12 };

export const homeLayout = {
	screen: { position: { x: SCREEN.x, y: SCREEN.y, z: SCREEN.z }, maxWidth: SCREEN.maxWidth, maxHeight: SCREEN.maxHeight },
	seat: { x: 0, y: 0, z: FRONT_ROW_Z },
	screenLight: true,
};

defineEnvironment('home', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);
		const m = {
			carpet: lambert({ map: textures.carpet('#2a1418', '#3d1f26', '#5a3a24') }),
			wainscot: lambert({ map: textures.wood('#5a3a26') }),
			fabricWall: lambert({ map: textures.acousticPanel('#2f3a52') }),
			plaster: lambert({ color: '#4a423c' }),
			starPanel: lambert({ color: '#0e1322' }),
			black: basic({ color: '#050405' }),
			trim: lambert({ color: '#3b2a1e' }),
			wood: lambert({ map: textures.wood('#4a2f20') }),
			fabric: lambert({ map: textures.fabric('#3e4a63') }),
			leather: lambert({ map: textures.leather('#3a2218') }),
			legs: lambert({ color: '#1a1412' }),
			metal: lambert({ color: '#7a6a55' }),
			pot: lambert({ color: '#c9b49a' }),
			leaves: lambert({ color: '#3f6b3a', flatShading: true }),
			rug: lambert({ map: textures.rug('#4a2a2a', '#b8925c', '#2a3550') }),
			cabinet: lambert({ color: '#1c1a1a' }),
			grille: lambert({ map: textures.grille() }),
			books: ['#7a2e2e', '#2e4a6b', '#3f5a36', '#8a6a3a', '#4a3a5a', '#d8cfbf'].map((color) => lambert({ color })),
			pictures: lambert({ map: textures.pictures('poster', { seed: 5 }).texture }),
			popcornBody: lambert({ color: '#9e1b22' }),
			popcorn: lambert({ color: '#f4dc8a', flatShading: true }),
			glass: basic({ color: '#cfe4ff', transparent: true, opacity: 0.12, depthWrite: false }),
			standby: basic({ color: '#3a8bff' }),
			popcornGlow: basic({ color: '#fff0c0' }),
			// Fixtures.
			lampShade: basic({ color: '#ffd9a0', side: THREE.DoubleSide }),
			sconce: basic({ color: '#ffd9a3' }),
			cove: basic({ color: '#ffb878' }),
			sconceGlow: glowMaterial(textures.glow(), '#ffcf8a', 0.45),
		};

		buildRoom(b, m);
		const seats = new SeatSpots();
		for (const x of [-0.95, 0, 0.95]) seats.add(recliner(b, { fabric: m.leather, legs: m.legs }, [x, 0, FRONT_ROW_Z]));
		b.add(tiledBox(ROOM.halfWidth * 2, RISER.top, ROOM.back - RISER.from, 1.2), m.carpet, {
			position: [0, RISER.top / 2, (RISER.from + ROOM.back) / 2],
		});
		b.add(box(ROOM.halfWidth * 2, 0.04, 0.04), m.trim, { position: [0, RISER.top - 0.02, RISER.from + 0.02] });
		seats.add(sofa(b, { fabric: m.fabric, legs: m.legs }, [0, RISER.top, 2.3], 0, { seats: 3 }));
		env.seats = seats;

		// Furniture and props.
		rug(b, m.rug, [0, 0, 0.2], 0, { width: 3.2, depth: 2.2 });
		table(b, m, [-1.75, 0, FRONT_ROW_Z], 0, { width: 0.45, depth: 0.45, height: 0.55 });
		table(b, m, [1.75, 0, FRONT_ROW_Z], 0, { width: 0.45, depth: 0.45, height: 0.55 });
		tableLamp(b, m, [-1.75, 0.55, FRONT_ROW_Z]);
		// Speakers face the audience; the shelves' backs are against the back wall.
		for (const side of [-1, 1]) speaker(b, m, [side * 2.15, 0, -3.25], Math.PI);
		bookshelf(b, m, [-1.95, RISER.top, ROOM.back - 0.2], 0, { width: 1.2, height: 2.0, seed: 3 });
		bookshelf(b, m, [1.95, RISER.top, ROOM.back - 0.2], 0, { width: 1.2, height: 2.0, seed: 8 });
		floorLamp(b, m, [-ROOM.halfWidth + 0.35, RISER.top, RISER.from + 0.3], { height: 1.45 });
		floorLamp(b, m, [ROOM.halfWidth - 0.35, RISER.top, RISER.from + 0.3], { height: 1.45 });
		plant(b, m, [-ROOM.halfWidth + 0.35, 0, FRONT_ROW_Z], { size: 1.1, seed: 2 });
		plant(b, m, [ROOM.halfWidth - 0.35, 0, FRONT_ROW_Z], { size: 1.1, seed: 5 });
		decorate(b, m);
		env.group.add(b.build());

		// Star panel: tiny lights in the recessed part of the ceiling.
		const stars = ceilingStars({
			width: PANEL.width - 0.2,
			depth: PANEL.depth - 0.2,
			y: ROOM.height + PANEL.recess - 0.005,
			center: [0, PANEL.z],
			count: 220,
		});
		env.group.add(stars);

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: new THREE.Vector3(0, SCREEN.y - 0.2, SCREEN.z + 1),
			screenLightDistance: 9,
			ambient: '#ffe2c4',
			sky: '#ffd6a8',
			ground: '#2a1a14',
		});
		lighting.addFixture(m.lampShade, { min: 0.03 });
		// The popcorn machine stays lit during the film, softly (like the stars).
		lighting.addFixture(m.popcornGlow, { min: 0.35, followBrightness: false });
		lighting.addFixture(m.sconce);
		lighting.addFixture(m.cove, { min: 0.05 });
		lighting.addGlow(m.sconceGlow);
		// The star ceiling stays on during the film, softly.
		lighting.addFixture(stars.material, { min: 0.4, followBrightness: false });
		env.lighting = lighting;
	},
});

/** Media console, acoustic panels, posters and the popcorn machine. */
function decorate(b, m) {
	const { halfWidth, front } = ROOM;
	// Media console under the screen (low: the screen starts at 0.5 m), with
	// the center speaker and a standby light.
	sideboard(b, { ...m, cabinet: m.cabinet, wood: m.wood }, [0, 0, front + 0.24], Math.PI, { width: 2.1, height: 0.3, depth: 0.42, doors: 4 });
	const center = new Placer(b, [0, 0.33, front + 0.27], Math.PI);
	center.add(box(0.62, 0.11, 0.24), m.cabinet, [0, 0.055, 0]);
	center.add(new THREE.PlaneGeometry(0.58, 0.08), m.grille, [0, 0.055, -0.121], [0, Math.PI, 0]);
	b.add(box(0.012, 0.012, 0.005), m.standby, { position: [0.9, 0.2, front + 0.47] });

	// Slatted wood diffusers above the tower speakers.
	for (const side of [-1, 1]) {
		const x = side * 2.24;
		b.add(box(0.72, 1.05, 0.02), m.cabinet, { position: [x, 1.95, front + 0.01] });
		for (let i = 0; i < 9; i++) {
			const depth = 0.03 + ((i * 7) % 4) * 0.02;
			b.add(box(0.05, 1.0, depth), m.wood, { position: [x - 0.32 + i * 0.08, 1.95, front + 0.02 + depth / 2] });
		}
	}

	// Art posters with picture lights on the side walls.
	const atlas = textures.pictures('poster', { seed: 5 });
	const posters = [[-1, -2.75], [-1, 0.25], [1, -2.75], [1, -0.55], [1, 0.3]];
	posters.forEach(([side, z], index) => {
		framedPicture(b, { ...m, frame: m.trim }, [side * (halfWidth - 0.03), 1.75, z], side < 0 ? -Math.PI / 2 : Math.PI / 2, { width: 0.56, atlas, index, light: true });
	});

	// Popcorn machine in the front right corner, turned towards the seats.
	popcornMachine(b, { ...m, lampShade: m.popcornGlow }, [2.1, 0, -2.45], Math.PI - 0.6);
	plant(b, m, [-2.2, 0, -2.75], { size: 1.3, seed: 9 });
}

function buildRoom(b, m) {
	const { halfWidth, front, back, height } = ROOM;
	const depth = back - front;
	const midZ = (front + back) / 2;
	const wainscot = 0.95;
	b.add(tiledPlane(halfWidth * 2, depth, 1), m.carpet, { position: [0, 0, midZ], rotation: [-Math.PI / 2, 0, 0] });

	// Ceiling: plaster, with a recessed star panel framed by a lit cove.
	const panelFront = PANEL.z - PANEL.depth / 2;
	const panelBack = PANEL.z + PANEL.depth / 2;
	const ceiling = (w, d, x, z) => b.add(new THREE.PlaneGeometry(w, d), m.plaster, { position: [x, height, z], rotation: [Math.PI / 2, 0, 0] });
	ceiling(halfWidth * 2, panelFront - front, 0, (front + panelFront) / 2);
	ceiling(halfWidth * 2, back - panelBack, 0, (panelBack + back) / 2);
	const sideWidth = halfWidth - PANEL.width / 2;
	for (const side of [-1, 1]) ceiling(sideWidth, PANEL.depth, side * (halfWidth - sideWidth / 2), PANEL.z);
	b.add(new THREE.PlaneGeometry(PANEL.width, PANEL.depth), m.starPanel, { position: [0, height + PANEL.recess, PANEL.z], rotation: [Math.PI / 2, 0, 0] });
	// The recess sides, and a warm cove light running around them.
	for (const [w, d, x, z] of [
		[PANEL.width, 0.02, 0, panelFront], [PANEL.width, 0.02, 0, panelBack],
		[0.02, PANEL.depth, -PANEL.width / 2, PANEL.z], [0.02, PANEL.depth, PANEL.width / 2, PANEL.z],
	]) {
		b.add(box(w, PANEL.recess, d), m.plaster, { position: [x, height + PANEL.recess / 2, z] });
	}
	for (const [w, d, x, z] of [
		[PANEL.width - 0.1, 0.03, 0, panelFront + 0.04], [PANEL.width - 0.1, 0.03, 0, panelBack - 0.04],
		[0.03, PANEL.depth - 0.1, -PANEL.width / 2 + 0.04, PANEL.z], [0.03, PANEL.depth - 0.1, PANEL.width / 2 - 0.04, PANEL.z],
	]) {
		b.add(box(w, 0.02, d), m.cove, { position: [x, height + PANEL.recess - 0.02, z] });
	}
	// Crown molding along the walls.
	for (const side of [-1, 1]) b.add(box(0.08, 0.1, depth), m.trim, { position: [side * (halfWidth - 0.04), height - 0.05, midZ] });
	b.add(box(halfWidth * 2, 0.1, 0.08), m.trim, { position: [0, height - 0.05, back - 0.04] });

	// Side and back walls: wood wainscot below, fabric above, a wooden rail between.
	const walls = [
		{ length: depth, place: (y) => [[-halfWidth, y, midZ], [0, Math.PI / 2, 0]] },
		{ length: depth, place: (y) => [[halfWidth, y, midZ], [0, -Math.PI / 2, 0]] },
		{ length: halfWidth * 2, place: (y) => [[0, y, back], [0, Math.PI, 0]] },
	];
	for (const { length, place } of walls) {
		const [lowPos, rotation] = place(wainscot / 2);
		b.add(tiledPlane(length, wainscot, 1.2), m.wainscot, { position: lowPos, rotation });
		const [highPos] = place(wainscot + (height - wainscot) / 2);
		b.add(new THREE.PlaneGeometry(length, height - wainscot), m.fabricWall, { position: highPos, rotation });
	}
	for (const side of [-1, 1]) {
		b.add(box(0.05, 0.06, depth), m.trim, { position: [side * (halfWidth - 0.025), wainscot, midZ] });
		// Two sconces per side wall.
		for (const z of [-1.6, 1.3]) {
			const p = new Placer(b, [side * (halfWidth - 0.06), 1.9, z], side > 0 ? -Math.PI / 2 : Math.PI / 2);
			p.add(box(0.2, 0.24, 0.08), m.sconce);
			p.add(new THREE.PlaneGeometry(0.9, 1.2), m.sconceGlow, [0, 0.35, 0.02]);
		}
	}
	b.add(box(halfWidth * 2, 0.06, 0.05), m.trim, { position: [0, wainscot, back - 0.025] });

	// Door on the left wall, between the screen and the recliners.
	const door = new Placer(b, [-halfWidth + 0.03, 0, -1.1], Math.PI / 2);
	door.add(tiledBox(0.95, 2.05, 0.05, 1), m.wood, [0, 1.025, 0]);
	door.add(box(1.1, 2.13, 0.03), m.trim, [0, 1.065, -0.02]);

	// Front wall: black, the screen in a thin frame.
	b.add(new THREE.PlaneGeometry(halfWidth * 2, height), m.black, { position: [0, height / 2, front] });
	const fw = SCREEN.maxWidth + 0.22;
	const fh = SCREEN.maxHeight + 0.22;
	for (const [w, h, x, y] of [[fw, 0.07, 0, fh / 2], [fw, 0.07, 0, -fh / 2], [0.07, fh, fw / 2, 0], [0.07, fh, -fw / 2, 0]]) {
		b.add(box(w, h, 0.06), m.trim, { position: [SCREEN.x + x, SCREEN.y + y, SCREEN.z - 0.02] });
	}
}
