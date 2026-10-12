/* global XRMediaBinding, XRProjectionLayer, XRRigidTransform */
// The cinema screen: shows the player's <video> fitted into the screen area
// (keeping its aspect ratio), with subtitles on top.
//
// Two rendering paths:
// - In VR, when the browser supports WebXR media layers (Quest Browser), the
//   video is handed to the headset compositor as a quad layer. The compositor
//   samples the video once, at display resolution, unaffected by foveation:
//   much sharper than a WebGL texture. The layer sits *behind* the scene, and
//   the screen mesh punches a transparent hole in the scene so the layer shows
//   through while subtitles (drawn after the hole) stay on top.
// - Otherwise (desktop, no layers support): a regular WebGL video texture.

import * as THREE from 'three';

// WebXR quad layer width/height interpretation. Follows A-Frame's `layer`
// component, which was validated on Quest: the values are half extents.
// If the picture shows at the wrong size on a headset, flip this.
const QUAD_SIZE_IS_HALF_EXTENT = true;

AFRAME.registerComponent('video-screen', {
	schema: {
		// Largest area the picture may use (meters).
		maxWidth: { type: 'number', default: 12 },
		maxHeight: { type: 'number', default: 6.75 },
		// The camera rig: the XR reference space follows it.
		rig: { type: 'selector', default: '#rig' },
	},

	init() {
		this.idleMaterial = new THREE.MeshBasicMaterial({ color: '#16121b' });
		this.videoMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
		// Writes (0, 0, 0, 0): makes the scene transparent so the layer behind shows.
		this.holeMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0, blending: THREE.NoBlending });
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.idleMaterial);
		this.el.setObject3D('mesh', this.mesh);

		this.subtitles = document.createElement('a-entity');
		this.el.appendChild(this.subtitles);
		this.texture = null;
		this.video = null;
		this.player = null;
		this.layer = null;
		this.size = { width: 0, height: 0 };
		this.fit(16 / 9);

		this.onEnterVr = () => this.refresh();
		this.onExitVr = () => {
			this.destroyLayer();
			this.refresh();
		};
		this.el.sceneEl.addEventListener('enter-vr', this.onEnterVr);
		this.el.sceneEl.addEventListener('exit-vr', this.onExitVr);
	},

	/** @param {import('./player.js').Player} player */
	bind(player) {
		this.player = player;
		this.video = player.video;
		this.texture = new THREE.VideoTexture(this.video);
		this.texture.colorSpace = THREE.SRGBColorSpace;
		this.texture.generateMipmaps = false;
		this.texture.minFilter = THREE.LinearFilter;
		this.texture.magFilter = THREE.LinearFilter;
		this.videoMaterial.map = this.texture;

		this.video.addEventListener('loadedmetadata', () => {
			this.fit(this.video.videoWidth / this.video.videoHeight || 16 / 9);
		});
		player.addEventListener('statechange', () => this.refresh());
		player.addEventListener('subtitle', (event) => {
			this.subtitles.setAttribute('ui-text', 'value', event.detail.text);
		});
	},

	/** Chooses idle / texture / compositor layer for the current state. */
	refresh() {
		const showing = this.player?.isActive && this.video.readyState >= 2;
		if (!showing) {
			this.destroyLayer();
			this.mesh.material = this.idleMaterial;
			return;
		}
		if (this.layer || this.createLayer()) {
			this.mesh.material = this.holeMaterial;
		} else {
			this.mesh.material = this.videoMaterial;
		}
	},

	/** Whether the current XR session can show media layers. */
	layersAvailable() {
		if (!this.el.sceneEl.xrSession) return false;
		if (typeof XRMediaBinding === 'undefined' || typeof XRProjectionLayer === 'undefined') return false;
		// three.js renders through a projection layer only when layers are supported.
		return this.el.sceneEl.renderer.xr.getBaseLayer() instanceof XRProjectionLayer;
	},

	createLayer() {
		if (!this.layersAvailable()) return false;
		const sceneEl = this.el.sceneEl;
		const session = sceneEl.xrSession;
		try {
			const binding = new XRMediaBinding(session);
			this.layer = binding.createQuadLayer(this.video, {
				space: sceneEl.renderer.xr.getReferenceSpace(),
				layout: 'mono',
				...this.layerSize(),
			});
		} catch (error) {
			console.warn('[screen] media layer unavailable, using a texture', error);
			this.layer = null;
			return false;
		}
		const projection = sceneEl.renderer.xr.getBaseLayer();
		// The scene is composited over the video layer using its alpha.
		projection.blendTextureSourceAlpha = true;
		session.updateRenderState({ layers: [this.layer, projection] });
		this.updateLayerTransform();
		console.info('[screen] using a WebXR media layer');
		return true;
	},

	destroyLayer() {
		if (!this.layer) return;
		const session = this.el.sceneEl.xrSession;
		const projection = this.el.sceneEl.renderer.xr.getBaseLayer?.();
		if (session && projection) session.updateRenderState({ layers: [projection] });
		this.layer.destroy?.();
		this.layer = null;
	},

	layerSize() {
		const factor = QUAD_SIZE_IS_HALF_EXTENT ? 0.5 : 1;
		return { width: this.size.width * factor, height: this.size.height * factor };
	},

	/** Layer pose in the XR reference space, i.e. relative to the rig. */
	updateLayerTransform() {
		if (!this.layer) return;
		const rig = this.data.rig.object3D;
		rig.updateMatrixWorld();
		this.el.object3D.updateMatrixWorld();
		const local = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(this.el.object3D.matrixWorld);
		const position = new THREE.Vector3();
		const quaternion = new THREE.Quaternion();
		local.decompose(position, quaternion, new THREE.Vector3());
		this.layer.transform = new XRRigidTransform(
			{ x: position.x, y: position.y, z: position.z },
			{ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
		);
	},

	fit(aspect) {
		const { maxWidth, maxHeight } = this.data;
		let width = maxWidth;
		let height = width / aspect;
		if (height > maxHeight) {
			height = maxHeight;
			width = height * aspect;
		}
		this.size = { width, height };
		this.mesh.scale.set(width, height, 1);
		if (this.layer) Object.assign(this.layer, this.layerSize());

		// Subtitles sit inside the bottom of the picture, sized relative to it.
		const fontSize = height * 0.052;
		this.subtitles.setAttribute('position', `0 ${-height / 2 + height * 0.06} 0.02`);
		this.subtitles.setAttribute('ui-text', {
			fontSize,
			maxWidth: width * 0.8,
			align: 'center',
			anchorY: 'bottom',
			color: '#ffffff',
			outlineWidth: fontSize * 0.08,
			outlineColor: '#000000',
		});
	},

	update() {
		this.fit(this.size.width ? this.size.width / this.size.height : 16 / 9);
		this.updateLayerTransform();
	},

	remove() {
		this.destroyLayer();
		this.texture?.dispose();
		this.el.removeObject3D('mesh');
		this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVr);
		this.el.sceneEl.removeEventListener('exit-vr', this.onExitVr);
	},
});
