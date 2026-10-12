// Poster card: image, title, subtitle and watch progress.

import * as THREE from 'three';
import { describeItem, playedFraction, posterUrl } from '../jellyfin/library.js';
import { truncate } from './text.js';
import { COLORS, entity, loadTexture, roundedRect } from './widgets.js';

AFRAME.registerComponent('ui-poster', {
	schema: {
		width: { type: 'number', default: 0.24 },
		height: { type: 'number', default: 0.36 },
		// Title/subtitle under the image.
		captions: { type: 'boolean', default: true },
		hover: { type: 'boolean', default: true },
	},

	init() {
		const { width, height } = this.data;
		this.item = null;
		this.material = new THREE.MeshBasicMaterial({ color: '#2a2235' });
		this.mesh = new THREE.Mesh(roundedRect(width, height, 0.012), this.material);
		this.el.setObject3D('mesh', this.mesh);

		const chars = Math.round(width * 85);
		this.chars = chars;
		this.fallback = entity({ position: '0 0 0.002', 'ui-text': `fontSize: ${width * 0.11}; maxWidth: ${width - 0.03}; align: center` });
		this.title = entity({ position: `${-width / 2} ${-height / 2 - 0.028} 0`, 'ui-text': 'fontSize: 0.022; weight: bold; anchorX: left; anchorY: top' });
		this.subtitle = entity({ position: `${-width / 2} ${-height / 2 - 0.06} 0`, 'ui-text': `fontSize: 0.018; color: ${COLORS.muted}; anchorX: left; anchorY: top` });
		this.progress = entity({ position: `0 ${-height / 2 + 0.01} 0.003`, 'ui-progress': `width: ${width - 0.024}; height: 0.008` });
		this.el.append(this.fallback, this.title, this.subtitle, this.progress);

		if (this.data.hover) {
			this.el.addEventListener('mouseenter', () => this.el.object3D.scale.setScalar(1.05));
			this.el.addEventListener('mouseleave', () => this.el.object3D.scale.setScalar(1));
		}
	},

	/**
	 * @param {import('@jellyfin/sdk').Api} api
	 * @param {object | null} item
	 */
	setItem(api, item) {
		this.item = item;
		this.el.object3D.visible = item !== null;
		if (!item) return;
		const { title, subtitle } = describeItem(item);
		const captions = this.data.captions;
		this.title.setAttribute('ui-text', 'value', captions ? truncate(title, this.chars * 0.9) : '');
		this.subtitle.setAttribute('ui-text', 'value', captions ? truncate(subtitle, this.chars) : '');
		const fraction = playedFraction(item);
		this.progress.object3D.visible = fraction > 0;
		this.progress.setAttribute('ui-progress', { value: fraction, color: fraction >= 1 ? '#7bd88f' : COLORS.accent2 });

		this.material.map = null;
		this.material.color.set('#2a2235');
		this.material.needsUpdate = true;
		this.fallback.setAttribute('ui-text', 'value', title);
		const url = posterUrl(api, item);
		if (!url) return;
		loadTexture(url).then((texture) => {
			if (this.item !== item) return;
			this.material.map = texture;
			this.material.color.set('#ffffff');
			this.material.needsUpdate = true;
			this.fallback.setAttribute('ui-text', 'value', '');
		}).catch(() => {});
	},
});
