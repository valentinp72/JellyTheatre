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

/** Floor planks: staggered boards with grain. */
export function planks(color = '#6b4a30') {
	return canvasTexture(`planks-${color}`, 256, 256, (ctx, w, h) => {
		const rand = random(21);
		const rows = 8;
		const rowH = h / rows;
		for (let r = 0; r < rows; r++) {
			let x = -rand() * 128;
			while (x < w) {
				const len = 96 + rand() * 96;
				const shade = 0.85 + rand() * 0.3;
				ctx.fillStyle = color;
				ctx.filter = `brightness(${shade})`;
				ctx.fillRect(x, r * rowH, len, rowH);
				ctx.filter = 'none';
				ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
				ctx.fillRect(x, r * rowH, 2, rowH);
				x += len;
			}
			ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
			ctx.fillRect(0, r * rowH, w, 1.5);
		}
		for (let i = 0; i < 120; i++) {
			ctx.strokeStyle = `rgba(0, 0, 0, ${0.04 + rand() * 0.08})`;
			const y = rand() * h;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(w, y + (rand() - 0.5) * 2);
			ctx.stroke();
		}
		noise(ctx, w, h, 10, 23);
	});
}

/** Stacked logs (cabin walls): rounded horizontal bands with dark gaps. */
export function logs(color = '#7a5232') {
	return canvasTexture(`logs-${color}`, 256, 256, (ctx, w, h) => {
		const count = 4;
		const logH = h / count;
		for (let i = 0; i < count; i++) {
			const gradient = ctx.createLinearGradient(0, i * logH, 0, (i + 1) * logH);
			gradient.addColorStop(0, '#2a1a10');
			gradient.addColorStop(0.15, color);
			gradient.addColorStop(0.55, color);
			gradient.addColorStop(0.9, '#3a2516');
			gradient.addColorStop(1, '#1a0f08');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, i * logH, w, logH);
		}
		const rand = random(31);
		for (let i = 0; i < 90; i++) {
			ctx.strokeStyle = `rgba(0, 0, 0, ${0.05 + rand() * 0.1})`;
			const y = rand() * h;
			ctx.beginPath();
			ctx.moveTo(0, y);
			for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.2);
			ctx.stroke();
		}
		noise(ctx, w, h, 12, 33);
	});
}

/** Irregular fieldstone (fireplace). */
export function stone(color = '#6f6a64') {
	return canvasTexture(`stone-${color}`, 256, 256, (ctx, w, h) => {
		ctx.fillStyle = '#2b2826';
		ctx.fillRect(0, 0, w, h);
		const rand = random(41);
		let y = 0;
		while (y < h) {
			const rowH = 28 + rand() * 20;
			let x = -rand() * 30;
			while (x < w) {
				const sw = 36 + rand() * 40;
				ctx.fillStyle = color;
				ctx.filter = `brightness(${0.7 + rand() * 0.5})`;
				ctx.beginPath();
				ctx.roundRect(x + 2, y + 2, sw - 4, rowH - 4, 8);
				ctx.fill();
				ctx.filter = 'none';
				x += sw;
			}
			y += rowH;
		}
		noise(ctx, w, h, 22, 43);
	});
}

