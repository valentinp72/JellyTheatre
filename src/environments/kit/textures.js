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

/**
 * Pictures for frames, several per texture (an atlas of `cols` × `rows`
 * cells, see atlasPlane in decor.js), so all of a room's pictures share one
 * material. Kinds: 'landscape' (paintings), 'poster' (retro art posters,
 * portrait cells), 'space' (nebulae and planets).
 */
export function pictures(kind, { cols = 4, rows = 2, seed = 1 } = {}) {
	const portrait = kind === 'poster';
	const cellW = portrait ? 192 : 256;
	const cellH = portrait ? 288 : 192;
	const texture = canvasTexture(`pictures-${kind}-${seed}`, cellW * cols, cellH * rows, (ctx) => {
		const rand = random(seed);
		for (let i = 0; i < cols * rows; i++) {
			ctx.save();
			ctx.translate((i % cols) * cellW, Math.floor(i / cols) * cellH);
			ctx.beginPath();
			ctx.rect(0, 0, cellW, cellH);
			ctx.clip();
			PICTURE_PAINTERS[kind](ctx, cellW, cellH, rand, i);
			ctx.restore();
		}
	}, { repeat: false });
	return { texture, cols, rows, aspect: cellW / cellH };
}

const hsl = (h, s, l, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

const PICTURE_PAINTERS = {
	// A mountain or lake landscape at dusk or day, a little painterly.
	landscape(ctx, w, h, rand) {
		const hue = 20 + rand() * 200;
		const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
		sky.addColorStop(0, hsl(hue, 45, 35 + rand() * 25));
		sky.addColorStop(1, hsl(hue + 30, 55, 70));
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, w, h);
		ctx.fillStyle = hsl(45, 90, 88, 0.9);
		ctx.beginPath();
		ctx.arc(w * (0.2 + rand() * 0.6), h * (0.2 + rand() * 0.2), 10 + rand() * 12, 0, Math.PI * 2);
		ctx.fill();
		for (let layer = 0; layer < 3; layer++) {
			ctx.fillStyle = hsl(hue + 160 + layer * 10, 25, 45 - layer * 13);
			ctx.beginPath();
			ctx.moveTo(0, h);
			let y = h * (0.45 + layer * 0.12);
			for (let x = 0; x <= w; x += w / 8) {
				y = h * (0.42 + layer * 0.12) + (rand() - 0.5) * h * 0.18;
				ctx.lineTo(x, y);
			}
			ctx.lineTo(w, h);
			ctx.fill();
		}
		if (rand() > 0.4) {
			ctx.fillStyle = hsl(hue, 40, 55, 0.7);
			ctx.fillRect(0, h * 0.8, w, h * 0.2);
		}
		// Pines in front.
		ctx.fillStyle = hsl(140, 30, 12);
		for (let k = 0; k < 6; k++) {
			const x = rand() * w;
			const size = 18 + rand() * 30;
			ctx.beginPath();
			ctx.moveTo(x, h - size * 2.2);
			ctx.lineTo(x + size * 0.5, h);
			ctx.lineTo(x - size * 0.5, h);
			ctx.fill();
		}
	},
	// Retro art posters: bold geometric shapes and stripes, no words.
	poster(ctx, w, h, rand, i) {
		const hue = (i * 47 + rand() * 40) % 360;
		ctx.fillStyle = hsl(hue, 45, 18);
		ctx.fillRect(0, 0, w, h);
		const style = i % 4;
		if (style === 0) {
			// Sunset with stripes.
			for (let k = 0; k < 6; k++) {
				ctx.fillStyle = hsl(hue + 20 + k * 8, 80, 60 - k * 5);
				ctx.beginPath();
				ctx.arc(w / 2, h * 0.55, w * 0.42 - k * 12, Math.PI, 0);
				ctx.fill();
			}
			ctx.fillStyle = hsl(hue + 180, 40, 15);
			ctx.fillRect(0, h * 0.55, w, h);
		} else if (style === 1) {
			// A rocket.
			ctx.fillStyle = hsl(hue + 180, 70, 70);
			ctx.beginPath();
			ctx.moveTo(w / 2, h * 0.15);
			ctx.quadraticCurveTo(w * 0.72, h * 0.45, w * 0.62, h * 0.7);
			ctx.lineTo(w * 0.38, h * 0.7);
			ctx.quadraticCurveTo(w * 0.28, h * 0.45, w / 2, h * 0.15);
			ctx.fill();
			ctx.fillStyle = hsl(30, 95, 60);
			ctx.beginPath();
			ctx.moveTo(w * 0.42, h * 0.7);
			ctx.lineTo(w / 2, h * 0.88);
			ctx.lineTo(w * 0.58, h * 0.7);
			ctx.fill();
			for (let k = 0; k < 40; k++) {
				ctx.fillStyle = hsl(0, 0, 100, rand());
				ctx.fillRect(rand() * w, rand() * h, 2, 2);
			}
		} else if (style === 2) {
			// Overlapping circles.
			for (let k = 0; k < 5; k++) {
				ctx.fillStyle = hsl(hue + k * 40, 75, 55, 0.75);
				ctx.beginPath();
				ctx.arc(w * (0.25 + rand() * 0.5), h * (0.25 + rand() * 0.45), 25 + rand() * 45, 0, Math.PI * 2);
				ctx.fill();
			}
		} else {
			// A city skyline under a big moon.
			ctx.fillStyle = hsl(hue + 40, 60, 80);
			ctx.beginPath();
			ctx.arc(w * 0.62, h * 0.32, w * 0.22, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = hsl(hue + 200, 35, 10);
			for (let x = 0; x < w; x += 14 + rand() * 18) {
				const top = h * (0.5 + rand() * 0.25);
				ctx.fillRect(x, top, 12 + rand() * 14, h - top);
			}
		}
		// A title band and a thin border, like a printed poster.
		ctx.fillStyle = hsl(hue + 30, 30, 88, 0.85);
		ctx.fillRect(w * 0.12, h * 0.89, w * 0.76, 6);
		ctx.fillRect(w * 0.25, h * 0.92, w * 0.5, 4);
		ctx.strokeStyle = hsl(0, 0, 95, 0.6);
		ctx.lineWidth = 6;
		ctx.strokeRect(8, 8, w - 16, h - 16);
	},
	// Nebulae, galaxies and planets.
	space(ctx, w, h, rand, i) {
		ctx.fillStyle = '#04050c';
		ctx.fillRect(0, 0, w, h);
		const hue = (i * 70 + rand() * 50) % 360;
		for (let k = 0; k < 6; k++) {
			const x = rand() * w;
			const y = rand() * h;
			const r = 40 + rand() * 90;
			const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
			gradient.addColorStop(0, hsl(hue + k * 25, 80, 60, 0.45));
			gradient.addColorStop(1, hsl(hue + k * 25, 80, 30, 0));
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, w, h);
		}
		for (let k = 0; k < 120; k++) {
			ctx.fillStyle = hsl(0, 0, 100, 0.3 + rand() * 0.7);
			ctx.fillRect(rand() * w, rand() * h, rand() > 0.9 ? 2 : 1, rand() > 0.9 ? 2 : 1);
		}
		if (i % 2 === 0) {
			const x = w * (0.3 + rand() * 0.4);
			const y = h * (0.3 + rand() * 0.4);
			const r = 22 + rand() * 30;
			const planet = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
			planet.addColorStop(0, hsl(hue + 180, 60, 75));
			planet.addColorStop(1, hsl(hue + 180, 50, 20));
			ctx.fillStyle = planet;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
	},
};

/** Clock face: light dial with hour marks. */
export function clockFace() {
	return canvasTexture('clock-face', 256, 256, (ctx, w, h) => {
		ctx.fillStyle = '#efe6d2';
		ctx.beginPath();
		ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#3a2a1a';
		ctx.lineCap = 'round';
		for (let i = 0; i < 60; i++) {
			const a = (i / 60) * Math.PI * 2;
			const long = i % 5 === 0;
			ctx.lineWidth = long ? 7 : 2;
			const r1 = w * (long ? 0.36 : 0.41);
			const r2 = w * 0.45;
			ctx.beginPath();
			ctx.moveTo(w / 2 + Math.sin(a) * r1, h / 2 - Math.cos(a) * r1);
			ctx.lineTo(w / 2 + Math.sin(a) * r2, h / 2 - Math.cos(a) * r2);
			ctx.stroke();
		}
	}, { repeat: false });
}

/**
 * Space station rack front (one panel, about 0.8 × 1 m): 'lockers' (stowage
 * lockers with blue handles and labels) or 'cover' (fabric cover with velcro
 * patches and stitching).
 */
export function rackPanel(variant = 'lockers') {
	return canvasTexture(`rack-${variant}`, 256, 320, (ctx, w, h) => {
		const rand = random(variant === 'lockers' ? 31 : 37);
		ctx.fillStyle = variant === 'lockers' ? '#d8d6cf' : '#cfc8b6';
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = 'rgba(40, 45, 55, 0.55)';
		ctx.lineWidth = 3;
		ctx.strokeRect(2, 2, w - 4, h - 4);
		if (variant === 'lockers') {
			// 2 × 3 locker doors, each with a handle and a label.
			const cols = 2;
			const rows = 3;
			const dw = (w - 24) / cols;
			const dh = (h - 24) / rows;
			for (let c = 0; c < cols; c++) {
				for (let r = 0; r < rows; r++) {
					const x = 12 + c * dw;
					const y = 12 + r * dh;
					ctx.fillStyle = '#e4e2dc';
					ctx.fillRect(x + 4, y + 4, dw - 8, dh - 8);
					ctx.strokeStyle = 'rgba(60, 65, 75, 0.6)';
					ctx.lineWidth = 2;
					ctx.strokeRect(x + 4, y + 4, dw - 8, dh - 8);
					ctx.fillStyle = '#2f5fa8';
					ctx.fillRect(x + dw / 2 - 22, y + dh - 26, 44, 9);
					ctx.fillStyle = rand() > 0.5 ? '#f3f1e8' : '#f2d36b';
					ctx.fillRect(x + 14, y + 14, 34 + rand() * 30, 12);
					// Fasteners in the corners.
					ctx.fillStyle = '#7a7f88';
					for (const [fx, fy] of [[x + 10, y + dh - 12], [x + dw - 12, y + dh - 12], [x + dw - 12, y + 12]]) ctx.fillRect(fx, fy, 4, 4);
				}
			}
		} else {
			// Fabric with stitched seams and velcro patches.
			ctx.strokeStyle = 'rgba(90, 80, 60, 0.5)';
			ctx.setLineDash([6, 5]);
			ctx.lineWidth = 2;
			for (const y of [h * 0.33, h * 0.66]) {
				ctx.beginPath();
				ctx.moveTo(10, y);
				ctx.lineTo(w - 10, y);
				ctx.stroke();
			}
			ctx.setLineDash([]);
			for (let i = 0; i < 7; i++) {
				ctx.fillStyle = rand() > 0.5 ? '#ece6d4' : '#b8ae96';
				ctx.fillRect(20 + rand() * (w - 70), 20 + rand() * (h - 60), 30 + rand() * 25, 14);
			}
			ctx.fillStyle = '#2f5fa8';
			ctx.fillRect(w / 2 - 30, h - 30, 60, 8);
		}
		noise(ctx, w, h, 10, variant === 'lockers' ? 41 : 43);
	}, { repeat: false });
}

/** Solar array: dark blue cells in a silver grid. */
export function solarPanel() {
	return canvasTexture('solar-panel', 256, 256, (ctx, w, h) => {
		ctx.fillStyle = '#9aa2ad';
		ctx.fillRect(0, 0, w, h);
		const n = 8;
		const cell = w / n;
		for (let x = 0; x < n; x++) {
			for (let y = 0; y < n; y++) {
				const g = ctx.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
				g.addColorStop(0, '#1d3a6e');
				g.addColorStop(1, '#0f2148');
				ctx.fillStyle = g;
				ctx.fillRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
			}
		}
	});
}

/**
 * Space station wall panel, 1024 px for 2.6 × 2.6 m (ShapeGeometry UVs are
 * in metres: use repeat 1/2.6 and offset 0.5 to center it): light grey
 * plates with seams and fasteners, access hatches, labels, a vent.
 */
export function stationPanel() {
	return canvasTexture('station-panel', 1024, 1024, (ctx, w, h) => {
		const rand = random(53);
		const px = w / 2.6; // pixels per metre
		ctx.fillStyle = '#cdd1d7';
		ctx.fillRect(0, 0, w, h);
		// Plates: slightly different greys, seams and fasteners around them.
		const plate = 0.52 * px;
		for (let x = 0; x < w; x += plate) {
			for (let y = 0; y < h; y += plate) {
				ctx.fillStyle = `hsl(215, 8%, ${78 + rand() * 6}%)`;
				ctx.fillRect(x + 2, y + 2, plate - 4, plate - 4);
				ctx.fillStyle = 'rgba(40, 46, 56, 0.55)';
				for (let i = 1; i < 6; i++) {
					for (const [fx, fy] of [[x + (i * plate) / 6, y + 9], [x + (i * plate) / 6, y + plate - 9], [x + 9, y + (i * plate) / 6], [x + plate - 9, y + (i * plate) / 6]]) {
						ctx.beginPath();
						ctx.arc(fx, fy, 3, 0, Math.PI * 2);
						ctx.fill();
					}
				}
			}
		}
		ctx.strokeStyle = 'rgba(35, 40, 50, 0.7)';
		ctx.lineWidth = 3;
		for (let x = 0; x <= w; x += plate) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, h);
			ctx.stroke();
		}
		for (let y = 0; y <= h; y += plate) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(w, y);
			ctx.stroke();
		}
		// Access hatches with quarter-turn fasteners, in the corners.
		for (const [cx, cy] of [[0.35, 0.3], [2.1, 0.32], [0.4, 2.15], [2.05, 2.2]]) {
			const x = cx * px;
			const y = cy * px;
			const size = 0.3 * px;
			ctx.fillStyle = '#bfc4cb';
			ctx.fillRect(x, y, size, size * 0.7);
			ctx.strokeStyle = 'rgba(30, 35, 45, 0.8)';
			ctx.lineWidth = 3;
			ctx.strokeRect(x, y, size, size * 0.7);
			ctx.fillStyle = '#4a5260';
			for (const [fx, fy] of [[x + 10, y + 10], [x + size - 10, y + 10], [x + 10, y + size * 0.7 - 10], [x + size - 10, y + size * 0.7 - 10]]) {
				ctx.beginPath();
				ctx.arc(fx, fy, 6, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		// A vent grille under the screen.
		ctx.fillStyle = '#3a414c';
		for (let i = 0; i < 14; i++) ctx.fillRect(w / 2 - 0.42 * px + i * 0.06 * px, h / 2 + 0.62 * px, 0.035 * px, 0.12 * px);
		// Labels: white and yellow stickers, a blue stripe.
		for (const [lx, ly, lw, color] of [[0.62, 0.62, 0.22, '#f4f2ea'], [1.75, 0.6, 0.18, '#f2d36b'], [0.6, 1.95, 0.16, '#f2d36b'], [1.8, 1.98, 0.22, '#f4f2ea'], [1.12, 2.08, 0.36, '#2f5fa8']]) {
			ctx.fillStyle = color;
			ctx.fillRect(lx * px, ly * px, lw * px, 0.05 * px);
			ctx.fillStyle = 'rgba(30, 35, 45, 0.6)';
			for (let i = 0; i < 4; i++) ctx.fillRect(lx * px + 6 + i * 0.045 * px, ly * px + 0.017 * px, 0.03 * px, 0.016 * px);
		}
		noise(ctx, w, h, 8, 59);
	});
}

/** Tree bark: deep vertical fissures, with patches of moss. */
export function bark(color = '#4a3a2c', moss = '#3f5a2a') {
	return canvasTexture(`bark-${color}-${moss}`, 128, 256, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		const rand = random(61);
		// Moss, mostly in soft patches.
		for (let i = 0; i < 14; i++) {
			const x = rand() * w;
			const y = rand() * h;
			const r = 10 + rand() * 30;
			const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
			gradient.addColorStop(0, moss);
			gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
			ctx.globalAlpha = 0.5 + rand() * 0.4;
			ctx.fillStyle = gradient;
			for (const dx of [-w, 0, w]) ctx.fillRect(x + dx - r, y - r, r * 2, r * 2);
		}
		ctx.globalAlpha = 1;
		// Fissures: wavy dark lines along the trunk.
		for (let i = 0; i < 26; i++) {
			const x0 = rand() * w;
			ctx.strokeStyle = `rgba(0, 0, 0, ${0.25 + rand() * 0.35})`;
			ctx.lineWidth = 1 + rand() * 3;
			ctx.beginPath();
			for (let y = 0; y <= h; y += 16) {
				const x = x0 + Math.sin(y * 0.05 + i) * 4 + Math.sin(y * 0.013 + i * 3) * 6;
				if (y === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
		}
		noise(ctx, w, h, 18, 63);
	});
}

/** Forest floor: dark soil under fallen leaves and twigs. */
export function leafLitter(color = '#2a2418') {
	return canvasTexture(`litter-${color}`, 256, 256, (ctx, w, h) => {
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		const rand = random(71);
		const tones = ['#4a3a22', '#5a4426', '#3a3a1e', '#6a5030', '#2e3a1c', '#3e2c1a'];
		for (let i = 0; i < 420; i++) {
			const x = rand() * w;
			const y = rand() * h;
			const length = 5 + rand() * 12;
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(rand() * Math.PI);
			ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
			ctx.globalAlpha = 0.6 + rand() * 0.4;
			ctx.beginPath();
			ctx.ellipse(0, 0, length, length * (0.3 + rand() * 0.2), 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		ctx.globalAlpha = 1;
		// Twigs.
		for (let i = 0; i < 30; i++) {
			ctx.strokeStyle = `rgba(30, 20, 12, ${0.5 + rand() * 0.4})`;
			ctx.lineWidth = 1 + rand();
			const x = rand() * w;
			const y = rand() * h;
			const a = rand() * Math.PI;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24);
			ctx.stroke();
		}
		noise(ctx, w, h, 14, 73);
	});
}

/**
 * Leaves on a transparent background, for plant cards (use with alphaTest).
 * Drawn light: tint them with the material or instance color.
 * - frond: a palm or fern frond, leaflets along a curved stem (stem at the bottom);
 * - broad: one big banana-like leaf with veins and a few tears (stem at the bottom);
 * - canopy: a mass of small leaves, for tree crowns seen from below.
 * @param {'frond' | 'broad' | 'canopy'} kind
 */
export function foliage(kind) {
	const [w, h] = kind === 'canopy' ? [256, 256] : [128, 256];
	return canvasTexture(`foliage-${kind}`, w, h, (ctx) => FOLIAGE_PAINTERS[kind](ctx, w, h, random(kind.length * 17)), { repeat: false });
}

const leafShades = (rand) => `hsl(${95 + rand() * 30}, ${35 + rand() * 20}%, ${42 + rand() * 18}%)`;

const FOLIAGE_PAINTERS = {
	frond(ctx, w, h, rand) {
		// The stem: from the bottom center, bending to one side near the tip.
		const stem = (t) => [w / 2 + Math.sin(t * 1.6) * w * 0.12 * t, h - t * h * 0.96];
		ctx.strokeStyle = '#8a9a5a';
		ctx.lineWidth = 3;
		ctx.beginPath();
		for (let t = 0; t <= 1; t += 0.05) ctx.lineTo(...stem(t));
		ctx.stroke();
		for (let t = 0.12; t < 0.98; t += 0.035) {
			const [x, y] = stem(t);
			const length = w * 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 4;
			for (const side of [-1, 1]) {
				ctx.save();
				ctx.translate(x, y);
				ctx.rotate(side * (1.05 - t * 0.35));
				ctx.fillStyle = leafShades(rand);
				ctx.beginPath();
				ctx.ellipse(0, -length / 2, length * 0.09, length / 2, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			}
		}
	},
	broad(ctx, w, h, rand) {
		const outline = (x) => Math.sin(Math.PI * x) ** 0.7;
		const half = w * 0.46;
		ctx.fillStyle = leafShades(rand);
		ctx.beginPath();
		ctx.moveTo(w / 2, h);
		for (let t = 0; t <= 1; t += 0.05) ctx.lineTo(w / 2 + half * outline(t), h - t * h);
		for (let t = 1; t >= 0; t -= 0.05) ctx.lineTo(w / 2 - half * outline(t), h - t * h);
		ctx.fill();
		// Veins, and tears between some of them (cut out).
		for (let t = 0.08; t < 0.95; t += 0.06) {
			const y = h - t * h;
			for (const side of [-1, 1]) {
				const x = w / 2 + side * half * outline(t + 0.08) * 1.05;
				const yEnd = y - h * 0.05;
				if (rand() < 0.22) {
					ctx.globalCompositeOperation = 'destination-out';
					ctx.lineWidth = 2.5;
					ctx.beginPath();
					ctx.moveTo(w / 2 + side * w * 0.12, y - h * 0.01);
					ctx.lineTo(x, yEnd);
					ctx.stroke();
					ctx.globalCompositeOperation = 'source-over';
				}
				ctx.strokeStyle = 'rgba(220, 235, 170, 0.35)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(w / 2, y);
				ctx.lineTo(x * 0.98 + (w / 2) * 0.02, yEnd);
				ctx.stroke();
			}
		}
		ctx.strokeStyle = 'rgba(230, 240, 190, 0.7)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(w / 2, h);
		ctx.lineTo(w / 2, 4);
		ctx.stroke();
	},
	canopy(ctx, w, h, rand) {
		// Small leaves, denser in the middle, thinning out to ragged edges.
		for (let i = 0; i < 520; i++) {
			const angle = rand() * Math.PI * 2;
			const radius = Math.sqrt(rand()) * w * 0.46;
			const x = w / 2 + Math.cos(angle) * radius;
			const y = h / 2 + Math.sin(angle) * radius;
			const length = 7 + rand() * 9;
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(rand() * Math.PI * 2);
			ctx.fillStyle = leafShades(rand);
			ctx.beginPath();
			ctx.ellipse(0, 0, length * 0.4, length, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	},
};

/** Woven stripes along the length of a hammock (u: across, v: along). */
export function stripes(colors = ['#b8402e', '#e0b25a', '#efe3c8', '#2f7a78', '#2a3a6b']) {
	return canvasTexture(`stripes-${colors.join('')}`, 128, 32, (ctx, w, h) => {
		const rand = random(83);
		let x = 0;
		let i = 0;
		while (x < w) {
			const width = 3 + rand() * 9;
			ctx.fillStyle = colors[i % colors.length];
			ctx.fillRect(x, 0, width, h);
			x += width;
			i += 1 + Math.floor(rand() * 2);
		}
		// The weave: fine cross threads.
		ctx.globalAlpha = 0.12;
		ctx.fillStyle = '#000000';
		for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
		ctx.globalAlpha = 1;
		noise(ctx, w, h, 16, 85);
	});
}
