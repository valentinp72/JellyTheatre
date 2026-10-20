// Small illustrations of each environment, for the picker cards. Drawn on a
// canvas (simple original vector scenes), cached as textures.

import { canvasTexture } from './kit/textures.js';

const W = 320;
const H = 180;

function screen(ctx, x, y, w, h, color = '#3a4a6b') {
	ctx.fillStyle = '#05060a';
	ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
	const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
	gradient.addColorStop(0, color);
	gradient.addColorStop(1, '#151a28');
	ctx.fillStyle = gradient;
	ctx.fillRect(x, y, w, h);
}

const painters = {
	theater(ctx) {
		ctx.fillStyle = '#17121a';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = '#8a1c2b';
		for (let i = 0; i < 6; i++) {
			ctx.fillRect(18 + i * 8, 14, 5, 120);
			ctx.fillRect(W - 66 + i * 8, 14, 5, 120);
		}
		ctx.fillRect(0, 10, W, 14);
		screen(ctx, 80, 34, 160, 84);
		ctx.fillStyle = '#5a2e36';
		for (let row = 0; row < 3; row++) {
			for (let i = 0; i < 12; i++) {
				ctx.beginPath();
				ctx.roundRect(16 + i * 25 - row * 4, 136 + row * 14, 20, 14, 4);
				ctx.fill();
			}
		}
	},
	beds(ctx) {
		// The theatre's curtains, a screen leaning out above, rows of beds.
		ctx.fillStyle = '#17121a';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = '#2a242c';
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(W, 0);
		ctx.lineTo(W - 30, 96);
		ctx.lineTo(30, 96);
		ctx.fill();
		ctx.fillStyle = '#8a1c2b';
		for (let i = 0; i < 36; i++) ctx.fillRect(i * 9, 96, 5, 30);
		ctx.fillStyle = '#05060a';
		ctx.beginPath();
		ctx.moveTo(62, 8);
		ctx.lineTo(258, 8);
		ctx.lineTo(240, 84);
		ctx.lineTo(80, 84);
		ctx.fill();
		const gradient = ctx.createLinearGradient(70, 12, 250, 80);
		gradient.addColorStop(0, '#3a4a6b');
		gradient.addColorStop(1, '#151a28');
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.moveTo(68, 12);
		ctx.lineTo(252, 12);
		ctx.lineTo(236, 80);
		ctx.lineTo(84, 80);
		ctx.fill();
		// Beds: headboards and mattresses, with red throws at their feet.
		for (const [y, w, gap] of [[128, 70, 26], [150, 84, 22]]) {
			const total = 3 * w + 2 * gap;
			for (let i = 0; i < 3; i++) {
				const x = (W - total) / 2 + i * (w + gap);
				ctx.fillStyle = '#5a2e36';
				ctx.beginPath();
				ctx.roundRect(x, y, w, 26, 5);
				ctx.fill();
				ctx.fillStyle = '#cfc8bb';
				ctx.fillRect(x + 4, y + 3, w - 8, 10);
				ctx.fillStyle = '#8a1c2b';
				ctx.fillRect(x + 4, y + 3, w - 8, 4);
			}
		}
	},
	home(ctx) {
		ctx.fillStyle = '#1a2136';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = '#4a3020';
		ctx.fillRect(0, 110, W, 70);
		ctx.fillStyle = '#fff4dc';
		for (const [x, y] of [[30, 12], [90, 20], [150, 8], [210, 18], [270, 10], [60, 28], [240, 30]]) ctx.fillRect(x, y, 2, 2);
		screen(ctx, 95, 34, 130, 72);
		// Recliners and a lamp.
		ctx.fillStyle = '#3a2218';
		for (const x of [90, 145, 200]) {
			ctx.beginPath();
			ctx.roundRect(x, 128, 36, 30, 8);
			ctx.fill();
		}
		ctx.fillStyle = '#ffd9a0';
		ctx.beginPath();
		ctx.moveTo(268, 70);
		ctx.lineTo(292, 70);
		ctx.lineTo(286, 52);
		ctx.lineTo(274, 52);
		ctx.fill();
		ctx.fillStyle = '#7a6a55';
		ctx.fillRect(279, 70, 3, 60);
	},
	station(ctx) {
		ctx.fillStyle = '#03040b';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = '#ffffff';
		for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % W, (i * 53) % 120, 1.5, 1.5);
		const planet = ctx.createRadialGradient(70, 150, 10, 60, 160, 110);
		planet.addColorStop(0, '#4e7fb0');
		planet.addColorStop(0.8, '#1b3f6b');
		planet.addColorStop(1, 'rgba(127, 180, 255, 0)');
		ctx.fillStyle = planet;
		ctx.beginPath();
		ctx.arc(60, 165, 110, 0, Math.PI * 2);
		ctx.fill();
		screen(ctx, 110, 36, 130, 72, '#2e4a6b');
		ctx.strokeStyle = '#8d939c';
		ctx.lineWidth = 6;
		for (const x of [3, 107, 213, 317]) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, H);
			ctx.stroke();
		}
		ctx.fillStyle = '#4fd8ff';
		ctx.fillRect(0, H - 6, W, 3);
	},
	cabin(ctx) {
		ctx.fillStyle = '#5a3a22';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
		for (let y = 12; y < H; y += 18) ctx.fillRect(0, y, W, 3);
		// Window with the moon.
		ctx.fillStyle = '#0b1426';
		ctx.fillRect(210, 30, 90, 70);
		ctx.fillStyle = '#f4f1e6';
		ctx.beginPath();
		ctx.arc(270, 50, 8, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#3a2616';
		ctx.fillRect(253, 30, 4, 70);
		// Stone fireplace with flames.
		ctx.fillStyle = '#6f6a64';
		ctx.fillRect(18, 40, 80, 140);
		ctx.fillStyle = '#0a0705';
		ctx.fillRect(34, 120, 48, 40);
		const fire = ctx.createRadialGradient(58, 150, 2, 58, 145, 26);
		fire.addColorStop(0, '#fff2b0');
		fire.addColorStop(0.4, '#ff9a3c');
		fire.addColorStop(1, 'rgba(230, 80, 20, 0)');
		ctx.fillStyle = fire;
		ctx.fillRect(34, 118, 48, 42);
		screen(ctx, 115, 40, 80, 46);
	},
	jungle(ctx) {
		// Night sky in the gap of the canopy, the screen tied between two trunks.
		ctx.fillStyle = '#081226';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = '#e8eef8';
		for (let i = 0; i < 40; i++) ctx.fillRect((i * 83) % W, (i * 37) % 90, 1.5, 1.5);
		ctx.fillStyle = '#1e3a1e';
		for (const [x, y, r] of [[10, 0, 60], [70, -20, 50], [250, -10, 55], [310, 10, 60], [0, 80, 40], [320, 90, 45]]) {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = '#3a2e24';
		ctx.fillRect(48, 20, 22, H);
		ctx.fillRect(250, 20, 22, H);
		ctx.strokeStyle = '#a08a62';
		ctx.lineWidth = 1.5;
		for (const [x0, x1, y] of [[70, 92, 40], [70, 92, 108], [250, 228, 40], [250, 228, 108]]) {
			ctx.beginPath();
			ctx.moveTo(x0, y);
			ctx.lineTo(x1, y + (y < 60 ? 4 : -4));
			ctx.stroke();
		}
		screen(ctx, 95, 42, 130, 64);
		// The hammock in the foreground, and fireflies.
		ctx.fillStyle = '#b8402e';
		ctx.beginPath();
		ctx.moveTo(30, 150);
		ctx.quadraticCurveTo(160, 205, 290, 150);
		ctx.quadraticCurveTo(160, 180, 30, 150);
		ctx.fill();
		ctx.fillStyle = '#e0b25a';
		ctx.fillRect(110, 168, 100, 3);
		ctx.fillStyle = '#d4ff6a';
		for (const [x, y] of [[30, 120], [290, 130], [80, 150], [240, 112], [180, 140]]) ctx.fillRect(x, y, 2.5, 2.5);
	},
	void(ctx) {
		const gradient = ctx.createLinearGradient(0, 0, 0, H);
		gradient.addColorStop(0, '#0b0710');
		gradient.addColorStop(0.6, '#140d1d');
		gradient.addColorStop(1, '#09060d');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, W, H);
		const glowing = ctx.createRadialGradient(W / 2, 160, 4, W / 2, 160, 120);
		glowing.addColorStop(0, 'rgba(120, 90, 160, 0.5)');
		glowing.addColorStop(1, 'rgba(120, 90, 160, 0)');
		ctx.fillStyle = glowing;
		ctx.fillRect(0, 100, W, 80);
		screen(ctx, 90, 30, 140, 78);
	},
	passthrough(ctx) {
		ctx.fillStyle = '#8f8a82';
		ctx.fillRect(0, 0, W, H);
		ctx.fillStyle = '#6d675f';
		ctx.fillRect(0, 120, W, 60);
		ctx.fillStyle = '#a9a39a';
		ctx.fillRect(20, 30, 50, 70);
		ctx.fillStyle = '#5a4a3a';
		ctx.fillRect(230, 90, 70, 40);
		screen(ctx, 100, 40, 120, 66);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
		ctx.setLineDash([6, 5]);
		ctx.lineWidth = 2;
		ctx.strokeRect(92, 32, 136, 82);
	},
};

/** Texture illustrating environment `key`. */
export function environmentIcon(key) {
	return canvasTexture(`environment-icon-${key}`, W, H, (ctx) => (painters[key] ?? painters.void)(ctx), { repeat: false });
}
