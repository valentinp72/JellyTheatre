// Jungle hammock: lie back in a hammock in the rainforest at night. The
// screen is a sheet stretched taut between two great trees above your feet,
// framed by a gap in the canopy full of stars. Buttress roots, lianas, palms
// and ferns all around, fireflies drifting, glowing mushrooms, a campfire, a
// lantern on a pole, and your boots under the hammock.
//
// Made for lying down (in bed): the screen hangs above, tilted towards the
// viewer, whose head goes on the hammock's pillow end (layout `head`).

import * as THREE from 'three';
import { StaticBuilder } from '../kit/builder.js';
import { defineEnvironment } from '../kit/environment.js';
import { Candles } from '../kit/decor.js';
import { Fire } from '../kit/fire.js';
import { box, roundedBox, tiledPlane } from '../kit/geometry.js';
import { EnvironmentLighting, glowMaterial } from '../kit/lighting.js';
import { buttressRoots, Fireflies, PlantCards, rope, sagging, treeline, trunk } from '../kit/nature.js';
import { Placer } from '../kit/props.js';
import { gradientSky, moon, starfield } from '../kit/sky.js';
import * as textures from '../kit/textures.js';

// The viewer's eyes, lying in the hammock (head towards +z, feet towards -z).
const HEAD = new THREE.Vector3(0, 1.4, 0);
// The screen, seen this high above the horizon and this far away.
const SCREEN_ELEVATION = THREE.MathUtils.degToRad(58);
const SCREEN_DISTANCE = 5.2;
const SCREEN_SIZE = { maxWidth: 4.8, maxHeight: 2.7 };
const SCREEN_DIRECTION = new THREE.Vector3(0, Math.sin(SCREEN_ELEVATION), -Math.cos(SCREEN_ELEVATION));
const SCREEN_CENTER = HEAD.clone().addScaledVector(SCREEN_DIRECTION, SCREEN_DISTANCE);
// The two trees holding the screen, and the hammock's: a big tree behind the
// head, and one at the feet, behind the screen (it hides its top).
const SCREEN_TREES = [new THREE.Vector3(-3.75, 0, -2.75), new THREE.Vector3(3.75, 0, -2.75)];
const HEAD_TREE = new THREE.Vector3(0.15, 0, 2.95);
const FOOT_TREE = new THREE.Vector3(0, 0, -5.6);
const FIRE = new THREE.Vector3(2.15, 0, 0.75);
const LANTERN_POLE = new THREE.Vector3(-1.25, 0, -0.95);
const MOON_DIRECTION = new THREE.Vector3(0.8, 0.5, 0.15).normalize();
// Nothing in the way of the screen: the sky stays open around it.
const VIEW_CONE = THREE.MathUtils.degToRad(33);
const SKY_WINDOW = THREE.MathUtils.degToRad(46);
// How far a firefly can wander from its spot (m; its path reaches 2.2 × roam).
const FIREFLY_ROAM = 0.9;

export const jungleLayout = {
	screen: {
		position: { x: SCREEN_CENTER.x, y: SCREEN_CENTER.y, z: SCREEN_CENTER.z },
		...SCREEN_SIZE,
		tilt: THREE.MathUtils.radToDeg(SCREEN_ELEVATION),
	},
	seat: { x: 0, y: 0, z: 0 },
	head: { x: HEAD.x, y: HEAD.y, z: HEAD.z },
	screenLight: true,
};

/** Angle between the direction from the eyes to `point` and `direction`. */
const angleFromEyes = (point, direction) => point.clone().sub(HEAD).angleTo(direction);

/**
 * Whether a vertical trunk from the ground to `height` would hide part of the
 * screen (`margin`: extra angle, radians, for things spreading out).
 */
function blocksScreen(x, z, height, margin = 0) {
	for (let y = 0; y <= height; y += 0.5) {
		const point = new THREE.Vector3(x, y, z);
		// Only what stands between the eyes and the screen hides it.
		if (point.distanceTo(HEAD) < SCREEN_DISTANCE + 1 && angleFromEyes(point, SCREEN_DIRECTION) < VIEW_CONE + margin) return true;
	}
	return false;
}

