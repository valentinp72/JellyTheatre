import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// `vite --mode https` serves over self-signed HTTPS, needed to open the dev
// server from the headset over the LAN (WebXR requires a secure context).
export default defineConfig(({ mode }) => ({
	// Served at the domain root; BASE_PATH builds for a sub-path.
	base: process.env.BASE_PATH ?? '/',
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	server: {
		host: true,
		port: 5173,
		strictPort: true,
	},
	build: {
		chunkSizeWarningLimit: 3000,
	},
	plugins: [
		mode === 'https' && basicSsl(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['icon.svg'],
			manifest: {
				name: 'JellyTheatre',
				short_name: 'JellyTheatre',
				description: 'Watch your Jellyfin library in a virtual movie theatre.',
				start_url: '.',
				display: 'standalone',
				orientation: 'landscape',
				background_color: '#0b0710',
				theme_color: '#0b0710',
				icons: [
					{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			workbox: {
				// A-Frame makes the main chunk large.
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
				globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
				// Jellyfin API and media are cross-origin and never cached.
				runtimeCaching: [],
			},
		}),
	],
}));
