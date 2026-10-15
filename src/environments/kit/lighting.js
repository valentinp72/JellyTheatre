// Lighting shared by environments:
// - house lights (ambient + hemisphere), dimmed during the film and scaled by
//   the "Room brightness" setting;
// - fixtures: emissive materials (sconces, cove strips, step lights) and glow
//   halos that dim with the house lights;
// - the screen light: a light in front of the screen plus a room-wide tint,
//   following the picture's color and brightness (`screen-color` events,
//   "Screen light" setting);
// - screen-reactive effects (e.g. a projector beam) via `onScreen`.

import * as THREE from 'three';
import { getSetting } from '../../settings.js';

const BRIGHTNESS = { dark: 0.08, dim: 0.2, normal: 0.45, bright: 0.8 };
const SCREEN_LIGHT = { off: 0, subtle: 0.5, strong: 1 };
const WHITE = new THREE.Color(1, 1, 1);
// Time constant of the screen light's easing (the picture is sampled every 50 ms).
const SCREEN_LIGHT_EASE_MS = 50;
const FADE_SECONDS = 2;

export class EnvironmentLighting {
	/**
	 * @param {THREE.Object3D} parent
	 * @param {object} options
	 * @param {Element} options.sceneEl
	 * @param {THREE.Vector3} options.screenLightPosition where the screen light sits (in front of the screen)
	 * @param {number} [options.screenLightDistance]
	 * @param {number} [options.screenLightScale] strength of the screen light: 1 in the
	 * big theatre; less in a small room, whose walls are much closer to the light
	 * @param {string} [options.ambient] ambient color
	 * @param {string} [options.sky] hemisphere sky color
	 * @param {string} [options.ground] hemisphere ground color
	 * @param {number} [options.ambientIntensity] at full house lights, "Normal" brightness = 1
	 * @param {number} [options.hemiIntensity]
	 */
	constructor(parent, {
		sceneEl,
		screenLightPosition,
		screenLightDistance = 30,
		screenLightScale = 1,
		ambient = '#ffe9d6',
		sky = '#ffd9b0',
		ground = '#2a1820',
		ambientIntensity = 1,
		hemiIntensity = 3.1,
	}) {
		this.sceneEl = sceneEl;
		this.screenLightScale = screenLightScale;
		this.ambientIntensity = ambientIntensity;
		this.hemiIntensity = hemiIntensity;
		this.level = 1;
		this.levelTarget = 1;
		this.brightness = BRIGHTNESS[getSetting('roomBrightness')] ?? 0.2;
		this.fixtures = [];
		this.reactive = [];

		this.ambient = new THREE.AmbientLight(ambient, 0);
		this.hemi = new THREE.HemisphereLight(sky, ground, 0);
		this.screenLight = new THREE.PointLight('#c8d0ff', 0, screenLightDistance, 1);
		this.screenLight.position.copy(screenLightPosition);
		this.spill = new THREE.AmbientLight('#000000', 0);
		parent.add(this.ambient, this.hemi, this.screenLight, this.spill);

		this.glow = { color: new THREE.Color('#c8d0ff'), target: new THREE.Color('#c8d0ff'), intensity: 0, intensityTarget: 0, spill: 0, spillTarget: 0, playing: false, brightness: 0 };
		this.onScreenColor = (event) => this.screenColor(event.detail);
		this.onSettingChange = ({ detail }) => {
			if (detail.name === 'roomBrightness') {
				this.brightness = BRIGHTNESS[detail.value] ?? 0.2;
				this.screenColor(this.glow.playing ? this.lastPicture : null);
				this.apply();
			}
		};
		sceneEl.addEventListener('screen-color', this.onScreenColor);
		window.addEventListener('settingchange', this.onSettingChange);
		this.screenColor(null);
		this.apply();
	}

	/**
	 * A material whose color follows the house lights, from `dimmed` (film)
	 * to `lit` (lights on), relative to its base color.
	 * @param {{ min?: number, followBrightness?: boolean }} [options] min: level
	 * kept during the film (aisle lights must stay faintly visible)
	 */
	addFixture(material, { min = 0.04, followBrightness = true } = {}) {
		this.fixtures.push({ material, base: material.color.clone(), min, followBrightness, opacity: material.opacity });
		this.apply();
		return material;
	}