defineEnvironment('jungle', {
	build(env) {
		const b = new StaticBuilder();
		const lambert = (options) => new THREE.MeshLambertMaterial(options);
		const basic = (options) => new THREE.MeshBasicMaterial(options);
		const m = {
			ground: lambert({ map: textures.leafLitter() }),
			bark: lambert({ map: textures.bark() }),
			paleBark: lambert({ map: textures.bark('#6a5a48', '#4a6a30') }),
			fungus: lambert({ color: '#c9a46a' }),
			sheet: lambert({ map: textures.fabric('#b8b4a8') }),
			hem: lambert({ color: '#8a8272' }),
			rope: lambert({ color: '#a08a62' }),
			vine: lambert({ color: '#3a3a22' }),
			hammock: lambert({ map: textures.stripes(['#8a3a2c', '#b8924a', '#c8bca2', '#2f6462', '#2a3458']), side: THREE.DoubleSide }),
			bamboo: lambert({ color: '#9a9a5a' }),
			metal: lambert({ color: '#2a2a28' }),
			brass: lambert({ color: '#8a6a32' }),
			glass: basic({ color: '#ffd08a', transparent: true, opacity: 0.25, depthWrite: false }),
			stone: lambert({ map: textures.stone('#6a665e') }),
			leather: lambert({ map: textures.leather('#4a2e1c') }),
			sole: lambert({ color: '#1a1410' }),
			canvas: lambert({ map: textures.fabric('#4a5a3a') }),
			tin: lambert({ color: '#7a8088' }),
			wax: lambert({ color: '#efe3c8' }),
			mushroom: basic({ color: '#4fe0b4' }),
			stalk: basic({ color: '#2a7a66' }),
		};

		b.add(tiledPlane(90, 90, 3), m.ground, { rotation: [-Math.PI / 2, 0, 0] });
		const plants = new PlantCards();
		heroTrees(b, m, plants);
		forest(env.group, plants);
		screenSheet(b, m);
		hammock(b, m);
		undergrowth(plants);
		lianas(b, m, plants);
		mushrooms(b, m);
		camp(b, m);
		const candles = new Candles(env.group, b, m, [[LANTERN_POLE.x + 0.42, 1.63, LANTERN_POLE.z, 0.07]]);
		env.group.add(b.build(), plants.build());

		const lighting = new EnvironmentLighting(env.group, {
			sceneEl: env.sceneEl,
			screenLightPosition: SCREEN_CENTER.clone().addScaledVector(SCREEN_DIRECTION, -1.5),
			screenLightDistance: 14,
			screenLightScale: 0.6,
			ambient: '#9fb6d0',
			sky: '#7a96c0',
			ground: '#1c2614',
			ambientIntensity: 0.8,
			hemiIntensity: 2.6,
		});
		env.lighting = lighting;
		// The lantern's glass and halo dim for the film (it is turned down).
		lighting.addFixture(m.glass, { min: 0.3 });
		const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), glowMaterial(textures.glow(), '#ffb866', 0.5));
		halo.position.set(LANTERN_POLE.x + 0.42, 1.71, LANTERN_POLE.z);
		halo.rotation.y = Math.atan2(HEAD.x - halo.position.x, HEAD.z - halo.position.z);
		lighting.addGlow(halo.material, { min: 0.3 });
		env.group.add(halo);


		env.effects = [
			new Fire(env.group, { position: FIRE.clone().setY(0.05), width: 0.5, lighting, intensity: 1.2 }),
			new Moonlight(env.group, lighting),
			new Lantern(env.group, new THREE.Vector3(LANTERN_POLE.x + 0.42, 1.73, LANTERN_POLE.z), lighting),
			candles,
			new Fireflies(env.group, fireflySpots(), { roam: FIREFLY_ROAM / 2.2 }),
		];
		env.group.add(sky());
	},
});

/**
 * The two trees holding the screen and the two the hammock hangs from (behind
 * the head, and behind the screen). Their crowns spread outwards, leaving the
 * sky open above the screen.
 */
