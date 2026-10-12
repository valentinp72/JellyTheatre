// Poster card: image, title, subtitle and watch progress.

import * as THREE from 'three';
import { describeMedia, estimatePlayback } from '../jellyfin/device-profile.js';
import { describeItem, playedFraction, posterUrl } from '../jellyfin/library.js';
import { truncate } from './text.js';
import { COLORS, entity, loadTexture, roundedRect } from './widgets.js';

/** Colors of the compatibility dot: how the file would play on this headset. */
export const PLAYBACK_COLORS = { direct: '#7bd88f', remux: '#e6c76e', transcode: '#ff6b7a' };

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

		// Quality badge (top left) and compatibility dot (top right).
		const inset = width * 0.05;
		this.badgeSize = width * 0.075;
		this.badge = entity({ position: `${-width / 2 + inset} ${height / 2 - inset} 0.003` });
		this.badgeBackground = entity({ 'ui-rect': `width: 0.1; height: ${this.badgeSize * 1.5}; radius: ${this.badgeSize * 0.4}; color: #000000; opacity: 0.7` });
		this.badgeText = entity({ 'ui-text': `fontSize: ${this.badgeSize}; weight: bold; anchorX: left` });
		this.badge.append(this.badgeBackground, this.badgeText);
		const dot = width * 0.08;
		this.dot = entity({
			position: `${width / 2 - inset - dot / 2} ${height / 2 - inset - dot / 2} 0.003`,
			'ui-rect': `width: ${dot}; height: ${dot}; radius: ${dot / 2}`,
		});
		this.el.append(this.badge, this.dot);

		if (this.data.hover) {
			this.el.addEventListener('mouseenter', () => this.el.object3D.scale.setScalar(1.05));
			this.el.addEventListener('mouseleave', () => this.el.object3D.scale.setScalar(1));
		}
	},

	setBadges(mediaSource) {
		const quality = this.data.captions && mediaSource ? describeMedia(mediaSource) : null;
		const playback = this.data.captions && mediaSource ? estimatePlayback(mediaSource) : null;
		const text = quality?.badge ?? '';
		this.badge.object3D.visible = Boolean(text);
		if (text) {
			const pad = this.badgeSize * 0.6;
			const textWidth = text.length * this.badgeSize * 0.66;
			this.badgeText.setAttribute('ui-text', 'value', text);
			this.badgeText.object3D.position.set(pad, -this.badgeSize * 0.75, 0.001);
			this.badgeBackground.setAttribute('ui-rect', 'width', textWidth + 2 * pad);
			this.badgeBackground.object3D.position.set((textWidth + 2 * pad) / 2, -this.badgeSize * 0.75, 0);
		}
		this.dot.object3D.visible = Boolean(playback);
		if (playback) this.dot.setAttribute('ui-rect', 'color', PLAYBACK_COLORS[playback.mode]);
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
		this.setBadges(item.MediaSources?.[0]);

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
