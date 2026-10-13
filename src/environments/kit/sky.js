// Outdoor scenery: sky, stars, planets, moon, mountains, water, trees.
// Everything is far away and unlit (MeshBasic), so it costs little.

import * as THREE from 'three';
import { canvasTexture, glow, random } from './textures.js';

/** Sky dome with a vertical gradient: `stops` from zenith (0) to nadir (1). */
export function gradientSky(stops, radius = 200) {
	const key = stops.map(([o, c]) => `${o}${c}`).join('');
	const texture = canvasTexture(`sky-${key}`, 4, 256, (ctx, w, h) => {
		const gradient = ctx.createLinearGradient(0, 0, 0, h);
		for (const [offset, color] of stops) gradient.addColorStop(offset, color);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, w, h);
	}, { repeat: false });
	return new THREE.Mesh(
		new THREE.SphereGeometry(radius, 32, 16),
		new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false, fog: false }),
	);
}

/**
 * Builds stars as tiny glowing quads (ordinary geometry, one draw call): GPU
 * "points" are unreliable in headsets (clipped near the edges of the view, or
 * drawn in one eye only).
 * @param {Array<{ position: THREE.Vector3, normal: THREE.Vector3, size: number, brightness: number, tint?: number }>} stars
 */
function starQuads(stars) {
	const positions = new Float32Array(stars.length * 18);
	const uvs = new Float32Array(stars.length * 12);
	const colors = new Float32Array(stars.length * 18);
	const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
	const u = new THREE.Vector3();
	const v = new THREE.Vector3();
	stars.forEach((star, i) => {
		const helper = Math.abs(star.normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
		u.crossVectors(star.normal, helper).normalize().multiplyScalar(star.size);
		v.crossVectors(star.normal, u).normalize().multiplyScalar(star.size);
		const tint = star.tint ?? 0.5;
		const r = star.brightness * (tint > 0.8 ? 0.85 : 1);
		const b = star.brightness * (tint < 0.2 ? 0.85 : 1);
		corners.forEach(([cu, cv], k) => {
			const p = star.position.clone().addScaledVector(u, cu).addScaledVector(v, cv);
			positions.set([p.x, p.y, p.z], i * 18 + k * 3);
			uvs.set([(cu + 1) / 2, (cv + 1) / 2], i * 12 + k * 2);
			colors.set([r, star.brightness, b], i * 18 + k * 3);
		});
	});
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	const material = new THREE.MeshBasicMaterial({
		map: glow(),
		vertexColors: true,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		side: THREE.DoubleSide,
		fog: false,
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.frustumCulled = false;
	return mesh;
}

/**
 * Star field on a sphere around the origin, with varied brightness.
 * @param {{ count?: number, radius?: number, minElevation?: number, size?: number, seed?: number }} options
 * minElevation: lowest star, in radians above the horizon (-π/2 for everywhere);
 * size: star radius as a fraction of the sphere radius
 */
export function starfield({ count = 1500, radius = 180, minElevation = -Math.PI / 2, size = 0.0025, seed = 1 } = {}) {
	const rand = random(seed);
	const sinMin = Math.sin(minElevation);
	const stars = [];
	for (let i = 0; i < count; i++) {
		const theta = rand() * Math.PI * 2;
		const elevation = Math.asin(sinMin + rand() * (1 - sinMin));
		const position = new THREE.Vector3(
			radius * Math.cos(elevation) * Math.cos(theta),
			radius * Math.sin(elevation),
			radius * Math.cos(elevation) * Math.sin(theta),
		);
		const big = rand() ** 4;
		stars.push({
			position,
			normal: position.clone().normalize().negate(),
			size: radius * size * (0.6 + 1.6 * big),
			brightness: 0.4 + 0.6 * big + rand() * 0.2,
			tint: rand(),
		});
	}
	return starQuads(stars);
}

/**
 * Fiber-optic star ceiling: tiny lights on a horizontal panel at height `y`,
 * facing down. Its material color can be dimmed like a light fixture.
 */
export function ceilingStars({ width, depth, y, count = 200, size = 0.008, seed = 77, center = [0, 0] } = {}) {
	const rand = random(seed);
	const stars = [];
	for (let i = 0; i < count; i++) {
		stars.push({
			position: new THREE.Vector3(center[0] + (rand() - 0.5) * width, y, center[1] + (rand() - 0.5) * depth),
			normal: new THREE.Vector3(0, -1, 0),
			size: size * (0.6 + rand() * 0.9),
			brightness: 0.6 + rand() * 0.4,
			tint: 0.5,
		});
	}
	return starQuads(stars);
}

/**
 * A planet lit from one side, with a glowing atmosphere rim.
 * @param {{ radius: number, texture: THREE.Texture, sun: THREE.Vector3, atmosphere?: string }} options
 * sun: direction the light comes from
 */
export function planet({ radius, texture, sun, atmosphere = '#7fb4ff' }) {
	const group = new THREE.Group();
	const sunDirection = sun.clone().normalize();
	const surface = new THREE.Mesh(
		new THREE.SphereGeometry(radius, 48, 32),
		new THREE.ShaderMaterial({
			uniforms: { map: { value: texture }, sun: { value: sunDirection } },
			vertexShader: `
				varying vec2 vUv;
				varying vec3 vNormal;
				void main() {
					vUv = uv;
					vNormal = normalize(mat3(modelMatrix) * normal);
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}`,
			fragmentShader: `
				uniform sampler2D map;
				uniform vec3 sun;
				varying vec2 vUv;
				varying vec3 vNormal;
				void main() {
					float light = smoothstep(-0.15, 0.35, dot(vNormal, sun));
					vec3 color = texture2D(map, vUv).rgb;
					gl_FragColor = vec4(color * (0.04 + 0.96 * light), 1.0);
					#include <colorspace_fragment>
				}`,
		}),
	);
	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(radius * 1.04, 48, 32),
		new THREE.ShaderMaterial({
			uniforms: { color: { value: new THREE.Color(atmosphere) }, sun: { value: sunDirection } },
			vertexShader: `
				varying vec3 vNormal;
				varying vec3 vView;
				void main() {
					vNormal = normalize(mat3(modelMatrix) * normal);
					vec4 world = modelMatrix * vec4(position, 1.0);
					vView = normalize(cameraPosition - world.xyz);
					gl_Position = projectionMatrix * viewMatrix * world;
				}`,
			fragmentShader: `
				uniform vec3 color;
				uniform vec3 sun;
				varying vec3 vNormal;
				varying vec3 vView;
				void main() {
					float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
					float lit = smoothstep(-0.3, 0.4, dot(vNormal, sun));
					gl_FragColor = vec4(color * rim * lit * 1.4, 1.0);
				}`,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.BackSide,
		}),
	);
	group.add(surface, shell);
	group.userData.surface = surface;
	return group;
}

/** Moon: a bright disc with a soft halo, always facing the viewer (sprites). */
export function moon({ size = 6, color = '#f4f1e6' } = {}) {
	const group = new THREE.Group();
	const disc = canvasTexture('moon-disc', 128, 128, (ctx, w, h) => {
		const gradient = ctx.createRadialGradient(w * 0.45, h * 0.45, 2, w / 2, h / 2, w / 2);
		gradient.addColorStop(0, '#ffffff');
		gradient.addColorStop(0.9, '#d9d4c4');
		gradient.addColorStop(1, 'rgba(217, 212, 196, 0)');
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
		ctx.fill();
		const rand = random(91);
		for (let i = 0; i < 14; i++) {
			ctx.fillStyle = `rgba(150, 145, 130, ${0.15 + rand() * 0.2})`;
			ctx.beginPath();
			ctx.arc(20 + rand() * 88, 20 + rand() * 88, 3 + rand() * 10, 0, Math.PI * 2);
			ctx.fill();
		}
	}, { repeat: false });
	const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color, depthWrite: false, fog: false }));
	sprite.scale.setScalar(size);
	const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: '#9fb4d9', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
	halo.scale.setScalar(size * 5);
	group.add(halo, sprite);
	return group;
}

