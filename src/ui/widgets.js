// Small in-VR widgets. Interactive entities carry `data-interactive` and get the
// `clickable` class (the raycasters' target) only while visible, so hidden
// panels can't be clicked.

import * as THREE from 'three';

export const COLORS = {
	panel: '#17111f',
	panelBorder: '#2d2438',
	button: '#2a2235',
	buttonHover: '#45385a',
	accent: '#aa5cc3',
	accent2: '#00a4dc',
	text: '#ece8f1',
	muted: '#a39cad',
};

/** Rounded rectangle geometry, cached by size. */
const roundedCache = new Map();
export function roundedRect(width, height, radius) {
	const key = `${width}|${height}|${radius}`;
	if (!roundedCache.has(key)) {
		const r = Math.min(radius, width / 2, height / 2);
		const x = -width / 2;
		const y = -height / 2;
		const shape = new THREE.Shape()
			.moveTo(x + r, y)
			.lineTo(x + width - r, y)
			.quadraticCurveTo(x + width, y, x + width, y + r)
			.lineTo(x + width, y + height - r)
			.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
			.lineTo(x + r, y + height)
			.quadraticCurveTo(x, y + height, x, y + height - r)
			.lineTo(x, y + r)
			.quadraticCurveTo(x, y, x + r, y);
		const geometry = new THREE.ShapeGeometry(shape, 6);
		// UVs from 0 to 1, for textured cards.
		const pos = geometry.attributes.position;
		const uv = geometry.attributes.uv;
		for (let i = 0; i < pos.count; i++) {
			uv.setXY(i, (pos.getX(i) - x) / width, (pos.getY(i) - y) / height);
		}
		roundedCache.set(key, geometry);
	}
	return roundedCache.get(key);
}

/** Flat rounded panel background. */
AFRAME.registerComponent('ui-rect', {
	schema: {
		width: { type: 'number', default: 1 },
		height: { type: 'number', default: 1 },
		radius: { type: 'number', default: 0.02 },
		color: { type: 'color', default: COLORS.panel },
		opacity: { type: 'number', default: 1 },
	},

	init() {
		this.material = new THREE.MeshBasicMaterial({ transparent: true });
		this.mesh = new THREE.Mesh(roundedRect(1, 1, 0), this.material);
		this.el.setObject3D('mesh', this.mesh);
	},

	update() {
		const d = this.data;
		this.mesh.geometry = roundedRect(d.width, d.height, d.radius);
		this.material.color.set(d.color);
		this.material.opacity = d.opacity;
		this.material.transparent = d.opacity < 1;
	},

	remove() {
		this.el.removeObject3D('mesh');
		this.material.dispose();
	},
});

/**
 * Button: rounded background + label. Emits the regular `click` event (from the
 * A-Frame cursor) when not disabled.
 */
AFRAME.registerComponent('ui-button', {
	schema: {
		label: { type: 'string', default: '' },
		width: { type: 'number', default: 0.2 },
		height: { type: 'number', default: 0.08 },
		fontSize: { type: 'number', default: 0.032 },
		color: { type: 'color', default: COLORS.button },
		hoverColor: { type: 'color', default: COLORS.buttonHover },
		activeColor: { type: 'color', default: COLORS.accent },
		active: { type: 'boolean', default: false },
		disabled: { type: 'boolean', default: false },
		align: { type: 'string', default: 'center', oneOf: ['left', 'center'] },
		// Icon name (see icons.js); with a label too, the label becomes a small caption.
		icon: { type: 'string', default: '' },
		// Text announced on hover (`tooltip` event, bubbling) for icon buttons.
		tooltip: { type: 'string', default: '' },
		// Corner radius; negative: 30 % of the height (pill-like buttons).
		radius: { type: 'number', default: -1 },
	},

	init() {
		this.hovered = 0;
		this.icon = null;
		this.el.dataset.interactive = '';
		this.el.setAttribute('ui-rect', '');
		this.label = document.createElement('a-entity');
		this.label.setAttribute('position', '0 0 0.002');
		this.el.appendChild(this.label);

		this.el.addEventListener('mouseenter', () => {
			this.hovered++;
			this.refresh();
			if (this.data.tooltip) this.el.emit('tooltip', { text: this.data.tooltip });
		});
		this.el.addEventListener('mouseleave', () => {
			this.hovered = Math.max(0, this.hovered - 1);
			this.refresh();
			if (this.data.tooltip && this.hovered === 0) this.el.emit('tooltip', { text: '' });
		});
		// Swallow clicks while disabled.
		this.el.addEventListener('click', (event) => {
			if (this.data.disabled) event.stopImmediatePropagation();
		}, { capture: true });
	},

	update() {
		const d = this.data;
		const left = d.align === 'left';
		const padding = left ? 0.025 : 0.01;
		const color = d.disabled ? COLORS.muted : COLORS.text;
		if (d.icon && !this.icon) {
			this.icon = document.createElement('a-entity');
			this.el.appendChild(this.icon);
		}
		const captioned = Boolean(d.icon && d.label);
		if (this.icon) {
			this.icon.object3D.visible = Boolean(d.icon);
			const size = Math.min(d.width, d.height) * (captioned ? 0.36 : 0.5);
			this.icon.setAttribute('position', `0 ${captioned ? d.height * 0.15 : 0} 0.002`);
			if (d.icon) this.icon.setAttribute('ui-icon', { name: d.icon, size, color });
		}
		this.label.object3D.position.x = left ? -d.width / 2 + padding : 0;
		this.label.object3D.position.y = captioned ? -d.height * 0.24 : 0;
		this.label.setAttribute('ui-text', {
			value: d.label,
			fontSize: captioned ? d.height * 0.2 : d.fontSize,
			maxWidth: d.width - 2 * padding,
			align: d.align,
			anchorX: left ? 'left' : 'center',
			color,
			weight: d.active ? 'bold' : 'normal',
		});
		this.refresh();
	},

	refresh() {
		const d = this.data;
		let color = d.active ? d.activeColor : d.color;
		if (this.hovered > 0 && !d.disabled) color = d.hoverColor;
		this.el.setAttribute('ui-rect', { width: d.width, height: d.height, radius: d.radius >= 0 ? d.radius : d.height * 0.3, color });
	},
});