function heroTrees(b, m, plants) {
	const trees = [
		{ base: SCREEN_TREES[0], height: 19, radius: 0.55, seed: 3, crown: new THREE.Vector3(-8, 17, -4) },
		{ base: SCREEN_TREES[1], height: 21, radius: 0.6, seed: 5, crown: new THREE.Vector3(8, 18, -3) },
		{ base: HEAD_TREE, height: 20, radius: 0.65, seed: 7, crown: new THREE.Vector3(0, 17, 7) },
		// Its top and limb stay hidden behind the screen.
		{ base: FOOT_TREE, height: 16, radius: 0.58, seed: 11, crown: new THREE.Vector3(0.4, 15.5, -7.2) },
	];
	for (const { base, height, radius, seed, crown } of trees) {
		const p = new Placer(b, [base.x, base.y, base.z]);
		p.add(trunk({ height, radius, top: radius * 0.45, bend: 0.25, seed }), m.bark);
		for (const fin of buttressRoots({ radius, count: 5, height: 1.5, reach: 1.4, seed })) p.add(fin, m.bark);
		// Big limbs up to the crown, which hides among the canopy.
		const fork = new THREE.Vector3(base.x, height * 0.75, base.z);
		b.add(rope([fork, fork.clone().lerp(crown, 0.5).add(new THREE.Vector3(0, 1.2, 0)), crown], radius * 0.35, { radial: 7 }), m.bark);
		const rand = textures.random(seed);
		for (let i = 0; i < 9; i++) {
			const spot = crown.clone().add(new THREE.Vector3((rand() - 0.5) * 7, (rand() - 0.5) * 3, (rand() - 0.5) * 7));
			if (angleFromEyes(spot, SCREEN_DIRECTION) > SKY_WINDOW) plants.clump(spot, { size: 5, cards: 3, seed: seed * 10 + i });
		}
		// Epiphytes (bromeliads) and ferns perched on the trunk.
		for (let i = 0; i < 4; i++) {
			const angle = rand() * Math.PI * 2;
			const y = 2.5 + rand() * (height * 0.5);
			const spot = new THREE.Vector3(base.x + Math.cos(angle) * radius * 0.75, y, base.z + Math.sin(angle) * radius * 0.75);
			if (!plantHidesScreen(spot, 1)) plants.plant(i % 2 ? 'frond' : 'broad', spot, { count: 6, size: i % 2 ? [0.35, 0.8] : [0.18, 0.5], rise: 0.6, color: '#7a9a46', seed: seed * 7 + i });
		}
	}

	// Bracket fungi on the foot tree.
	const f = new Placer(b, [FOOT_TREE.x, 0, FOOT_TREE.z]);
	for (const [angle, y, size] of [[0.6, 0.9, 0.22], [0.9, 1.15, 0.16], [2.6, 0.6, 0.26], [1.8, 1.4, 0.18], [2.2, 1.2, 0.14]]) {
		const bracket = new THREE.CylinderGeometry(size, size, 0.035, 12, 1, false, 0, Math.PI);
		f.add(bracket, m.fungus, [Math.cos(angle) * 0.55, y, Math.sin(angle) * 0.55], [0, -angle + Math.PI / 2, 0]);
	}
}

