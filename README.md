# JellyTheatre

A WebXR client for [Jellyfin](https://jellyfin.org): watch your movies and shows in
a virtual movie theatre on a VR headset (primary target: **Meta Quest 3** via the
Quest Browser). It is an installable PWA built with [A-Frame](https://aframe.io).

## Goals

- **Environments**: the video is shown inside a 3D environment. First one: a simple
  movie theatre. More (and a passthrough "screen in your room" mode) later.
- **Library sync**: show what you are currently watching (Continue Watching,
  Next Up), resume where you left off, and report progress back so Jellyfin stays
  the single source of truth for watch state.
- **Subtitles**: text subtitles (SRT, ASS/SSA, WebVTT…) rendered in the scene.
- **Avoid transcoding**: the target server is low-powered. Direct play whenever
  the headset can decode the file, cheap remux/audio-only transcode otherwise,
  full video transcode only as a last resort.

## Approach: Jellyfin API, not the Jellyfin web UI

Embedding the Jellyfin web interface was considered and rejected: inside an
immersive WebXR session only WebGL output is visible, and a cross-origin web page
(iframe/DOM) cannot be rendered into a WebGL texture. JellyTheatre therefore talks
to the Jellyfin REST API directly (through `@jellyfin/sdk`) and draws its own UI.

To keep the convenience of the official apps, JellyTheatre will also register as a
**remote-controllable session**, so you can pick something in Jellyfin web or on
your phone and "play on" JellyTheatre.

### Jellyfin API usage

| Need | Endpoint |
|---|---|
| Login without a keyboard | Quick Connect: `POST /QuickConnect/Initiate`, poll `GET /QuickConnect/Connect`, then `POST /Users/AuthenticateWithQuickConnect`. Password login as fallback. |
| Currently watching | `GET /UserItems/Resume`, `GET /Shows/NextUp` |
| Browse | `GET /UserViews`, `GET /Items?ParentId=…` |
| Resume position | `UserData.PlaybackPositionTicks` on items |
| Stream selection | `POST /Items/{id}/PlaybackInfo` with a device profile describing the headset |
| Progress sync | `POST /Sessions/Playing`, `/Sessions/Playing/Progress` (≈10 s + on pause/seek), `/Sessions/Playing/Stopped` |
| Subtitles | `DeliveryUrl` of external subtitle streams (WebVTT) |
| Remote control | WebSocket `/socket` + `POST /Sessions/Capabilities/Full` |

### Playback strategy (minimising server load)

The device profile sent to `PlaybackInfo` is built **at runtime** from what the
browser reports (`MediaSource.isTypeSupported` / `canPlayType`), so we never
claim support we don't have, and never under-claim what the Quest can decode
(H.264, HEVC, VP9, AV1 in hardware). Preference order:

1. **Direct play**: the original file is streamed as-is. Zero server CPU.
2. **Direct stream / remux**: the video is copied into HLS (e.g. H.264/HEVC in
   MKV, which Chromium cannot demux), audio copied or transcoded (AC3/DTS → AAC
   is cheap). Very low server CPU.
3. **Full transcode**: only if the video codec itself is unsupported.

Subtitles must never force a transcode: text subtitles are requested with
`External` delivery (converted to WebVTT by the server, which is cheap) and
rendered by the client. Image-based subtitles (PGS/VobSub) would require burn-in,
so they are not offered by default; client-side PGS rendering is a later step.

### Constraints

- **HTTPS everywhere**: WebXR and service workers need a secure context, and an
  HTTPS page cannot load media from an HTTP Jellyfin server. Your Jellyfin server
  must be reachable over HTTPS (or everything on `localhost` during development).
- Jellyfin sends permissive CORS headers by default, which is required to use the
  video as a WebGL texture.

## Development

Requires Node ≥ 20.

```sh
npm install
npm run dev        # http://localhost:5173
npm run dev:https  # self-signed HTTPS, to open from the headset over the LAN
npm run build      # production build in dist/
```

### Testing on the Quest 3

WebXR (and the PWA service worker) only work in a **secure context**: a page
served over HTTPS, or from `localhost`. A page opened over plain HTTP on a LAN
address (`http://192.168.x.x`) can't enter VR, so the dev server must use HTTPS:

```sh
npm run dev:https       # dev server, live reload
npm run build && npm run preview:https   # or: test the production build (PWA included)
```

Then open `https://<your-pc-ip>:5173` (dev) or `:4173` (preview) in the Quest
Browser and accept the self-signed certificate warning. The Quest must be on the
same network as your PC. Any static HTTPS server pointed at `dist/` works too.

Optional alternative without certificates: with the headset connected over USB
(developer mode), `adb reverse tcp:5173 tcp:5173` lets the Quest open
`http://localhost:5173`, which counts as secure.

On desktop, Meta's *Immersive Web Emulator* browser extension can emulate a Quest.

## Project layout

```
index.html            Single page: 2D lobby overlay + A-Frame scene
src/
  main.js             Entry point, wires lobby, scene and app state
  jellyfin/           API client, auth (Quick Connect), playback, reporting, remote
  player/             Video source (direct / HLS), screen component
  ui/                 In-VR UI components (panels, buttons, poster grid, seek bar)
  environments/       Environment registry + environments (theater, …)
  lobby/              2D (non-VR) lobby: server, login, enter VR
public/               Static assets (icons…)
```

## Roadmap

- [x] **0. Docs**: this README and `CLAUDE.md`.
- [x] **1. Scaffold**: Vite + A-Frame + PWA, HTTPS / adb dev workflow, empty
      scene running on the Quest.
- [x] **2. Auth & lobby**: server URL, Quick Connect + password login, session
      persisted in `localStorage`, usable without a headset.
- [ ] **3. Theatre & player**: theatre environment, PlaybackInfo with runtime
      device profile → direct play / HLS → video texture, controls (play/pause,
      seek, ±10 s on thumbstick, volume, audio track), text subtitles rendered in
      the scene.
- [ ] **4. Library sync**: Continue Watching / Next Up shelves, library browsing,
      resume, progress reporting, mark played, auto-play next episode.
- [ ] **5. Cast target**: control JellyTheatre from the official Jellyfin apps.
- [ ] **6. Polish**: WebXR media layers (sharper video), screen-reactive ambient
      light, seat selection & recentre, client-side PGS subtitles, more
      environments including passthrough mode.

## License

See [LICENSE](LICENSE).
