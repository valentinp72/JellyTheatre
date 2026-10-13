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
import { getSetting } from '../settings.js';
import { entity, setInteractiveVisible } from '../ui/widgets.js';
import { createHoleMaterial, layersAvailable, poseRelativeTo, quadSize, setBehindLayer } from '../xr/layers.js';

const SAMPLE_INTERVAL_MS = 200;
const SUBTITLE_SIZES = { small: 0.75, medium: 1, large: 1.3, xlarge: 1.65 };
const SUBTITLE_COLORS = { white: '#ffffff', yellow: '#ffe066' };
const SKIP_LABELS = { Intro: 'Skip intro', Recap: 'Skip recap', Preview: 'Skip preview', Commercial: 'Skip ad', Outro: 'Skip credits' };
const IMAGE_SUBTITLE_INTERVAL_MS = 100;

AFRAME.registerComponent('video-screen', {
	schema: {
		// Largest area the picture may use (meters).
		maxWidth: { type: 'number', default: 12 },
		maxHeight: { type: 'number', default: 6.75 },
		// The camera rig: the XR reference space follows it.
		rig: { type: 'selector', default: '#rig' },
		// Read the picture's color for the room lighting (off when nothing uses it).
		sampleColor: { type: 'boolean', default: true },
	},

	init() {
		// A matte white screen when nothing plays, like in a real cinema: lit by
		// the room (not glaring when the lights are dim), with a faint glow so it
		// never turns black in an unlit environment.
		this.idleMaterial = new THREE.MeshLambertMaterial({ color: '#e9e7e2', emissive: '#262524' });
		this.videoMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
		this.holeMaterial = createHoleMaterial();
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.idleMaterial);
		this.el.setObject3D('mesh', this.mesh);

		this.subtitles = document.createElement('a-entity');
		this.el.appendChild(this.subtitles);
		// "Dark box" subtitle style: a box behind the lines, fitted every frame.
		this.subtitleBox = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.62, depthWrite: false }));
		this.subtitleBox.visible = false;
		this.subtitles.object3D.add(this.subtitleBox);
		// "Skip intro / credits" button, in the corner of the picture.
		this.skipButton = entity({ 'ui-button': { label: 'Skip intro' } });
		this.skipButton.addEventListener('click', () => this.player?.skipSegment());
		this.el.appendChild(this.skipButton);
		setInteractiveVisible(this.skipButton, false);
		this.onSettingChange = ({ detail }) => {
			if (detail.name.startsWith('subtitle')) this.fit(this.size.width / this.size.height);
		};
		window.addEventListener('settingchange', this.onSettingChange);
		// PGS (image) subtitles: a transparent plane over the picture showing
		// the canvas libpgs draws into.
		this.imageSubtitles = new THREE.Mesh(
			new THREE.PlaneGeometry(1, 1),
			new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
		);
		this.imageSubtitles.position.z = 0.015;
		this.imageSubtitles.visible = false;
		this.el.object3D.add(this.imageSubtitles);
		this.lastImageSubtitleUpdate = 0;
		this.texture = null;
		this.video = null;
		this.player = null;
		this.layer = null;
		this.size = { width: 0, height: 0 };
		this.fit(16 / 9);

		// Average color of the picture, for lighting the room (`screen-color` event).
		this.sampler = document.createElement('canvas');
		this.sampler.width = 16;
		this.sampler.height = 9;
		this.samplerContext = this.sampler.getContext('2d', { willReadFrequently: true });
		this.lastSample = 0;
		this.samplingBroken = false;

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
		player.addEventListener('image-subtitle', (event) => this.setImageSubtitles(event.detail.canvas));
		player.addEventListener('segment', ({ detail }) => {
			const segment = detail.segment;
			// An episode's credits are handled by the "Up next" prompt.
			const show = Boolean(segment) && !(segment.type === 'Outro' && player.item?.Type === 'Episode');
			if (show) this.skipButton.setAttribute('ui-button', 'label', SKIP_LABELS[segment.type] ?? 'Skip');
			setInteractiveVisible(this.skipButton, show);
		});
	},

	setImageSubtitles(canvas) {
		this.imageSubtitleCanvas = canvas;
		this.imageSubtitles.visible = Boolean(canvas);
		this.updateImageSubtitleTexture();
	},

	/**
	 * (Re)creates the subtitle texture when the canvas changes size: libpgs
	 * resizes it once the subtitle file is loaded, and a texture's storage
	 * can't grow.
	 */
	updateImageSubtitleTexture() {
		const canvas = this.imageSubtitleCanvas;
		const material = this.imageSubtitles.material;
		const size = canvas ? `${canvas.width}x${canvas.height}` : null;
		if (size === this.imageSubtitleTextureSize) {
			if (material.map) material.map.needsUpdate = true;
			return;
		}
		this.imageSubtitleTextureSize = size;
		material.map?.dispose();
		material.map = null;
		if (canvas) {
			material.map = new THREE.CanvasTexture(canvas);
			material.map.colorSpace = THREE.SRGBColorSpace;
		}
		material.needsUpdate = true;
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
		this.imageSubtitles.scale.set(width, height, 1);
		if (this.layer) Object.assign(this.layer, quadSize(width, height));

		// Subtitles: sized relative to the picture, styled by the settings.
		const fontSize = height * 0.052 * (SUBTITLE_SIZES[getSetting('subtitleSize')] ?? 1);
		const below = getSetting('subtitlePosition') === 'below';
		const box = getSetting('subtitleStyle') === 'box';
		this.subtitles.setAttribute('position', below ? `0 ${-height / 2 - fontSize * 0.5} 0.02` : `0 ${-height / 2 + height * 0.06} 0.02`);
		this.subtitles.setAttribute('ui-text', {
			fontSize,
			maxWidth: width * 0.8,
			align: 'center',
			anchorY: below ? 'top' : 'bottom',
			color: SUBTITLE_COLORS[getSetting('subtitleColor')] ?? '#ffffff',
			outlineWidth: box ? 0 : fontSize * 0.08,
			outlineColor: '#000000',
		});
		this.subtitleBoxPadding = fontSize * 0.35;
		this.subtitleBox.material.visible = box;

		// The skip button, bottom right of the picture.
		const bw = height * 0.2;
		const bh = height * 0.075;
		this.skipButton.setAttribute('ui-button', { width: bw, height: bh, fontSize: height * 0.032 });
		this.skipButton.setAttribute('position', `${width / 2 - bw / 2 - height * 0.04} ${-height / 2 + bh / 2 + height * 0.2} 0.03`);
	},

	update() {
		this.fit(this.size.width ? this.size.width / this.size.height : 16 / 9);
		this.updateLayerTransform();
	},

	tick(time) {
		// The rig can move (walking, recentering): keep the layer on the screen.
		this.updateLayerTransform();
		if (this.player?.isActive) this.player.updateSubtitle();
		this.fitSubtitleBox();
		if (this.imageSubtitleCanvas && time - this.lastImageSubtitleUpdate > IMAGE_SUBTITLE_INTERVAL_MS) {
			// libpgs redraws its canvas when the subtitle changes: re-upload it.
			this.lastImageSubtitleUpdate = time;
			this.updateImageSubtitleTexture();
		}
		if (time - this.lastSample > SAMPLE_INTERVAL_MS) {
			this.lastSample = time;
			this.sampleColor();
		}
	},

	/** Emits the picture's average color and brightness on the scene. */
	sampleColor() {
		if (!this.data.sampleColor) {
			if (this.sampling) {
				this.sampling = false;
				this.el.sceneEl.emit('screen-color', null);
			}
			return;
		}
		const showing = this.player?.isActive && this.video.readyState >= 2 && !this.samplingBroken;
		if (!showing) {
			if (this.sampling) {
				this.sampling = false;
				this.el.sceneEl.emit('screen-color', null);
			}
			return;
		}
		try {
			this.samplerContext.drawImage(this.video, 0, 0, 16, 9);
			const data = this.samplerContext.getImageData(0, 0, 16, 9).data;
			let r = 0;
			let g = 0;
			let b = 0;
			for (let i = 0; i < data.length; i += 4) {
				r += data[i];
				g += data[i + 1];
				b += data[i + 2];
			}
			const scale = 1 / ((data.length / 4) * 255);
			// Pixel values are sRGB: convert so the light gets the color we see.
			const color = new THREE.Color().setRGB(r * scale, g * scale, b * scale, THREE.SRGBColorSpace);
			// Brightness as perceived (on the sRGB values), 0 to 1.
			const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) * scale;
			this.sampling = true;
			this.el.sceneEl.emit('screen-color', { color, luminance });

		} catch (error) {
			// A cross-origin video without CORS headers can't be read: no room lighting.
			console.warn('[screen] cannot sample the video color', error);
			this.samplingBroken = true;
		}
	},

	/** Fits the "dark box" behind the current subtitle lines. */
	fitSubtitleBox() {
		const text = this.subtitles.components['ui-text']?.text;
		const bounds = text?.textRenderInfo?.blockBounds;
		const visible = Boolean(this.subtitleBox.material.visible && bounds && text.text);
		this.subtitleBox.visible = visible;
		if (!visible) return;
		const [minX, minY, maxX, maxY] = bounds;
		const pad = this.subtitleBoxPadding;
		this.subtitleBox.scale.set(maxX - minX + 2 * pad, maxY - minY + pad, 1);
		this.subtitleBox.position.set((minX + maxX) / 2, (minY + maxY) / 2, -0.004);
	},

	remove() {
		window.removeEventListener('settingchange', this.onSettingChange);
		this.destroyLayer();
		this.texture?.dispose();
		this.el.removeObject3D('mesh');
		this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVr);
		this.el.sceneEl.removeEventListener('exit-vr', this.onExitVr);
	},
});