/** The rest of the forest: trunks fading into the dark, and the canopy. */
function forest(group, plants) {
	const rand = textures.random(29);
	const geometry = trunk({ height: 1, radius: 1, top: 0.6, bend: 0.04, seed: 31, scale: 1 });
	const trunks = [];
	for (let attempt = 0; trunks.length < 46 && attempt < 400; attempt++) {
		const angle = rand() * Math.PI * 2;
		const distance = 7 + rand() * 28;
		const x = Math.cos(angle) * distance;
		const z = Math.sin(angle) * distance;
		let height = 14 + rand() * 10;
		if (blocksScreen(x, z, height)) continue;
		// Behind the screen, the crown stays below it.
		while (height > 6 && angleFromEyes(new THREE.Vector3(x, height + 2, z), SCREEN_DIRECTION) < VIEW_CONE + 0.15) height -= 1;
		if (height <= 6) continue;
		// Keep the moon in view.
		if (angleFromEyes(new THREE.Vector3(x, Math.min(height, distance * 0.6), z), MOON_DIRECTION) < 0.25) continue;
		const radius = 0.25 + rand() * 0.45;
		trunks.push({ x, z, height, radius, distance });
	}
	const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ map: textures.bark('#3e3428', '#34482a') }), trunks.length);
	const matrix = new THREE.Matrix4();
	trunks.forEach(({ x, z, height, radius, distance }, i) => {
		const lean = new THREE.Euler((rand() - 0.5) * 0.08, rand() * 6, (rand() - 0.5) * 0.08);
		matrix.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(lean), new THREE.Vector3(radius, height, radius));
		mesh.setMatrixAt(i, matrix);
		// Further trees fade into the night (no fog: it would also cover the menus).
		mesh.setColorAt(i, new THREE.Color(1, 1, 1).multiplyScalar(Math.max(0.3, 1.1 - distance / 40)));
		// A crown among the canopy, and leaves along the way up.
		const crown = new THREE.Vector3(x, height, z);
		if (angleFromEyes(crown, SCREEN_DIRECTION) > VIEW_CONE + 0.15) plants.clump(crown, { size: 6, cards: 3, color: '#456e38', seed: 40 + i });
	});
	mesh.computeBoundingSphere();
	group.add(mesh);

	// The canopy: a ceiling of leaves, open around the screen and towards the moon.
	for (let i = 0; i < 160; i++) {
		const angle = rand() * Math.PI * 2;
		const distance = 3 + Math.sqrt(rand()) * 34;
		const spot = new THREE.Vector3(Math.cos(angle) * distance, 12 + rand() * 9, Math.sin(angle) * distance);
		if (angleFromEyes(spot, SCREEN_DIRECTION) < SKY_WINDOW || angleFromEyes(spot, MOON_DIRECTION) < 0.2) continue;
		plants.clump(spot, { size: 6, cards: 2, color: rand() < 0.5 ? '#3f6a34' : '#4d7a3c', seed: 100 + i });
	}
}

/**
 * The screen: a sheet stretched between the two trees by ropes from its
 * corners and sides, with a hem and grommets.
 */
