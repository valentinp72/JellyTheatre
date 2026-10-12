/* global XRProjectionLayer, XRRigidTransform */
// Shared helpers for WebXR composition layers (Quest Browser).
//
// Layers are sampled directly by the headset compositor, at display
// resolution: much sharper than drawing into the eye buffer. Every layer used
// here sits *behind* the projection layer (the 3D scene), which punches a
// transparent hole where the layer must show through. Things drawn after the
// hole (subtitles, the laser pointer) stay on top.

import * as THREE from 'three';

// WebXR quad layer width/height interpretation. Follows A-Frame's `layer`
// component, which was validated on Quest: the values are half extents.
// If a layer shows at the wrong size on a headset, flip this.
const QUAD_SIZE_IS_HALF_EXTENT = true;

/** Behind-the-scene layers, by name, drawn bottom to top in `order`. */
const behindLayers = new Map();

/** Material writing (0, 0, 0, 0): makes the scene transparent there. */
export function createHoleMaterial() {
	return new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, blending: THREE.NoBlending });
}

/** Whether the current XR session renders through layers. */
export function layersAvailable(sceneEl) {
	if (!sceneEl.xrSession || typeof XRProjectionLayer === 'undefined') return false;
	// three.js renders through a projection layer only when layers are supported.
	return sceneEl.renderer.xr.getBaseLayer() instanceof XRProjectionLayer;
}

/** Quad layer size from the quad's real size in meters. */
export function quadSize(width, height) {
	const factor = QUAD_SIZE_IS_HALF_EXTENT ? 0.5 : 1;
	return { width: width * factor, height: height * factor };
}

/**
 * Pose of `object` in the XR reference space, i.e. relative to the camera rig.
 * @returns {{ transform: XRRigidTransform, scale: THREE.Vector3 }}
 */
export function poseRelativeTo(rig, object) {
	rig.updateMatrixWorld();
	object.updateMatrixWorld();
	const local = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(object.matrixWorld);
	const position = new THREE.Vector3();
	const quaternion = new THREE.Quaternion();
	const scale = new THREE.Vector3();
	local.decompose(position, quaternion, scale);
	return {
		transform: new XRRigidTransform(
			{ x: position.x, y: position.y, z: position.z },
			{ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
		),
		scale,
	};
}

/**
 * Adds (or with `layer` null, removes) a named layer behind the scene.
 * @param {number} order lower is further back
 */
export function setBehindLayer(sceneEl, name, layer, order = 0) {
	if (layer) behindLayers.set(name, { layer, order });
	else behindLayers.delete(name);
	const session = sceneEl.xrSession;
	const projection = sceneEl.renderer.xr.getBaseLayer?.();
	if (!session || !projection) return;
	// The scene is composited over the layers behind it using its alpha.
	projection.blendTextureSourceAlpha = true;
	const sorted = [...behindLayers.values()].sort((a, b) => a.order - b.order).map((entry) => entry.layer);
	session.updateRenderState({ layers: [...sorted, projection] });
}

/** Forgets all layers (their session ended). */
export function clearLayers() {
	behindLayers.clear();
}
