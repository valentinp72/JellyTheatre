// Procedural textures for environments, drawn on canvases (no image assets).
// Each texture is cached by name: environments share them.

import * as THREE from 'three';

const cache = new Map();

/** Small deterministic random generator, so textures look the same every time. */
export function random(seed = 1) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/**
 * Creates (or returns the cached) canvas texture.
 * @param {string} name cache key
 * @param {number} width
 * @param {number} height
 * @param {(ctx: CanvasRenderingContext2D, width: number, height: number) => void} paint
 * @param {{ repeat?: boolean, color?: boolean }} [options] color: false for data
 * textures (alpha masks…)
 */
export function canvasTexture(name, width, height, paint, { repeat = true, color = true } = {}) {
	if (cache.has(name)) return cache.get(name);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	paint(canvas.getContext('2d'), width, height);
	const texture = new THREE.CanvasTexture(canvas);
	if (color) texture.colorSpace = THREE.SRGBColorSpace;
	if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.anisotropy = 8;
	cache.set(name, texture);
	return texture;
}

/** A texture sharing the image of `base` with its own repeat (one per surface size). */
export function repeated(base, x, y) {
	const texture = base.clone();
	texture.repeat.set(x, y);
	texture.needsUpdate = true;
	return texture;
}

function noise(ctx, width, height, amount, seed) {
	const rand = random(seed);
	const image = ctx.getImageData(0, 0, width, height);
	for (let i = 0; i < image.data.length; i += 4) {
		const n = (rand() - 0.5) * amount;
		image.data[i] += n;
		image.data[i + 1] += n;
		image.data[i + 2] += n;
	}
	ctx.putImageData(image, 0, 0);
}

/** Cinema carpet: dark base with a small repeating motif. */
export function carpet(base = '#1d1a24', motif = '#3b2f4f', accent = '#5b3a2e') {
	return canvasTexture(`carpet-${base}-${motif}-${accent}`, 256, 256, (ctx, w, h) => {
		ctx.fillStyle = base;
		ctx.fillRect(0, 0, w, h);
		noise(ctx, w, h, 18, 3);
		const cell = 64;
		for (let y = 0; y < h; y += cell) {
			for (let x = 0; x < w; x += cell) {
				const cx = x + cell / 2;
				const cy = y + cell / 2;
				ctx.fillStyle = motif;
				ctx.beginPath();
				ctx.moveTo(cx, cy - 14);
				ctx.lineTo(cx + 14, cy);
				ctx.lineTo(cx, cy + 14);
				ctx.lineTo(cx - 14, cy);
				ctx.fill();
				ctx.fillStyle = accent;
				ctx.fillRect(x + 2, y + 2, 4, 4);
			}
		}
	});
}

/** Seat upholstery: fine woven noise. */
export function fabric(color = '#7a4a52') {
	return canvasTexture(`fabric-${color}`, 128, 128, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		ctx.globalAlpha = 0.08;
		ctx.fillStyle = '#000000';
		for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
		ctx.globalAlpha = 1;
		noise(ctx, w, h, 14, 7);
	});
}

/** Acoustic wall fabric: vertical weave, darker towards the bottom. */
export function acousticPanel(color = '#4a4447') {
	return canvasTexture(`acoustic-${color}`, 128, 256, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		ctx.globalAlpha = 0.07;
		ctx.fillStyle = '#000000';
		for (let x = 0; x < w; x += 3) ctx.fillRect(x, 0, 1, h);
		ctx.globalAlpha = 1;
		const shade = ctx.createLinearGradient(0, 0, 0, h);
		shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
		shade.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
		ctx.fillStyle = shade;
		ctx.fillRect(0, 0, w, h);
		noise(ctx, w, h, 10, 11);
	}, { repeat: false });
}

/** Wood: long grain stripes. */
export function wood(color = '#5a3b28') {
	return canvasTexture(`wood-${color}`, 256, 64, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		const rand = random(5);
		for (let i = 0; i < 40; i++) {
			const y = rand() * h;
			ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 + rand() * 0.12})`;
			ctx.lineWidth = 0.5 + rand() * 1.5;
			ctx.beginPath();
			ctx.moveTo(0, y);
			for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 1.5);
			ctx.stroke();
		}
		noise(ctx, w, h, 12, 9);
	});
}

/** Speaker grille: fine dot grid on dark fabric. */
export function grille() {
	return canvasTexture('grille', 64, 64, (ctx, w, h) => {
		ctx.fillStyle = '#121214';
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = '#1f1f23';
		for (let y = 2; y < h; y += 4) for (let x = 2; x < w; x += 4) ctx.fillRect(x, y, 2, 2);
	});
}

/** Ceiling: acoustic tiles. */
export function ceilingTiles(color = '#18161a') {
	return canvasTexture(`ceiling-${color}`, 128, 128, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		noise(ctx, w, h, 10, 13);
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
		ctx.lineWidth = 3;
		ctx.strokeRect(0, 0, w, h);
	});
}

/** Curtain velvet: subtle vertical sheen (the folds are in the geometry). */
export function velvet(color = '#8a1c2b') {
	return canvasTexture(`velvet-${color}`, 64, 256, (ctx, w, h) => {
		const gradient = ctx.createLinearGradient(0, 0, 0, h);
		gradient.addColorStop(0, color);
		gradient.addColorStop(1, '#3a0a12');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, w, h);
		noise(ctx, w, h, 8, 17);
	}, { repeat: false });
}

/** Soft round glow (for light halos). Alpha falls off from the center. */
export function glow() {
	return canvasTexture('glow', 128, 128, (ctx, w, h) => {
		const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
		gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.45)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, w, h);
	}, { repeat: false });
}

/** Illuminated sign with a short label (e.g. "EXIT"). */
export function sign(text, background = '#0b6b3a', foreground = '#dfffe9') {
	return canvasTexture(`sign-${text}-${background}`, 256, 96, (ctx, w, h) => {
		ctx.fillStyle = background;
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = foreground;
		ctx.font = 'bold 64px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, w / 2, h / 2 + 4);
	}, { repeat: false });
}