function screenSheet(b, m) {
	const width = SCREEN_SIZE.maxWidth + 0.16;
	const height = SCREEN_SIZE.maxHeight + 0.16;
	const pose = new THREE.Matrix4().compose(SCREEN_CENTER, new THREE.Quaternion().setFromEuler(new THREE.Euler(SCREEN_ELEVATION, 0, 0)), new THREE.Vector3(1, 1, 1));
	const at = (x, y, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(pose);
	const place = (geometry, material, x, y, z = 0) => {
		geometry.translate(x, y, z);
		geometry.applyMatrix4(pose);
		b.add(geometry, material);
	};
	place(new THREE.PlaneGeometry(width, height), m.sheet, 0, 0, -0.03);
	for (const [w, h, x, y] of [[width, 0.05, 0, height / 2], [width, 0.05, 0, -height / 2], [0.05, height, width / 2, 0], [0.05, height, -width / 2, 0]]) {
		place(box(w, h, 0.012), m.hem, x, y, -0.03);
	}
	// On each side, ropes from the grommets fan in to one knot on the trunk,
	// in the sheet's own plane: pulled tight, they keep it leaning back.
	for (const side of [-1, 1]) {
		const tree = SCREEN_TREES[side < 0 ? 0 : 1];
		const knot = at(side * (Math.abs(tree.x) - 0.45), 0, -0.03);
		b.add(new THREE.TorusGeometry(0.5, 0.02, 4, 16), m.rope, { position: [tree.x, knot.y, tree.z], rotation: [Math.PI / 2, 0, 0] });
		for (const y of [height / 2, height / 6, -height / 6, -height / 2]) {
			const gy = y - Math.sign(y) * 0.03;
			place(new THREE.TorusGeometry(0.025, 0.007, 4, 10), m.metal, side * (width / 2 - 0.03), gy, -0.025);
			b.add(rope([at(side * (width / 2 - 0.03), gy, -0.03), knot], 0.009, { segments: 1 }), m.rope);
		}
	}
}

/**
 * The hammock, from the tree at the feet to the tree at the head: striped fabric
 * sagging under the body, its sides rising around the viewer, gathered at
 * both ends into strings and ropes.
 */
function hammock(b, m) {
	// Short behind the head and low under it, so the fabric never comes close
	// to the eyes when looking around.
	const foot = new THREE.Vector3(0, 1.85, -2.1);
	const headEnd = new THREE.Vector3(0, 1.45, 0.9);
	const low = { z: -0.9, y: 0.95 };
	const centerline = (z) => {
		const k = z < low.z ? (foot.y - low.y) / (foot.z - low.z) ** 2 : (headEnd.y - low.y) / (headEnd.z - low.z) ** 2;
		return low.y + k * (z - low.z) ** 2;
	};
	const along = 40;
	const across = 12;
	const positions = [];
	const uvs = [];
	const indices = [];
	for (let i = 0; i <= along; i++) {
		const t = i / along;
		const z = foot.z + (headEnd.z - foot.z) * t;
		const width = 0.1 + 0.6 * Math.sin(Math.PI * t) ** 0.7;
		const rise = 0.22 * Math.sin(Math.PI * t) ** 1.5;
		for (let j = 0; j <= across; j++) {
			const v = (j / across) * 2 - 1;
			positions.push(v * width, centerline(z) + rise * v * v - 0.02 * (1 - v * v), z);
			uvs.push(j / across, (t * 3.6) / 1);
		}
	}
	for (let i = 0; i < along; i++) {
		for (let j = 0; j < across; j++) {
			const a = i * (across + 1) + j;
			const c = a + across + 1;
			indices.push(a, c, a + 1, a + 1, c, c + 1);
		}
	}
	const fabric = new THREE.BufferGeometry();
	fabric.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	fabric.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	fabric.setIndex(indices);
	fabric.computeVertexNormals();
	b.add(fabric, m.hammock);

	// Gathered ends: a ring, and the suspension ropes up to the trees.
	const ties = [
		{ end: foot, ring: foot.clone().add(new THREE.Vector3(0, 0.08, -0.2)), anchor: new THREE.Vector3(FOOT_TREE.x, 3.5, FOOT_TREE.z + 0.58), trunk: FOOT_TREE, radius: 0.6, sag: 0.1 },
		{ end: headEnd, ring: headEnd.clone().add(new THREE.Vector3(0, 0.1, 0.45)), anchor: new THREE.Vector3(HEAD_TREE.x, 2.6, HEAD_TREE.z - 0.64), trunk: HEAD_TREE, radius: 0.68, sag: 0.06 },
	];
	for (const { end, ring, anchor, trunk: tree, radius, sag } of ties) {
		for (let j = 0; j <= 6; j++) {
			const x = ((j / 6) * 2 - 1) * 0.11;
			b.add(rope([new THREE.Vector3(x, end.y + 0.02, end.z), ring], 0.004, { segments: 1, radial: 4 }), m.rope);
		}
		b.add(new THREE.TorusGeometry(0.035, 0.009, 5, 12), m.metal, { position: [ring.x, ring.y, ring.z] });
		b.add(rope(sagging(ring, anchor, sag, 10), 0.011), m.rope);
		b.add(new THREE.TorusGeometry(radius, 0.022, 4, 18), m.rope, { position: [tree.x, anchor.y, tree.z], rotation: [Math.PI / 2, 0, 0] });
	}

	// Things on the ground: boots under the hammock, a backpack against the tree.
	for (const [x, z, turn] of [[-0.18, -0.55, 0.15], [0.05, -0.62, -0.25]]) {
		const p = new Placer(b, [x, 0, z], turn);
		p.add(roundedBox(0.11, 0.06, 0.28, 0.025), m.sole, [0, 0.03, 0]);
		p.add(roundedBox(0.1, 0.09, 0.2, 0.03), m.leather, [0, 0.095, 0.035]);
		p.add(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 10), m.leather, [0, 0.2, 0.06]);
	}
	const pack = new Placer(b, [HEAD_TREE.x + 0.75, 0, HEAD_TREE.z - 0.55], -0.6);
	pack.add(roundedBox(0.36, 0.5, 0.22, 0.07), m.canvas, [0, 0.25, 0], [-0.2, 0, 0]);
	pack.add(roundedBox(0.3, 0.18, 0.1, 0.04), m.canvas, [0, 0.18, -0.14], [-0.2, 0, 0]);
	pack.add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), m.hammock, [0, 0.55, 0.02], [0, 0, Math.PI / 2]);
	for (const x of [-0.1, 0.1]) pack.add(box(0.035, 0.45, 0.012), m.leather, [x, 0.27, 0.12], [-0.2, 0, 0]);
}

