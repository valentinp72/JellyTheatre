// Simple flat icons drawn as geometry (sharp at any size, no font needed).
// Each icon is a list of shapes in a unit square centered on 0 (-0.5..0.5).

import * as THREE from 'three';

const poly = (...points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
const rect = (x1, y1, x2, y2) => poly([x1, y1], [x2, y1], [x2, y2], [x1, y2]);

function frame(x1, y1, x2, y2, thickness) {
	const shape = rect(x1, y1, x2, y2);
	shape.holes.push(rect(x1 + thickness, y1 + thickness, x2 - thickness, y2 - thickness));
	return shape;
}

function circle(radius, x = 0, y = 0) {
	const shape = new THREE.Shape();
	shape.absarc(x, y, radius, 0, Math.PI * 2, false);
	return shape;
}

/** A bar from (x1, y1) to (x2, y2), `width` thick: limbs of the figures. */
function bar(x1, y1, x2, y2, width) {
	const length = Math.hypot(x2 - x1, y2 - y1);
	const nx = (-(y2 - y1) / length) * (width / 2);
	const ny = ((x2 - x1) / length) * (width / 2);
	return poly([x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x2 - nx, y2 - ny], [x2 + nx, y2 + ny]);
}

/** A stick figure from its joints (head, neck, hips, then one limb end after another). */
function figure({ head, neck, hips, limbs }) {
	const shapes = [circle(0.1, ...head), bar(...neck, ...hips, 0.15)];
	for (const [from, ...joints] of limbs) {
		let previous = from;
		for (const joint of joints) {
			shapes.push(bar(...previous, ...joint, 0.11), circle(0.055, ...joint));
			previous = joint;
		}
	}
	return shapes;
}

/** Gear: a ring with teeth. */
function gear() {
	const ring = circle(0.3);
	ring.holes.push(circle(0.13));
	const teeth = [];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		const corner = (r, da) => [Math.cos(a + da) * r, Math.sin(a + da) * r];
		teeth.push(poly(corner(0.26, -0.2), corner(0.45, -0.13), corner(0.45, 0.13), corner(0.26, 0.2)));
	}
	return [ring, ...teeth];
}

const speaker = () => [
	rect(-0.42, -0.13, -0.24, 0.13),
	poly([-0.24, -0.13], [0.02, -0.36], [0.02, 0.36], [-0.24, 0.13]),
];