/** Horizontal progress bar; clickable to seek when `interactive`. Emits `seek` { fraction }. */
AFRAME.registerComponent('ui-progress', {
	schema: {
		width: { type: 'number', default: 1 },
		height: { type: 'number', default: 0.02 },
		value: { type: 'number', default: 0 },
		color: { type: 'color', default: COLORS.accent2 },
		background: { type: 'color', default: '#3a3046' },
		interactive: { type: 'boolean', default: false },
	},

	init() {
		const plane = new THREE.PlaneGeometry(1, 1);
		this.track = new THREE.Mesh(plane, new THREE.MeshBasicMaterial());
		this.fill = new THREE.Mesh(plane, new THREE.MeshBasicMaterial());
		this.fill.position.z = 0.001;
		// Invisible, taller hit area: a thin bar is hard to aim at with a laser.
		this.hit = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
		this.el.setObject3D('mesh', this.track);
		this.el.object3D.add(this.fill, this.hit);
		if (this.data.interactive) {
			this.el.dataset.interactive = '';
			this.el.addEventListener('click', (event) => {
				const point = event.detail.intersection?.point;
				if (!point) return;
				const local = this.el.object3D.worldToLocal(point.clone());
				const fraction = THREE.MathUtils.clamp(local.x / this.data.width + 0.5, 0, 1);
				this.el.emit('seek', { fraction }, false);
			});
		}
	},

	update() {
		const d = this.data;
		this.track.scale.set(d.width, d.height, 1);
		this.track.material.color.set(d.background);
		this.hit.visible = d.interactive;
		this.hit.scale.set(d.width, Math.max(d.height, 0.06), 1);
		const value = THREE.MathUtils.clamp(d.value, 0, 1);
		this.fill.visible = value > 0;
		this.fill.scale.set(Math.max(d.width * value, 0.0001), d.height, 1);
		this.fill.position.x = (-d.width + d.width * value) / 2;
		this.fill.material.color.set(d.color);
	},

	remove() {
		this.el.object3D.remove(this.fill, this.hit);
		this.el.removeObject3D('mesh');
	},
});

/** Shows/hides a UI subtree and keeps its interactive entities (un)clickable. */
export function setInteractiveVisible(el, visible) {
	el.object3D.visible = visible;
	const targets = el.matches('[data-interactive]') ? [el] : [];
	targets.push(...el.querySelectorAll('[data-interactive]'));
	for (const target of targets) target.classList.toggle('clickable', visible);
}

/** Creates an entity with attributes. */
export function entity(attributes = {}, children = []) {
	const el = document.createElement('a-entity');
	for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
	// Mark interactive widgets now: their components initialize asynchronously.
	const progress = attributes['ui-progress'];
	const interactiveProgress = typeof progress === 'string' ? /interactive:\s*true/.test(progress) : progress?.interactive;
	if ('ui-button' in attributes || 'ui-poster' in attributes || 'ui-episode' in attributes || interactiveProgress) el.dataset.interactive = '';
	for (const child of children) el.appendChild(child);
	return el;
}

const loader = new THREE.TextureLoader().setCrossOrigin('anonymous');
const textureCache = new Map();

/** Loads (and caches) an image texture. */
export function loadTexture(url) {
	if (!textureCache.has(url)) {
		textureCache.set(url, new Promise((resolve, reject) => {
			loader.load(url, (texture) => {
				texture.colorSpace = THREE.SRGBColorSpace;
				// Sharp when seen at an angle (posters on the big screen, from the side).
				texture.anisotropy = AFRAME.scenes[0]?.renderer.capabilities.getMaxAnisotropy() ?? 4;
				resolve(texture);
			}, undefined, reject);
		}));
	}
	return textureCache.get(url);
}

/** Runs `fn` once the entity's components are initialized. */
export function whenLoaded(el, fn) {
	if (el.hasLoaded) fn();
	else el.addEventListener('loaded', fn, { once: true });
}