/**
 * Whether a plant at `base`, its leaves reaching `reach` around, would hide
 * part of the screen.
 */
function plantHidesScreen(base, reach) {
	const center = base.clone().add(new THREE.Vector3(0, reach * 0.4, 0));
	const distance = center.distanceTo(HEAD);
	if (distance > SCREEN_DISTANCE + 1) return false;
	return angleFromEyes(center, SCREEN_DIRECTION) - Math.asin(Math.min(1, reach / distance)) < VIEW_CONE;
}

/** Palms, banana plants and ferns around the clearing (never in front of the screen). */
function undergrowth(plants) {
	const rand = textures.random(53);
	const clear = (x, z) => (Math.abs(x) < 1.0 && z > -6.4 && z < 3.4) || Math.hypot(x - FIRE.x, z - FIRE.z) < 1.3;
	const kinds = [
		// Banana plant: a short stem and big broad leaves.
		{ kind: 'broad', share: 0.3, stem: 1.0, count: 6, size: [0.7, 1.9], rise: 0.7, color: '#6a9a3e', near: 3 },
		// Young palm: long fronds.
		{ kind: 'frond', share: 0.25, stem: 0.4, count: 8, size: [1.0, 2.0], rise: 0.85, color: '#5a8a38', near: 3 },
		// Ferns and low leaves.
		{ kind: 'frond', share: 0.3, stem: 0, count: 7, size: [0.45, 0.95], rise: 0.75, color: '#4f7a34', near: 1.6 },
		{ kind: 'broad', share: 0.15, stem: 0, count: 5, size: [0.35, 0.8], rise: 0.8, color: '#557f36', near: 1.6 },
	];
	let placed = 0;
	for (let attempt = 0; placed < 70 && attempt < 800; attempt++) {
		const angle = rand() * Math.PI * 2;
		const distance = 1.3 + rand() ** 1.4 * 14;
		const x = Math.cos(angle) * distance;
		const z = Math.sin(angle) * distance;
		let pick = rand();
		const type = kinds.find((k) => (pick -= k.share) < 0) ?? kinds[0];
		const base = new THREE.Vector3(x, type.stem * (1 + rand() * 0.5), z);
		const reach = type.size[1] * 1.25;
		if (clear(x, z) || Math.hypot(x, z) < type.near || plantHidesScreen(base, reach)) continue;
		plants.plant(type.kind, base, { count: type.count, size: type.size, rise: type.rise, color: type.color, seed: 200 + placed });
		placed++;
	}
}

/** Lianas hanging from the canopy and looping between the trees. */
function lianas(b, m, plants) {
	const rand = textures.random(61);
	const loops = [
		[new THREE.Vector3(-3.6, 9, -2.6), new THREE.Vector3(-6.5, 7, 1.5), 2.2],
		[new THREE.Vector3(3.7, 10, -2.5), new THREE.Vector3(6, 6, 2.5), 1.8],
		[new THREE.Vector3(0.3, 8, 3.0), new THREE.Vector3(-4.5, 9.5, 5), 2.5],
		[new THREE.Vector3(0.3, 7, 3.0), new THREE.Vector3(5, 8, 4.5), 2.0],
	];
	for (const [a, end, sag] of loops) {
		const points = sagging(a, end, sag, 14);
		b.add(rope(points, 0.035), m.vine);
		// Leaves sprouting along the way.
		for (let i = 2; i < points.length - 1; i += 2) {
			plants.leaf('broad', points[i], new THREE.Quaternion().setFromEuler(new THREE.Euler(2.2 + rand(), rand() * 6.28, 0, 'YXZ')), [0.16, 0.3], '#6a9040');
		}
	}
	// Straight down from the canopy, with a few leaves.
	const hanging = [[-2.4, 1.6], [-4.8, -0.5], [4.6, 0.6], [2.8, 2.6], [-2.2, 3.6], [5.5, -4.5], [-5.6, -5.0], [1.6, 5.2]];
	for (const [x, z] of hanging) {
		const bottom = 1.2 + rand() * 2.5;
		const top = new THREE.Vector3(x, 13, z);
		const points = [top, new THREE.Vector3(x + 0.2, (13 + bottom) / 2, z - 0.15), new THREE.Vector3(x - 0.1, bottom, z + 0.1)];
		b.add(rope(points, 0.02 + rand() * 0.015, { radial: 4 }), m.vine);
		for (let y = bottom + 0.3; y < 9; y += 1.1 + rand()) {
			plants.leaf('broad', new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, rand() * 6.28, 0, 'YXZ')), [0.14, 0.26], '#6a9040');
		}
	}
}

