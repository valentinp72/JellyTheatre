// Shows a UI panel through a WebXR quad layer, for crisp text in VR.
//
// The panel's meshes are moved to a dedicated three.js layer (PANEL_LAYER) so
// the eye cameras skip them; each frame they are rendered with an
// orthographic camera into the quad layer's texture, at roughly the headset's
// display resolution. A rounded hole in the scene lets the layer show through.
// On the first frame it reads one pixel back: if nothing was drawn, it falls
// back to normal rendering instead of showing an empty panel.
// The panel's entities stay in place, so the laser pointers still hit them
// (their raycasters must test all three.js layers, see enableAllRaycastLayers).
//
// Falls back to normal rendering outside VR, without layers support, or when
// `enabled` is false.

import * as THREE from 'three';
import { roundedRect } from '../ui/widgets.js';
import { createHoleMaterial, layersAvailable, poseRelativeTo, quadSize, setBehindLayer } from './layers.js';

const PANEL_LAYER = 5;

AFRAME.registerComponent('panel-layer', {
	schema: {
		enabled: { type: 'boolean', default: true },
		// Panel size in its local units, and its rounded corners.
		width: { type: 'number', default: 1 },
		height: { type: 'number', default: 1 },
		radius: { type: 'number', default: 0.04 },
		// Texture width in pixels (height follows the aspect ratio).
		pixelWidth: { type: 'number', default: 1536 },
		rig: { type: 'selector', default: '#rig' },
		// Layer stacking among the layers behind the scene (video is 0).
		order: { type: 'number', default: 1 },
	},

	init() {
		this.layer = null;
		this.binding = null;
		// Set when the browser refused to create the layer: don't retry every frame.
		this.failed = false;
		this.hole = new THREE.Mesh(roundedRect(1, 1, 0), createHoleMaterial());
		this.hole.visible = false;
		this.el.object3D.add(this.hole);

		this.camera = new THREE.OrthographicCamera();
		this.camera.layers.set(PANEL_LAYER);
		this.camera.position.z = 1;
		this.el.object3D.add(this.camera);

		this.onExitVr = () => {
			this.destroyLayer();
			this.failed = false;
		};
		this.el.sceneEl.addEventListener('exit-vr', this.onExitVr);
	},

	update() {
		const { width, height, radius, pixelWidth } = this.data;
		this.hole.geometry = roundedRect(width, height, radius);
		this.pixelHeight = Math.round(pixelWidth * height / width);
		this.renderTarget?.dispose();
		this.renderTarget = new THREE.WebGLRenderTarget(pixelWidth, this.pixelHeight, {
			colorSpace: THREE.SRGBColorSpace,
			depthTexture: new THREE.DepthTexture(pixelWidth, this.pixelHeight),
			samples: 4,
		});
		// Let three.js allocate its own depth buffer next to the layer's color texture.
		this.renderTarget.resolveDepthBuffer = false;
		// Makes three.js convert to sRGB like it does for the XR eye buffers.
		this.renderTarget.isXRRenderTarget = true;
		if (this.layer) this.destroyLayer();
	},

	shouldUseLayer() {
		const sceneEl = this.el.sceneEl;
		return this.data.enabled && !this.failed && sceneEl.is('vr-mode') && isVisible(this.el.object3D) && layersAvailable(sceneEl)
			&& typeof sceneEl.renderer.xr.getBinding === 'function';
	},

	createLayer() {
		const sceneEl = this.el.sceneEl;
		try {
			this.binding = sceneEl.renderer.xr.getBinding();
			this.layer = this.binding.createQuadLayer({
				space: sceneEl.renderer.xr.getReferenceSpace(),
				viewPixelWidth: this.data.pixelWidth,
				viewPixelHeight: this.pixelHeight,
				layout: 'mono',
				...quadSize(this.data.width, this.data.height),
			});
		} catch (error) {
			console.warn('[panel-layer] quad layer unavailable, drawing in the scene', error);
			this.layer = null;
			this.failed = true;
			return;
		}
		setBehindLayer(sceneEl, `panel-${this.el.id}`, this.layer, this.data.order);
		this.hole.visible = true;
		this.verified = false;
	},

	/** Gives up on the layer for this VR session and draws the panel normally. */
	fallBack(reason) {
		console.warn(`[panel-layer] ${reason}: drawing the panel in the scene instead`);
		this.destroyLayer();
		this.failed = true;
		this.el.emit('panel-layer-failed', { reason });
	},

	/**
	 * Fits the orthographic camera to the panel. Bounds are in world units:
	 * three.js cameras ignore the scale they inherit from their parent.
	 */
	fitCamera() {
		const scale = new THREE.Vector3().setFromMatrixScale(this.el.object3D.matrixWorld);
		const halfW = (this.data.width / 2) * scale.x;
		const halfH = (this.data.height / 2) * scale.y;
		const distance = this.camera.position.z * scale.z;
		Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH, near: distance * 0.5, far: distance * 1.5 });
		this.camera.updateProjectionMatrix();
		return scale;
	},

	destroyLayer() {
		if (!this.layer) return;
		setBehindLayer(this.el.sceneEl, `panel-${this.el.id}`, null);
		this.layer.destroy?.();
		this.layer = null;
		this.hole.visible = false;
		this.setContentLayer(0);
	},

	/** Puts every mesh of the panel (except the hole) on a three.js layer. */
	setContentLayer(layer) {
		this.el.object3D.traverse((object) => {
			if (object !== this.hole && object !== this.camera) object.layers.set(layer);
		});
	},

	tick() {
		const use = this.shouldUseLayer();
		if (use && !this.layer) this.createLayer();
		else if (!use && this.layer) this.destroyLayer();
		if (!this.layer) return;
		try {
			this.renderLayer();
		} catch (error) {
			console.error(error);
			this.fallBack(`rendering failed (${error.message})`);
		}
	},

	renderLayer() {
		const sceneEl = this.el.sceneEl;
		const frame = sceneEl.frame;
		if (!frame) return;

		// Content changes all the time (new entities, text): re-tag every frame.
		this.setContentLayer(PANEL_LAYER);
		const { transform, scale } = poseRelativeTo(this.data.rig.object3D, this.el.object3D);
		this.layer.transform = transform;
		Object.assign(this.layer, quadSize(this.data.width * scale.x, this.data.height * scale.y));
		this.fitCamera();

		const renderer = sceneEl.renderer;
		const subImage = this.binding.getSubImage(this.layer, frame);
		renderer.setRenderTargetTextures(this.renderTarget, subImage.colorTexture);

		const xrEnabled = renderer.xr.enabled;
		const previousTarget = renderer.getRenderTarget();
		const previousClear = renderer.getClearColor(new THREE.Color());
		const previousAlpha = renderer.getClearAlpha();
		// Render with our camera, not the headset's eye cameras.
		renderer.xr.enabled = false;
		renderer.setRenderTarget(this.renderTarget);
		renderer.setClearColor(0x000000, 0);
		renderer.clear();
		renderer.render(this.el.object3D, this.camera);
		if (!this.verified) {
			// The panel background covers its center: it must not be transparent.
			const pixel = new Uint8Array(4);
			renderer.readRenderTargetPixels(this.renderTarget, this.data.pixelWidth >> 1, this.pixelHeight >> 1, 1, 1, pixel);
			this.verified = true;
			if (pixel[3] < 100) {
				renderer.setClearColor(previousClear, previousAlpha);
				renderer.setRenderTarget(previousTarget);
				renderer.xr.enabled = xrEnabled;
				this.fallBack('the layer stayed empty');
				return;
			}
		}
		renderer.setClearColor(previousClear, previousAlpha);
		renderer.setRenderTarget(previousTarget);
		renderer.xr.enabled = xrEnabled;
	},

	remove() {
		this.destroyLayer();
		this.el.object3D.remove(this.hole, this.camera);
		this.renderTarget?.dispose();
		this.el.sceneEl.removeEventListener('exit-vr', this.onExitVr);
	},
});

function isVisible(object) {
	for (let o = object; o; o = o.parent) {
		if (!o.visible) return false;
	}
	return true;
}

/** Raycasters must hit panel meshes that moved to PANEL_LAYER. */
export function enableAllRaycastLayers(sceneEl) {
	for (const el of sceneEl.querySelectorAll('[raycaster]')) {
		el.components.raycaster?.raycaster.layers.enableAll();
	}
}