/**
 * A ring of mountain silhouettes around the origin (between `from` and `to`
 * angles), at `distance`, peaks up to `height`.
 */
export function mountains({ distance = 120, height = 25, color = '#0d1220', from = 0, to = Math.PI * 2, seed = 3, segments = 120 } = {}) {
	const rand = random(seed);
	const positions = [];
	let previous = null;
	for (let i = 0; i <= segments; i++) {
		const angle = from + ((to - from) * i) / segments;
		// Sum of a few waves: ridges with peaks.
		const h = height * (0.35 + 0.35 * Math.sin(angle * 3 + seed) ** 2 + 0.2 * Math.sin(angle * 11 + 1.3) ** 2 + 0.1 * rand());
		const point = [Math.cos(angle) * distance, h, Math.sin(angle) * distance];
		if (previous) {
			const [px, ph, pz] = previous;
			const [x, hh, z] = point;
			positions.push(px, -2, pz, x, -2, z, x, hh, z, px, -2, pz, x, hh, z, px, ph, pz);
		}
		previous = point;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
}

/** Dark still water, with a moonlight streak towards the viewer. */
export function lake({ size = 300, y = 0, color = '#05080f', moonDirection = null } = {}) {
	const group = new THREE.Group();
	const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color, fog: false }));
	water.rotation.x = -Math.PI / 2;
	water.position.y = y;
	group.add(water);
	if (moonDirection) {
		const streak = canvasTexture('moon-streak', 64, 256, (ctx, w, h) => {
			const gradient = ctx.createLinearGradient(0, 0, w, 0);
			gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
			gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
			gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, w, h);
			// Broken into ripples.
			const rand = random(97);
			ctx.globalCompositeOperation = 'destination-out';
			for (let yy = 0; yy < h; yy += 3) {
				ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + rand() * 0.7})`;
				ctx.fillRect(0, yy, w, 1 + rand() * 2);
			}
		}, { repeat: false });
		const reflection = new THREE.Mesh(
			new THREE.PlaneGeometry(8, 90),
			new THREE.MeshBasicMaterial({ map: streak, color: '#b8c6e0', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
		);
		reflection.rotation.x = -Math.PI / 2;
		const flat = new THREE.Vector3(moonDirection.x, 0, moonDirection.z).normalize();
		reflection.rotation.z = -Math.atan2(flat.x, -flat.z);
		reflection.position.copy(flat.multiplyScalar(55)).setY(y + 0.02);
		group.add(reflection);
	}
	return group;
}

/** Pine tree silhouettes (instanced cones) on a ring around the origin. */
export function pines({ count = 60, from = 0, to = Math.PI * 2, near = 30, far = 70, color = '#070b0e', seed = 5 } = {}) {
	const rand = random(seed);
	const geometry = new THREE.ConeGeometry(1, 1, 6);
	geometry.translate(0, 0.5, 0);
	const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, fog: false }), count);
	const matrix = new THREE.Matrix4();
	for (let i = 0; i < count; i++) {
		const angle = from + rand() * (to - from);
		const distance = near + rand() * (far - near);
		const height = 6 + rand() * 9;
		matrix.compose(
			new THREE.Vector3(Math.cos(angle) * distance, -0.5, Math.sin(angle) * distance),
			new THREE.Quaternion(),
			new THREE.Vector3(height * 0.28, height, height * 0.28),
		);
		mesh.setMatrixAt(i, matrix);
	}
	mesh.computeBoundingSphere();
	return mesh;
}