/** Metal deck plates with seams and rivets (space station). */
export function deckPlates(color = '#5d636b') {
	return canvasTexture(`deck-${color}`, 256, 256, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		noise(ctx, w, h, 12, 51);
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.lineWidth = 3;
		ctx.strokeRect(0, 0, w, h);
		ctx.beginPath();
		ctx.moveTo(w / 2, 0);
		ctx.lineTo(w / 2, h);
		ctx.stroke();
		ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
		for (const [x, y] of [[10, 10], [w / 2 - 10, 10], [w / 2 + 10, 10], [w - 10, 10], [10, h - 10], [w / 2 - 10, h - 10], [w / 2 + 10, h - 10], [w - 10, h - 10]]) {
			ctx.beginPath();
			ctx.arc(x, y, 3, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

/** Leather: soft mottled surface. */
export function leather(color = '#4a2b1d') {
	return canvasTexture(`leather-${color}`, 128, 128, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		const rand = random(61);
		for (let i = 0; i < 300; i++) {
			ctx.fillStyle = `rgba(0, 0, 0, ${rand() * 0.08})`;
			ctx.beginPath();
			ctx.arc(rand() * w, rand() * h, 1 + rand() * 4, 0, Math.PI * 2);
			ctx.fill();
		}
		noise(ctx, w, h, 10, 63);
	});
}

/** Rug: border bands around a patterned field. */
export function rug(field = '#5b2a2a', border = '#c9a36b', pattern = '#2e3d5c') {
	return canvasTexture(`rug-${field}-${border}`, 256, 256, (ctx, w, h) => {
		ctx.fillStyle = border;
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = field;
		ctx.fillRect(18, 18, w - 36, h - 36);
		ctx.strokeStyle = pattern;
		ctx.lineWidth = 6;
		ctx.strokeRect(30, 30, w - 60, h - 60);
		ctx.fillStyle = pattern;
		for (let y = 64; y < h - 48; y += 40) {
			for (let x = 64; x < w - 48; x += 40) {
				ctx.beginPath();
				ctx.moveTo(x, y - 10);
				ctx.lineTo(x + 10, y);
				ctx.lineTo(x, y + 10);
				ctx.lineTo(x - 10, y);
				ctx.fill();
			}
		}
		noise(ctx, w, h, 16, 71);
	}, { repeat: false });
}

/** A flame: bright core fading to orange edges, transparent around. */
export function flame() {
	return canvasTexture('flame', 64, 128, (ctx, w, h) => {
		const gradient = ctx.createRadialGradient(w / 2, h * 0.72, 2, w / 2, h * 0.6, h * 0.5);
		gradient.addColorStop(0, 'rgba(255, 245, 200, 1)');
		gradient.addColorStop(0.25, 'rgba(255, 180, 60, 0.9)');
		gradient.addColorStop(0.6, 'rgba(230, 80, 20, 0.45)');
		gradient.addColorStop(1, 'rgba(120, 20, 0, 0)');
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.moveTo(w / 2, 0);
		ctx.bezierCurveTo(w * 0.95, h * 0.45, w, h * 0.9, w / 2, h);
		ctx.bezierCurveTo(0, h * 0.9, w * 0.05, h * 0.45, w / 2, 0);
		ctx.fill();
	}, { repeat: false });
}

/** Rain streaks for window glass (scrolled vertically). */
export function rain() {
	return canvasTexture('rain', 128, 256, (ctx, w, h) => {
		ctx.clearRect(0, 0, w, h);
		const rand = random(81);
		for (let i = 0; i < 70; i++) {
			const x = rand() * w;
			const y = rand() * h;
			const len = 10 + rand() * 30;
			ctx.strokeStyle = `rgba(200, 220, 255, ${0.1 + rand() * 0.25})`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + 1, y + len);
			ctx.stroke();
			ctx.fillStyle = 'rgba(220, 235, 255, 0.35)';
			ctx.beginPath();
			ctx.arc(x + 1, y + len, 1.5, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

/** A made-up planet surface (equirectangular): oceans, land masses and clouds. */
export function planetSurface(seed = 7) {
	return canvasTexture(`planet-${seed}`, 512, 256, (ctx, w, h) => {
		ctx.fillStyle = '#1b3f6b';
		ctx.fillRect(0, 0, w, h);
		const rand = random(seed);
		// Land: clusters of blobs.
		for (let c = 0; c < 9; c++) {
			const cx = rand() * w;
			const cy = h * (0.2 + rand() * 0.6);
			for (let i = 0; i < 40; i++) {
				const r = 6 + rand() * 22;
				ctx.fillStyle = rand() > 0.3 ? '#4e6b3a' : '#8a7a52';
				ctx.beginPath();
				const x = (cx + (rand() - 0.5) * 120 + w) % w;
				ctx.arc(x, cy + (rand() - 0.5) * 60, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		// Polar caps.
		ctx.fillStyle = 'rgba(235, 240, 245, 0.9)';
		ctx.fillRect(0, 0, w, h * 0.06);
		ctx.fillRect(0, h * 0.94, w, h * 0.06);
		// Clouds.
		for (let i = 0; i < 220; i++) {
			ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + rand() * 0.2})`;
			ctx.beginPath();
			ctx.ellipse(rand() * w, rand() * h, 10 + rand() * 40, 2 + rand() * 6, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

/** A water drop on glass: transparent, with a bright rim and a highlight. */
export function droplet() {
	return canvasTexture('droplet', 64, 64, (ctx, w, h) => {
		ctx.clearRect(0, 0, w, h);
		const rim = ctx.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.48);
		rim.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
		rim.addColorStop(0.8, 'rgba(210, 225, 255, 0.55)');
		rim.addColorStop(1, 'rgba(210, 225, 255, 0)');
		ctx.fillStyle = rim;
		ctx.beginPath();
		ctx.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.beginPath();
		ctx.arc(w * 0.4, h * 0.36, w * 0.07, 0, Math.PI * 2);
		ctx.fill();
	}, { repeat: false });
}
