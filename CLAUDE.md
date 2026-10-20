# CLAUDE.md

Guidance for working on JellyTheatre. Read `docs/TECHNICAL.md` first: it
holds the architecture, the Jellyfin API mapping, the playback strategy and
the development history. `README.md` is for users (features, getting started,
controls, roadmap of next features): keep it up to date when a user-visible
feature changes, and move a roadmap item into the technical history once it
ships.

## Commands

- `npm run dev`: dev server on port 5173; `npm run dev:https` for self-signed HTTPS (LAN access from the headset)
- `npm run build`: production build (also generates the PWA service worker)
- `npm run preview`: serve the build
- `npm test`: end-to-end smoke test of the built app (run `npm run build`
  first), ~10 s, headless Chrome against the fake Jellyfin server. CI runs it
  on every push and pull request; keep it fast.
- `BASE_PATH=/JellyTheatre/ npm run build`: build for a sub-path (GitHub
  Pages). Use `import.meta.env.BASE_URL` for any asset URL built in code.
- `npm run screenshots`: builds, then captures `docs/screenshots/*.png`
  (README) and `public/environments/*.jpg` (picker cards) in headless Chrome
  against the fake Jellyfin server in `tools/screenshots/`. Its library is
  Blender's open movies (CC BY; posters and a clip downloaded once into the
  uncommitted cache, credited in the README). Only use films with a CC BY
  licence and credit them. `npm test` uses the invented library and never
  downloads. Rerun it after changing an environment or the UI. The fake server
  is also handy for manual testing.
- `npm run store-assets`: Meta Horizon Store screenshots, covers, logo and
  icon into `store/horizon/assets/` (not committed); listing text in
  `store/horizon/listing.md`. The privacy policy is `public/privacy.html`:
  update it if the app starts storing or sending anything new.
- `npm run package:horizon`: builds the signed Meta Horizon Store APK from
  `store/horizon/twa-manifest.json` (see "Meta Horizon Store app" in
  `docs/TECHNICAL.md`). The signing key and its password never go in the repo.
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
  through the Web Audio gain in Player. The film's audio then goes to
  SpatialAudio (src/player/spatial-audio.js), one virtual speaker per
  channel, never downmixed first (no browser HRTF: it dulls the sound; no
  interaural delay on the front speakers: it notches speech at 2 kHz); the AudioContext is only connected once it runs
  (a suspended one would silence the film).
- User settings live in src/settings.js (`SETTING_DEFINITIONS`, types
  boolean / choice / action); the in-VR settings panel (src/ui/settings-panel.js)
  is generated from that list. No settings in the 2D lobby.
- A-Frame's default lights are disabled (`light="defaultLightsEnabled: false"`
  on the scene): environments create their own three.js lights, which
  A-Frame doesn't count, so its defaults would otherwise flood the room.
- Recenter is tied to the headset's own recenter (reference space `reset`
  event): don't add a separate recenter button on the controllers.
- The menus (library, keyboard, controls, up next, settings) live under
  `#view` in the rig, laid out for a seated user looking ahead. Recentering
  reclined turns `#view` with the gaze, so they come in front of the eyes:
  place any new menu there, and compute rig-relative poses from its parent.
- Environments for lying down (the jungle hammock, the bed cinema) set `head`
  (where the eyes go) and `screen.tilt` in their layout: the screen leans back
  above the viewer, so the room stays level and matches the body (never
  rotate the room to the eyes instead: it makes users sick). With several
  beds, each seat spot carries its own `head`. Keep the line of sight from
  `head` to the screen clear (the jungle's `blocksScreen` / `plantHidesScreen`).
- Icons are geometry (src/ui/icons.js), not font glyphs: the bundled Inter
  subset lacks most symbols. Icon buttons should set a `tooltip`.
- The playback mode badge (Direct play / Remux / Transcoding) must stay
  accurate: it is how transcoding regressions get noticed.
- Environments live in `src/environments/<name>/`, are declared with
  `defineEnvironment(name, { build(env) })` (src/environments/kit/environment.js)
  and registered in `src/environments/index.js` with a layout (screen anchor,
  seat, `screenLight`, `ar` for passthrough, `menuDistance` for small rooms). The player and menus are
  environment-agnostic.
- Build environments from the kit (src/environments/kit/): `StaticBuilder`
  (merges static geometry per material),
  `textures` (procedural, cached; no image assets), `geometry` (rounded boxes,
  folded curtains, stairs, metre-tiled UVs), `SeatRows` + `cinemaSeat`
  (instanced seats), `SeatSpots` (seats on props: the teleport targets),
  `props` (sofa, recliner, bookshelf, lamps, plant, table, rug, speaker,
  `Placer`), `decor` (framed pictures from a `textures.pictures` atlas,
  sideboard, popcorn machine, crates, woodpile, wall shelf, pendant lamp,
  planter, handrail, cargo bag, static `StatusDisplays`; effects: `Candles`,
  `WallClock`, `FloatingObjects` for zero g),
  `sky` (gradient sky, stars, planet, moon, mountains, lake,
  pines), `nature` (trunks, buttress roots, ropes and vines, `PlantCards`
  instanced leaf cards, treeline, `Fireflies`), `Fire` (flames + flickering light; push into `env.effects`),
  `EnvironmentLighting` (house lights, fixtures and glows that dim, screen
  light, `onScreen` effects, `projectorBeam`).
- A new environment also needs an entry in `src/environments/index.js` (name,
  description, `tags` from `ENVIRONMENT_TAGS`: indoor / outdoor / passthrough,
  each posture it offers, several seats; shown as chips with geometry icons
  on the picker cards), an option in the `environment` setting and a picker
  illustration in `src/environments/icons.js`.
- Quest budget for an environment: ~50 draw calls and ~150k triangles (it is
  drawn once per eye). Keep instanced models low-poly.
- Teleport only lands on seats (`env.seats`, exposed by `seatPositions()`):
  the user points at one. An environment without seats has no teleport. No
  continuous locomotion: it makes the user sick.
- Keep decoration out of the line between the seats and the screen (pendant
  lamps go to the sides).
- In passthrough A-Frame sets the `ar-mode` state, *not* `vr-mode`: check both
  when testing for an immersive session.
- The camera rig moves (walking, recentering, tilt): anything placed in world
  space but parented to the rig, and every XR layer transform, must be
  recomputed on `rig-moved` / every frame.
- The 2D lobby (`src/lobby/`) is plain DOM and must work without a headset.
- The Horizon Store app (`?app=horizon`, `STORE_APP` in main.js) never shows
  the lobby: it enters VR at launch and signs in from the library panel's
  sign-in view (src/ui/sign-in-view.js). Anything the lobby offers must also
  work from VR.