/** Glowing mushrooms in the roots: little lights that stay on in the dark. */
function mushrooms(b, m) {
	const rand = textures.random(67);
	const clusters = [[FOOT_TREE.x + 0.65, FOOT_TREE.z + 0.3], [FOOT_TREE.x - 0.6, FOOT_TREE.z + 0.45], [HEAD_TREE.x - 0.8, HEAD_TREE.z - 0.3], [SCREEN_TREES[0].x + 0.75, SCREEN_TREES[0].z + 0.4], [SCREEN_TREES[1].x - 0.7, SCREEN_TREES[1].z + 0.55], [-1.8, 1.4]];
	for (const [cx, cz] of clusters) {
		for (let i = 0; i < 5; i++) {
			const x = cx + (rand() - 0.5) * 0.35;
			const z = cz + (rand() - 0.5) * 0.35;
			const h = 0.04 + rand() * 0.07;
			const r = 0.02 + rand() * 0.03;
			b.add(new THREE.CylinderGeometry(0.006, 0.009, h, 5), m.stalk, { position: [x, h / 2, z] });
			b.add(new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m.mushroom, { position: [x, h, z], scale: [1, 0.6, 1] });
		}
	}
}

/** The campfire's stones and a tin mug; the lantern's pole. */
function camp(b, m) {
	const rand = textures.random(71);
	for (let i = 0; i < 10; i++) {
		const angle = (i / 10) * Math.PI * 2;
		const r = 0.1 + rand() * 0.05;
		b.add(new THREE.DodecahedronGeometry(r, 0), m.stone, { position: [FIRE.x + Math.cos(angle) * 0.42, r * 0.5, FIRE.z + Math.sin(angle) * 0.42], rotation: [rand() * 3, rand() * 3, 0], scale: [1.3, 0.8, 1] });
	}
	const mug = new Placer(b, [FIRE.x - 0.62, 0, FIRE.z - 0.3]);
	mug.add(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), m.tin, [0, 0.05, 0]);
	mug.add(new THREE.TorusGeometry(0.03, 0.006, 4, 10, Math.PI), m.tin, [0.045, 0.05, 0], [0, 0, -Math.PI / 2]);
	// A log to sit on by the fire.
	b.add(new THREE.CylinderGeometry(0.16, 0.18, 1.3, 10), m.paleBark, { position: [FIRE.x + 0.95, 0.15, FIRE.z - 0.1], rotation: [Math.PI / 2, 0.4, 0] });

	// The lantern hangs from the arm of a bamboo pole stuck in the ground.
	const pole = new Placer(b, [LANTERN_POLE.x, 0, LANTERN_POLE.z]);
	pole.add(new THREE.CylinderGeometry(0.025, 0.03, 2.1, 8), m.bamboo, [0, 1.05, 0]);
	for (const y of [0.4, 0.9, 1.4, 1.85]) pole.add(new THREE.CylinderGeometry(0.031, 0.031, 0.02, 8), m.bamboo, [0, y, 0]);
	pole.add(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6), m.bamboo, [0.22, 2.05, 0], [0, 0, Math.PI / 2]);
	pole.add(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4), m.metal, [0.42, 1.98, 0]);
	// The lantern: base, glass, cage and cap around a candle.
	const lantern = new Placer(b, [LANTERN_POLE.x + 0.42, 1.6, LANTERN_POLE.z]);
	lantern.add(new THREE.CylinderGeometry(0.075, 0.08, 0.03, 12), m.brass, [0, 0.015, 0]);
	lantern.add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12, 1, true), m.glass, [0, 0.13, 0]);
	for (let i = 0; i < 4; i++) {
		const angle = (i / 4) * Math.PI * 2 + 0.4;
		lantern.add(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 4), m.metal, [Math.cos(angle) * 0.064, 0.13, Math.sin(angle) * 0.064]);
	}
	lantern.add(new THREE.ConeGeometry(0.085, 0.08, 12), m.brass, [0, 0.27, 0]);
	lantern.add(new THREE.TorusGeometry(0.025, 0.004, 4, 10), m.metal, [0, 0.33, 0]);
}

