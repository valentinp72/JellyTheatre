// The cinema screen: shows the player's <video> as a texture, fitted into the
// screen area while keeping the video's aspect ratio, with subtitles on top.

import * as THREE from 'three';

AFRAME.registerComponent('video-screen', {
	schema: {
		// Largest area the picture may use (meters).
		maxWidth: { type: 'number', default: 12 },
		maxHeight: { type: 'number', default: 6.75 },
	},

	init() {
		this.idleMaterial = new THREE.MeshBasicMaterial({ color: '#16121b' });
		this.videoMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.idleMaterial);
		this.el.setObject3D('mesh', this.mesh);

		this.subtitles = document.createElement('a-entity');
		this.el.appendChild(this.subtitles);
		this.texture = null;
		this.video = null;
		this.fit(16 / 9);
	},

	/** @param {import('./player.js').Player} player */
	bind(player) {
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
		player.addEventListener('statechange', () => {
			const showing = player.isActive && this.video.readyState >= 2;
			this.mesh.material = showing ? this.videoMaterial : this.idleMaterial;
		});
		player.addEventListener('subtitle', (event) => {
			this.subtitles.setAttribute('ui-text', 'value', event.detail.text);
		});
	},

	fit(aspect) {
		const { maxWidth, maxHeight } = this.data;
		let width = maxWidth;
		let height = width / aspect;
		if (height > maxHeight) {
			height = maxHeight;
			width = height * aspect;
		}
		this.mesh.scale.set(width, height, 1);

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

	remove() {
		this.texture?.dispose();
		this.el.removeObject3D('mesh');
	},
});
