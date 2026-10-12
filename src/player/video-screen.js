/* global XRMediaBinding */
// The cinema screen: shows the player's <video> fitted into the screen area
// (keeping its aspect ratio), with subtitles on top.
//
// Two rendering paths:
// - In VR, when the browser supports WebXR media layers (Quest Browser), the
//   video is handed to the headset compositor as a quad layer. The compositor
//   samples the video once, at display resolution, unaffected by foveation:
//   much sharper than a WebGL texture. See src/xr/layers.js.
// - Otherwise (desktop, no layers support): a regular WebGL video texture.

import * as THREE from 'three';
import { createHoleMaterial, layersAvailable, poseRelativeTo, quadSize, setBehindLayer } from '../xr/layers.js';

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
		this.holeMaterial = createHoleMaterial();
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

	createLayer() {
		if (typeof XRMediaBinding === 'undefined' || !layersAvailable(this.el.sceneEl)) return false;
		const sceneEl = this.el.sceneEl;
		const session = sceneEl.xrSession;
		try {
			const binding = new XRMediaBinding(session);
			this.layer = binding.createQuadLayer(this.video, {
				space: sceneEl.renderer.xr.getReferenceSpace(),
				layout: 'mono',
				...quadSize(this.size.width, this.size.height),
			});
		} catch (error) {
			console.warn('[screen] media layer unavailable, using a texture', error);
			this.layer = null;
			return false;
		}
		setBehindLayer(sceneEl, 'video', this.layer, 0);
		this.updateLayerTransform();
		console.info('[screen] using a WebXR media layer');
		return true;
	},

	destroyLayer() {
		if (!this.layer) return;
		setBehindLayer(this.el.sceneEl, 'video', null);
		this.layer.destroy?.();
		this.layer = null;
	},

	/** Layer pose in the XR reference space, i.e. relative to the rig. */
	updateLayerTransform() {
		if (!this.layer) return;
		this.layer.transform = poseRelativeTo(this.data.rig.object3D, this.el.object3D).transform;
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
		if (this.layer) Object.assign(this.layer, quadSize(width, height));

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
