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

const speaker = () => [
	rect(-0.42, -0.13, -0.24, 0.13),
	poly([-0.24, -0.13], [0.02, -0.36], [0.02, 0.36], [-0.24, 0.13]),
];

const ICONS = {
	play: () => [poly([-0.3, -0.4], [0.42, 0], [-0.3, 0.4])],
	pause: () => [rect(-0.32, -0.4, -0.08, 0.4), rect(0.08, -0.4, 0.32, 0.4)],
	stop: () => [rect(-0.32, -0.32, 0.32, 0.32)],
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
