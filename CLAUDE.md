# CLAUDE.md

Guidance for working on JellyTheatre. Read `README.md` first: it holds the
architecture, the Jellyfin API mapping and the roadmap. Keep the roadmap
checkboxes up to date when a step is finished.

## Commands

- `npm run dev`: dev server on port 5173; `npm run dev:https` for self-signed HTTPS (LAN access from the headset)
- `npm run build`: production build (also generates the PWA service worker)
- `npm run preview`: serve the build
- Quest testing: `npm run dev:https`, open `https://<pc-ip>:5173` on the Quest
  (plain HTTP on a LAN IP is not a secure context: no WebXR). Optional: USB +
  `adb reverse tcp:5173 tcp:5173`, then open
  `http://localhost:5173` in the Quest Browser.

## Stack

- Vanilla JS ES modules, no framework, no TypeScript. Vite 6 (the dev machine
  runs Node 20.16, newer Vite needs ≥ 20.19).
- A-Frame from npm (`import 'aframe'` exposes the global `AFRAME` / `THREE`).
  Register components in their own modules, imported for side effects.
- `@jellyfin/sdk` for API calls (`getXxxApi(api)` helpers from
  `@jellyfin/sdk/lib/utils/api/...`).
- `hls.js` only when Jellyfin returns an HLS transcoding URL; direct play uses a
  plain `<video>`.
- `vite-plugin-pwa` generates the manifest and service worker. Media and API
  requests must never be cached by the service worker.

## Hard requirements (do not regress)

1. **Avoid transcoding.** The Jellyfin server is weak. Build the device profile
   from runtime capability checks, prefer direct play > remux/direct stream >
   transcode. Never let a subtitle or audio track choice trigger a *video*
   transcode when it can be avoided (audio-only transcode is acceptable).
2. **Subtitles.** Text subtitles are fetched as WebVTT via `External` delivery
   and rendered in-scene by the client. No burn-in by default.
3. **Jellyfin is the source of truth** for watch state: always report playback
   start / progress / stop.
4. **No secrets in the repo.** Server URL and tokens live in the browser's
   `localStorage` only. The device id is generated once and persisted.

## Conventions

- In-VR interactive entities get the `clickable` class; controller raycasters
  target `.clickable`.
- Environments live in `src/environments/<name>/` and must expose a screen
  anchor (position, rotation, size) and a default viewer position, so the
  player is environment-agnostic.
- The 2D lobby (`src/lobby/`) is plain DOM and must work without a headset.