	/** Additive glow sprite/plane (a halo around a lamp) that dims with the house lights. */
	addGlow(material, options) {
		return this.addFixture(material, options);
	}

	/**
	 * Calls `callback({ color, brightness, playing })` when the picture changes
	 * (for effects like a projector beam).
	 */
	onScreen(callback) {
		this.reactive.push(callback);
	}

	setHouseLights(on) {
		this.levelTarget = on ? 1 : 0;
	}

	screenColor(picture) {
		const setting = SCREEN_LIGHT[getSetting('screenLight')] ?? 1;
		const strength = setting * this.screenLightScale;
		const glow = this.glow;
		this.lastPicture = picture;
		if (picture) {
			// The light takes the picture's hue (saturation boosted: films are mostly
			// desaturated), mostly tinted with a little white so red seats don't go
			// black under a green picture; its intensity follows the brightness.
			const hsl = picture.color.getHSL({});
			glow.target.setHSL(hsl.h, Math.min(1, hsl.s * 2), 0.5);
			const max = Math.max(glow.target.r, glow.target.g, glow.target.b);
			if (max > 0) glow.target.multiplyScalar(1 / max);
			else glow.target.copy(WHITE);
			glow.target.lerp(WHITE, 0.2);
			glow.intensityTarget = (0.3 + 14 * picture.luminance) * strength;
			glow.spillTarget = (0.01 + 0.5 * picture.luminance) * strength;
			glow.playing = true;
			glow.brightness = picture.luminance;
		} else {
			glow.target.set('#c8d0ff');
			glow.intensityTarget = 6 * this.brightness;
			glow.spillTarget = 0;
			glow.playing = false;
			glow.brightness = 0;
		}
		for (const callback of this.reactive) callback({ color: glow.target, brightness: glow.brightness * setting, playing: glow.playing });
	}

	apply() {
		const level = this.level;
		const b = this.brightness;
		this.ambient.intensity = this.ambientIntensity * 0.45 * level * b;
		this.hemi.intensity = this.hemiIntensity * 0.45 * level * b;
		for (const fixture of this.fixtures) {
			const factor = fixture.followBrightness ? Math.min(1, b * 2) : 1;
			const value = fixture.min + (1 - fixture.min) * level * factor;
			if (fixture.material.blending === THREE.AdditiveBlending) fixture.material.opacity = fixture.opacity * value;
			else fixture.material.color.copy(fixture.base).multiplyScalar(value);
		}
	}

	tick(delta) {
		const dt = Math.min(delta, 100) / 1000;
		if (this.level !== this.levelTarget) {
			const step = dt / FADE_SECONDS;
			this.level = this.levelTarget > this.level ? Math.min(this.levelTarget, this.level + step) : Math.max(this.levelTarget, this.level - step);
			this.apply();
		}
		// Follow the picture almost at once (light is instant: a visible fade
		// feels wrong); the short easing only hides the steps between samples.
		const glow = this.glow;
		const k = Math.min(1, (dt * 1000) / SCREEN_LIGHT_EASE_MS);
		glow.color.lerp(glow.target, k);
		glow.intensity += (glow.intensityTarget - glow.intensity) * k;
		glow.spill += (glow.spillTarget - glow.spill) * k;
		this.screenLight.color.copy(glow.color);
		this.screenLight.intensity = glow.intensity;
		this.spill.color.copy(glow.color);
		this.spill.intensity = glow.spill;
	}

	dispose() {
		this.sceneEl.removeEventListener('screen-color', this.onScreenColor);
		window.removeEventListener('settingchange', this.onSettingChange);
	}
}

/** Additive halo material (use with a plane or sprite and the `glow` texture). */
export function glowMaterial(texture, color = '#ffcf8a', opacity = 0.6) {
	return new THREE.MeshBasicMaterial({
		map: texture,
		color,
		transparent: true,
		opacity,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
	});
}