/** The lantern's warm light, flickering with its candle; turned down for the film. */
class Lantern {
	constructor(parent, position, lighting) {
		this.lighting = lighting;
		this.light = new THREE.PointLight('#ffb35a', 1, 5, 1.8);
		this.light.position.copy(position);
		parent.add(this.light);
		this.time = 0;
	}

	tick(delta) {
		this.time += Math.min(delta, 100) / 1000;
		const t = this.time;
		const flicker = 0.9 + 0.06 * Math.sin(t * 11.3) + 0.04 * Math.sin(t * 27.1 + 1);
		// Turned down for the film, and with the "Room brightness" setting.
		const { level, brightness } = this.lighting;
		this.light.intensity = 0.9 * flicker * (0.25 + 0.75 * level) * Math.min(1, brightness * 2.2);
	}
}

/**
 * Moonlight through the canopy: it follows the "Room brightness" setting, and
 * the film only dims it a little (the moon doesn't go out).
 */
class Moonlight {
	constructor(parent, lighting) {
		this.lighting = lighting;
		this.light = new THREE.DirectionalLight('#9fb4e0', 0);
		this.light.position.copy(MOON_DIRECTION).multiplyScalar(30);
		parent.add(this.light, this.light.target);
		this.tick();
	}

	tick() {
		const { level, brightness } = this.lighting;
		this.light.intensity = 1.1 * brightness * (0.6 + 0.4 * level);
	}
}

/** Where the fireflies roam: around the clearing, never in front of the screen. */
function fireflySpots() {
	const rand = textures.random(79);
	const spots = [];
	for (let attempt = 0; spots.length < 70 && attempt < 600; attempt++) {
		const angle = rand() * Math.PI * 2;
		const distance = 1.6 + rand() * 9;
		const spot = new THREE.Vector3(Math.cos(angle) * distance, 0.3 + rand() ** 1.5 * 4.5, Math.sin(angle) * distance);
		// Away from the screen even where their wandering takes them (they
		// would pass behind the film's layer, and break the picture's depth in 3D).
		const wander = Math.asin(Math.min(1, FIREFLY_ROAM / spot.distanceTo(HEAD)));
		if (angleFromEyes(spot, SCREEN_DIRECTION) - wander < VIEW_CONE + 0.1) continue;
		spots.push(spot);
	}
	return spots;
}

/** The night sky: seen through the gap in the canopy around the screen. */
function sky() {
	const group = new THREE.Group();
	group.add(gradientSky([[0, '#02030a'], [0.35, '#060e1e'], [0.5, '#0b1522'], [0.52, '#030604'], [1, '#010201']], 300));
	group.add(starfield({ count: 1800, radius: 280, minElevation: 0.15, seed: 37 }));
	// The forest beyond the clearing, as dark silhouettes against the sky.
	group.add(treeline({ distance: 44, low: 12, high: 20, color: '#070d0b', seed: 12 }));
	group.add(treeline({ distance: 64, low: 18, high: 28, color: '#040809', seed: 15 }));
	const moonlit = moon({ size: 12 });
	moonlit.position.copy(MOON_DIRECTION).multiplyScalar(240);
	group.add(moonlit);
	return group;
}
