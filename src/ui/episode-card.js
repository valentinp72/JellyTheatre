// Episode card: landscape thumbnail, watched check or progress bar, number
// and title, runtime or watch state.

import * as THREE from 'three';
import { episodeImageUrl, playedFraction, runtimeLabel } from '../jellyfin/library.js';
import { truncate } from './text.js';
import { COLORS, entity, loadTexture, roundedRect } from './widgets.js';

const WATCHED_COLOR = '#7bd88f';

AFRAME.registerComponent('ui-episode', {
	schema: {
		width: { type: 'number', default: 0.31 },
	},

	init() {
		const width = this.data.width;
		const height = width * (9 / 16);
		this.item = null;
		this.material = new THREE.MeshBasicMaterial({ color: '#2a2235' });
		this.el.setObject3D('mesh', new THREE.Mesh(roundedRect(width, height, 0.01), this.material));

		// Without a picture: the episode number, large.
		this.fallback = entity({ position: '0 0 0.002', 'ui-text': `fontSize: ${height * 0.3}; color: ${COLORS.muted}; align: center` });
		this.progress = entity({ position: `0 ${-height / 2 + 0.01} 0.003`, 'ui-progress': `width: ${width - 0.024}; height: 0.008` });
		// Watched: a green disc with a check, top right.
		const badge = width * 0.1;
		this.watched = entity({ position: `${width / 2 - badge * 0.8} ${height / 2 - badge * 0.8} 0.003` }, [
			entity({ 'ui-rect': `width: ${badge}; height: ${badge}; radius: ${badge / 2}; color: ${WATCHED_COLOR}` }),
			entity({ position: '0 0 0.001', 'ui-icon': `name: check; size: ${badge * 0.75}; color: #10131a` }),
		]);
		this.chars = Math.round(width * 80);
		this.title = entity({ position: `${-width / 2} ${-height / 2 - 0.022} 0`, 'ui-text': `fontSize: 0.02; weight: bold; anchorX: left; anchorY: top; maxWidth: ${width}` });
		this.status = entity({ position: `${-width / 2} ${-height / 2 - 0.05} 0`, 'ui-text': `fontSize: 0.017; color: ${COLORS.muted}; anchorX: left; anchorY: top` });
		this.el.append(this.fallback, this.progress, this.watched, this.title, this.status);

		this.el.addEventListener('mouseenter', () => this.el.object3D.scale.setScalar(1.04));
		this.el.addEventListener('mouseleave', () => this.el.object3D.scale.setScalar(1));
	},

	/**
	 * @param {import('@jellyfin/sdk').Api} api
	 * @param {object | null} episode
	 */
	setItem(api, episode) {
		this.item = episode;
		this.el.object3D.visible = episode !== null;
		if (!episode) return;
		const number = episode.IndexNumber != null ? `${episode.IndexNumber}. ` : '';
		this.title.setAttribute('ui-text', 'value', truncate(`${number}${episode.Name ?? ''}`, this.chars));
		const played = Boolean(episode.UserData?.Played);
		const fraction = playedFraction(episode);
		const runtime = runtimeLabel(episode);
		let status = runtime;
		if (played) status = runtime ? `${runtime}  ·  Watched` : 'Watched';
		else if (fraction > 0) status = `${Math.round(fraction * 100)}% watched`;
		this.status.setAttribute('ui-text', { value: status, color: played ? WATCHED_COLOR : COLORS.muted });
		this.watched.object3D.visible = played;
		this.progress.object3D.visible = !played && fraction > 0;
		this.progress.setAttribute('ui-progress', { value: fraction, color: COLORS.accent2 });

		this.material.map = null;
		this.material.color.set('#2a2235');
		this.material.needsUpdate = true;
		this.fallback.setAttribute('ui-text', 'value', episode.IndexNumber != null ? String(episode.IndexNumber) : '');
		const url = episodeImageUrl(api, episode);
		if (!url) return;
		loadTexture(url).then((texture) => {
			if (this.item !== episode) return;
			// Fill the 16:9 card, cropping pictures of another shape.
			const aspect = texture.image ? texture.image.width / texture.image.height : 16 / 9;
			const scale = aspect > 16 / 9 ? [(16 / 9) / aspect, 1] : [1, aspect / (16 / 9)];
			texture.repeat.set(...scale);
			texture.offset.set((1 - scale[0]) / 2, (1 - scale[1]) / 2);
			this.material.map = texture;
			this.material.color.set('#ffffff');
			this.material.needsUpdate = true;
			this.fallback.setAttribute('ui-text', 'value', '');
		}).catch(() => {});
	},
});
