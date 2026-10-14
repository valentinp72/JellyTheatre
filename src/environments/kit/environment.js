// Declares an environment: an A-Frame component built from a `build`
// function, with the shared plumbing (lighting updates, seats to teleport
// to, house lights, cleanup) handled here.
//
//   defineEnvironment('theater', {
//     build(env) {
//       env.group.add(...);                         // static scene
//       env.lighting = new EnvironmentLighting(...); // optional
//       env.seats = new SeatRows(...);               // optional: teleport targets
//       env.onTick = (delta) => {...};               // optional
//     },
//   });
//
// The component is `<name>-environment`. Teleporting only lands on seats: an
// environment without `env.seats` has no teleport.

import * as THREE from 'three';

export function defineEnvironment(name, { build }) {
	const component = `${name}-environment`;
	AFRAME.registerComponent(component, {
		init() {
			this.env = {
				group: new THREE.Group(),
				sceneEl: this.el.sceneEl,
				lighting: null,
				seats: null,
				onTick: null,
			};
			build(this.env);
			if (this.env.seats?.group) this.env.group.add(this.env.seats.group);
			this.el.setObject3D('environment', this.env.group);
		},

		setHouseLights(on) {
			this.env.lighting?.setHouseLights(on);
		},

		/** Floor positions of the seats a viewer can teleport to. */
		seatPositions() {
			return this.env.seats?.seats ?? [];
		},

		tick(time, delta) {
			this.env.lighting?.tick(delta);
			for (const effect of this.env.effects ?? []) effect.tick(delta, time);
			this.env.onTick?.(delta, time);
		},

		remove() {
			this.env.lighting?.dispose();
			this.el.removeObject3D('environment');
			// Geometries and materials belong to this environment (textures are
			// shared and cached by the kit).
			this.env.group.traverse((object) => {
				object.geometry?.dispose();
				const materials = Array.isArray(object.material) ? object.material : [object.material];
				for (const material of materials) material?.dispose();
			});
		},
	});
	return component;
}