const ICONS = {
	play: () => [poly([-0.3, -0.4], [0.42, 0], [-0.3, 0.4])],
	pause: () => [rect(-0.32, -0.4, -0.08, 0.4), rect(0.08, -0.4, 0.32, 0.4)],
	stop: () => [rect(-0.32, -0.32, 0.32, 0.32)],
	check: () => [poly([-0.42, 0.02], [-0.26, 0.18], [-0.1, 0.02], [0.26, 0.38], [0.42, 0.22], [-0.1, -0.3])],
	rewind: () => [poly([0.02, -0.3], [-0.42, 0], [0.02, 0.3]), poly([0.44, -0.3], [0, 0], [0.44, 0.3])],
	forward: () => [poly([-0.02, -0.3], [0.42, 0], [-0.02, 0.3]), poly([-0.44, -0.3], [0, 0], [-0.44, 0.3])],
	// Waveform: audio tracks.
	audio: () => [[-0.36, 0.14], [-0.18, 0.32], [0, 0.42], [0.18, 0.24], [0.36, 0.1]]
		.map(([x, h]) => rect(x - 0.06, -h, x + 0.06, h)),
	// Caption box: subtitles.
	subtitles: () => [
		frame(-0.46, -0.32, 0.46, 0.32, 0.08),
		rect(-0.28, -0.14, 0.04, -0.04),
		rect(0.12, -0.14, 0.28, -0.04),
		rect(-0.28, 0.04, -0.1, 0.14),
		rect(-0.02, 0.04, 0.28, 0.14),
	],
	volumeDown: () => [...speaker(), rect(0.14, -0.05, 0.46, 0.05)],
	volumeUp: () => [...speaker(), rect(0.14, -0.05, 0.46, 0.05), rect(0.25, -0.16, 0.35, 0.16)],
	settings: gear,
	// Circular arrow.
	refresh: () => {
		const arc = new THREE.Shape().absarc(0, 0, 0.38, 0.5, Math.PI * 2 - 0.2, false);
		arc.absarc(0, 0, 0.24, Math.PI * 2 - 0.2, 0.5, true);
		const tip = (angle, r) => [Math.cos(angle) * r, Math.sin(angle) * r];
		return [arc, poly(tip(0.5, 0.5), tip(0.5, 0.12), tip(-0.05, 0.31))];
	},
	// Landscape: the environment picker.
	environment: () => [
		poly([-0.46, -0.34], [-0.12, 0.2], [0.22, -0.34]),
		poly([-0.02, -0.34], [0.2, 0.02], [0.46, -0.34]),
		circle(0.1, 0.26, 0.28),
	],
	// Environment tags (picker cards): where you are, how you watch.
	indoor: () => [
		poly([-0.46, 0.04], [0, 0.44], [0.46, 0.04]),
		poly([-0.32, -0.42], [-0.09, -0.42], [-0.09, -0.12], [0.09, -0.12], [0.09, -0.42], [0.32, -0.42], [0.32, 0.06], [-0.32, 0.06]),
	],
	outdoor: () => [
		poly([-0.38, -0.22], [0.38, -0.22], [0, 0.12]),
		poly([-0.3, -0.02], [0.3, -0.02], [0, 0.3]),
		poly([-0.22, 0.16], [0.22, 0.16], [0, 0.46]),
		rect(-0.07, -0.44, 0.07, -0.22),
	],
	// Eye: your real room, seen through the cameras.
	passthrough: () => {
		const eye = new THREE.Shape().moveTo(-0.47, 0).quadraticCurveTo(0, 0.46, 0.47, 0).quadraticCurveTo(0, -0.46, -0.47, 0);
		eye.holes.push(circle(0.17));
		return [eye, circle(0.09)];
	},
	// In a chair, facing right.
	sitting: () => [
		...figure({ head: [-0.08, 0.36], neck: [-0.1, 0.2], hips: [-0.12, -0.08], limbs: [[[-0.12, -0.08], [0.18, -0.08], [0.2, -0.42]], [[-0.1, 0.16], [0.08, 0.02]]] }),
		rect(-0.38, -0.2, 0.12, -0.15),
		rect(-0.38, -0.44, -0.32, 0.22),
		rect(0.06, -0.44, 0.12, -0.15),
	],
	// On a bed (or a hammock), head on the left.
	lying: () => [
		...figure({ head: [-0.34, 0.06], neck: [-0.2, 0.03], hips: [0.1, -0.02], limbs: [[[0.1, -0.02], [0.44, -0.02]]] }),
		rect(-0.48, -0.16, 0.48, -0.1),
		rect(-0.48, -0.36, -0.42, 0.14),
		rect(0.42, -0.36, 0.48, -0.1),
	],
	// Zero g: tilted, limbs spread.
	floating: () => figure({
		head: [0.2, 0.3], neck: [0.1, 0.18], hips: [-0.12, -0.08],
		limbs: [[[-0.12, -0.08], [-0.2, -0.28], [-0.4, -0.32]], [[-0.12, -0.08], [-0.02, -0.3], [-0.12, -0.44]], [[0.08, 0.14], [0.3, 0.06], [0.42, 0.16]], [[0.08, 0.14], [-0.12, 0.24], [-0.24, 0.4]]],
	}),
	// A row of seats: you can change seats.
	seats: () => [-0.32, 0, 0.32].flatMap((x) => [rect(x - 0.1, -0.08, x + 0.1, 0.26), rect(x - 0.13, -0.3, x + 0.13, -0.14), rect(x - 0.03, -0.44, x + 0.03, -0.32)]),
};

const geometryCache = new Map();

function iconGeometry(name) {
	if (!geometryCache.has(name)) {
		const shapes = ICONS[name]?.() ?? [];
		geometryCache.set(name, new THREE.ShapeGeometry(shapes));
	}
	return geometryCache.get(name);
}

AFRAME.registerComponent('ui-icon', {
	schema: {
		name: { type: 'string', default: 'play' },
		size: { type: 'number', default: 0.04 },
		color: { type: 'color', default: '#ece8f1' },
	},

	init() {
		this.material = new THREE.MeshBasicMaterial();
		this.mesh = new THREE.Mesh(iconGeometry(this.data.name), this.material);
		this.el.setObject3D('mesh', this.mesh);
	},

	update() {
		this.mesh.geometry = iconGeometry(this.data.name);
		this.mesh.scale.set(this.data.size, this.data.size, 1);
		this.material.color.set(this.data.color);
	},

	remove() {
		this.el.removeObject3D('mesh');
		this.material.dispose();
	},
});
