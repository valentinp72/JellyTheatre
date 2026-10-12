// A dark, quiet space: a gradient sky and a soft glow on the floor.
// Nothing but the screen to look at.

import * as THREE from 'three';

export const voidLayout = {
	screen: { position: { x: 0, y: 2.6, z: -8 }, maxWidth: 10, maxHeight: 5.6 },
	seat: { x: 0, y: 0, z: 0 },
};

function gradientTexture(stops, width = 4, height = 256) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createLinearGradient(0, 0, 0, height);
	for (const [offset, color] of stops) gradient.addColorStop(offset, color);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, width, height);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function glowTexture() {
	const size = 128;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	gradient.addColorStop(0, 'rgba(120, 90, 160, 0.35)');
	gradient.addColorStop(1, 'rgba(120, 90, 160, 0)');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

AFRAME.registerComponent('void-environment', {
	init() {
		this.group = new THREE.Group();
		const sky = new THREE.Mesh(
			new THREE.SphereGeometry(60, 32, 16),
			new THREE.MeshBasicMaterial({
				map: gradientTexture([[0, '#0b0710'], [0.45, '#140d1d'], [0.55, '#09060d'], [1, '#020103']]),
				side: THREE.BackSide,
				depthWrite: false,
			}),
		);
		const glow = new THREE.Mesh(
			new THREE.PlaneGeometry(14, 14),
			new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }),
		);
		glow.rotation.x = -Math.PI / 2;
		glow.position.set(0, 0.001, -3);
		// Invisible floor to teleport on.
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ visible: false }));
		floor.rotation.x = -Math.PI / 2;
		floor.userData.teleport = true;
		this.group.add(sky, glow, floor);
		this.el.setObject3D('void', this.group);
	},

	setHouseLights() {
		// No lights to dim here.
	},

	remove() {
		this.el.removeObject3D('void');
	},
});
