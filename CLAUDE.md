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
   and rendered in-scene by the client; PGS is fetched as-is and drawn by
   libpgs. No burn-in, ever.
3. **Jellyfin is the source of truth** for watch state: always report playback
   start / progress / stop.
4. **No secrets in the repo.** Server URL and tokens live in the browser's
   `localStorage` only. The device id is generated once and persisted.

## Conventions

- In-VR interactive entities carry `data-interactive`; `setInteractiveVisible()`
  (src/ui/widgets.js) toggles their `clickable` class, which the raycasters
  target, so hidden UI can't be clicked. Create UI entities with `entity()`.
- In-VR text uses the `ui-text` component (troika, bundled Inter font), never
  A-Frame's `text`.
- A-Frame components initialize asynchronously: use `whenLoaded()` before
  calling methods on a freshly created entity's components.
- No getters in A-Frame component definitions: A-Frame copies definitions
  property by property, evaluating getters once at registration. Use methods.
- In VR the video (media layer) and the library panel (quad layer) are WebXR
  layers *behind* the projection layer; the scene punches holes (alpha 0) so
  anything drawn after them stays visible. Shared code: src/xr/layers.js. The
  panel's meshes move to three.js layer 5 while layered, so every raycaster
  must test all layers (`enableAllRaycastLayers`).
- three.js cameras ignore the scale inherited from their parent: size
  offscreen cameras in world units (see `fitCamera` in src/xr/panel-layer.js).
- Never rely on `video.volume` (ignored by the Quest Browser): volume goes
  through the Web Audio gain in Player.
- User settings live in src/settings.js (`SETTING_DEFINITIONS`, types
  boolean / choice / action); the in-VR settings panel (src/ui/settings-panel.js)
  is generated from that list. No settings in the 2D lobby.
- A-Frame's default lights are disabled (`light="defaultLightsEnabled: false"`
  on the scene): environments create their own three.js lights, which
  A-Frame doesn't count, so its defaults would otherwise flood the room.
- Recenter is tied to the headset's own recenter (reference space `reset`
  event): don't add a separate recenter button on the controllers.
- Icons are geometry (src/ui/icons.js), not font glyphs: the bundled Inter
  subset lacks most symbols. Icon buttons should set a `tooltip`.
- The playback mode badge (Direct play / Remux / Transcoding) must stay
  accurate: it is how transcoding regressions get noticed.
- Environments live in `src/environments/<name>/`, are registered in
  `src/environments/index.js` with a layout (screen anchor, seat, `ar` for
  passthrough) and must implement `setHouseLights(on)`. The player and menus
  are environment-agnostic.
- Teleport surfaces are meshes with `userData.teleport = true` (only faces
  pointing up count); an environment may implement `snapTeleport(point)`.
  No continuous locomotion: it makes the user sick.
- In passthrough A-Frame sets the `ar-mode` state, *not* `vr-mode`: check both
  when testing for an immersive session.
- The camera rig moves (walking, recentering, tilt): anything placed in world
  space but parented to the rig, and every XR layer transform, must be
  recomputed on `rig-moved` / every frame.
- The 2D lobby (`src/lobby/`) is plain DOM and must work without a headset.
