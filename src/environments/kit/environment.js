// Declares an environment: an A-Frame component built from a `build`
// function, with the shared plumbing (lighting updates, teleport snapping,
// house lights, cleanup) handled here.
//
//   defineEnvironment('theater', {
//     build(env) {
//       env.group.add(...);                         // static scene
//       env.lighting = new EnvironmentLighting(...); // optional
//       env.seats = new SeatRows(...);               // optional: snaps teleports
//       env.onTick = (delta) => {...};               // optional
//     },
//   });
//
// The component is `<name>-environment`. Teleport surfaces are meshes with
// `userData.teleport` (see StaticBuilder's `walkable`).

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

		/** Teleporting near a seat lands on it. */
		snapTeleport(point) {
			return this.env.seats?.snap(point) ?? null;
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
