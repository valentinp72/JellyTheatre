// Passthrough: no virtual room, the screen floats in your real room
// (immersive-ar session on Quest).

import * as THREE from 'three';

export const passthroughLayout = {
	// A 3.2 m screen, 3.5 m in front of the seat, at a comfortable height.
	screen: { position: { x: 0, y: 1.5, z: -3.5 }, maxWidth: 3.2, maxHeight: 1.8 },
	seat: { x: 0, y: 0, z: 0 },
	ar: true,
};

AFRAME.registerComponent('passthrough-environment', {
	init() {
		// Invisible floor (your real floor) to teleport on.
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ visible: false }));
		floor.rotation.x = -Math.PI / 2;
		floor.userData.teleport = true;
		this.el.setObject3D('floor', floor);
	},

	remove() {
		this.el.removeObject3D('floor');
	},

	setHouseLights() {
		// Your room's lights are yours to dim.
	},
});
