# JellyTheatre: technical notes

How JellyTheatre works and how to work on it. For what it does and how to use
it, see the [README](../README.md).

Published on the
[Meta Horizon Store](https://www.meta.com/experiences/jellytheatre/4688003738150435)
and at [jellytheatre.vpelloin.eu](https://jellytheatre.vpelloin.eu/).

## Goals

- **Environments**: the video plays inside a 3D room.
- **Library sync**: Jellyfin is the source of truth for watch state (resume
  points, Continue watching, Next up; progress always reported).
- **Subtitles**: text and PGS drawn in the scene, never burned in.
- **Avoid transcoding**: the server is weak. Direct play, then remux or
  audio-only transcode, a video transcode only as a last resort.

## Stack

Vanilla JS ES modules, Vite and vite-plugin-pwa, A-Frame (three.js),
`@jellyfin/sdk`, hls.js (only for HLS), troika-three-text, libpgs. In VR on the
Quest the video and the menus are WebXR compositor layers (`src/xr/`), drawn
at full resolution by the headset.

The Jellyfin web UI can't be embedded: an immersive session only shows WebGL,
and a cross-origin page can't be drawn into a texture. So JellyTheatre calls
the REST API and draws its own UI; everything happens in the headset (it is not
a remote-control target).

| Need | Endpoint |
|---|---|
| Sign-in | Quick Connect (`/QuickConnect/Initiate`, poll `/QuickConnect/Connect`, `/Users/AuthenticateWithQuickConnect`); password as fallback |
| Currently watching | `/UserItems/Resume`, `/Shows/NextUp` |
| Browse | `/UserViews`, `/Items` |
| Stream selection | `POST /Items/{id}/PlaybackInfo` with a device profile |
| Progress | `/Sessions/Playing`, `/Playing/Progress` (≈ 10 s, on pause and seek), `/Playing/Stopped` |
| Subtitles | `DeliveryUrl` of `External` subtitle streams (WebVTT) |

### Playback

The device profile is built at runtime from `MediaSource.isTypeSupported` /
`canPlayType`, so it never over- or under-claims (the Quest decodes H.264,
HEVC, VP9 and AV1 in hardware). In order: direct play (the file as-is), remux
to HLS (video copied, e.g. from MKV; audio copied or cheaply transcoded), full
transcode only for an unsupported video codec. Text subtitles use `External`
delivery (converted to WebVTT, cheap) and PGS is fetched as-is (libpgs):
neither forces a transcode. VobSub and DVB would need burn-in, so they are not
offered.

### Sound

The video element's audio goes through Web Audio (`Player.ensureAudioGraph`,
created at Play so the click counts as a gesture): a volume gain (the Quest
Browser ignores `video.volume`), then `SpatialAudio`. Each channel keeps its
own signal and plays from a virtual speaker: left, centre and right on the
screen (its edges and centre), surrounds at ±110° (5.1) or sides ±90° and
backs ±150° (7.1), relative to the line from the head to the screen. The LFE
goes to both ears at -6 dB, and a -3 dB trim keeps dialogue at the level of
the plain downmix. The head pose is applied every frame.

Not the browser's HRTF panner: tested on the Quest, it made the whole film
dull. A spherical head model instead: the ear facing a speaker gets the
signal untouched, the other ear a delay (Woodworth, up to 0.66 ms) and a
treble cut (high shelf at 1.8 kHz, up to -12 dB). The centre channel reaches
both ears unfiltered.

Dialogue clarity, measured offline against the downmix (pink noise, ear
spectra per octave): with the full delay on the front speakers, what left and
right share (dialogue in a stereo film, music) cancelled itself by -9 dB around
2 kHz in each ear, and the surrounds were 3 dB louder than in the downmix. So
the delay fades in only for sounds more than about 25° off the nose (fully from
50°), and the surrounds play at -3 dB like in the ITU downmix: now within
+3 / -3 dB of the downmix everywhere, with no notch.

The controls show what the sound actually carries
(`5.1 sound`), measured per channel: a browser may downmix before Web Audio.
Off, the browser downmixes to stereo.

### HTTPS

WebXR and service workers need a secure context, and an HTTPS page can't reach
an HTTP server: the Jellyfin server must be on HTTPS (or `localhost` in
development). Jellyfin's default CORS headers allow the video in WebGL.

## Development

Node ≥ 20. `npm install`, then `npm run dev` (http://localhost:5173) or
`npm run dev:https` (self-signed, to open from the headset over the LAN).

On the Quest, open `https://<pc-ip>:5173` and accept the certificate: plain
HTTP on a LAN address isn't a secure context. Without certificates: USB,
developer mode, `adb reverse tcp:5173 tcp:5173`, then `http://localhost:5173`.
`npm run build && npm run preview:https` tests the production build. On
desktop, Meta's *Immersive Web Emulator* extension emulates a Quest.

## Testing and deployment

`npm run build && npm test`: a ~10 s smoke test in headless Chrome against a
fake Jellyfin server (`tools/screenshots/mock-jellyfin.mjs`, invented library,
no downloads).

Every push to `main` is built, tested and published to GitHub Pages
(`.github/workflows/pages.yml`) at `https://jellytheatre.vpelloin.eu/`, a
custom domain (CNAME to `valentinp72.github.io`, *Enforce HTTPS*). **Pushing to
`main` releases to store users at once**: the store app loads this site.

The domain must never change: the store package is bound to it by
`public/.well-known/assetlinks.json` (the workflow uploads hidden folders),
and saved logins live in its `localStorage`. Other sub-paths:
`BASE_PATH=/path/ npm run build`.

## Meta Horizon Store app

The website wrapped by Meta's Bubblewrap fork (`@meta-quest/bubblewrap-cli`):
a signed APK, package `eu.vpelloin.jellytheatre`, opening
`https://jellytheatre.vpelloin.eu/?app=horizon` in *immersive* mode.

- **Immersive, not 2D**: in a 2D app (a window) `immersive-vr` is unsupported.
  An immersive app shows a loading screen until the page starts a session
  (allowed without a click) and never shows the 2D page. So with
  `?app=horizon` (main.js `STORE_APP`) the page skips the lobby and enters VR
  by itself; signed out, the library panel shows the sign-in view
  (src/ui/sign-in-view.js).
- **The app closes when its session ends**, even if a new one is requested at
  once. It can't switch between a VR room and passthrough live: the choice
  applies at the next launch.
- **Storage belongs to the Quest Browser** (per site), not to the APK:
  uninstalling keeps the login. *Sign out* forgets it.
- `store/horizon/twa-manifest.json` is the whole configuration (the generated
  Android project is ignored). `npm run package:horizon` builds the APK; raise
  `appVersionCode` and `appVersion` before uploading one (they version the
  wrapper, not the site). Upload with `ovr-platform-util upload-quest-build
  --channel store` (Production, as a draft until submitted).
- The signing key is outside the repository (path in `twa-manifest.json`); a
  lost key means a new store app. Its fingerprint is in `assetlinks.json`.
- Listing text, reviewers' notes (Jellyfin's demo server), data use and age
  rating answers: `store/horizon/listing.md`. Art: `npm run store-assets`
  (into `store/horizon/assets/`, not committed). Privacy policy:
  `public/privacy.html`.

## Screenshots

`npm run screenshots` captures the README screenshots (`docs/screenshots/`)
and the environment picker's pictures (`public/environments/`) in headless
Chrome against the fake server, with Blender's open movies
(`tools/screenshots/open-movies.mjs`): posters, stills and a silent 40 s clip
of *Tears of Steel* with its subtitles, downloaded once from Wikimedia Commons
into the uncommitted `tools/screenshots/.cache/`. Only CC BY films, credited.
Needs Chrome or Chromium (`CHROME_PATH`) and ffmpeg.

## Project layout

```
index.html            2D lobby + A-Frame scene template
src/
  main.js             Wires lobby, scene, store app mode and app state
  jellyfin/           API client, auth, playback, reporting, library
  player/             Player (direct / HLS), screen, controller input, view
  ui/                 In-VR UI (panels, sign-in, keyboard, controls, settings)
  environments/       Environment registry, rooms and the kit (kit/)
  xr/                 WebXR compositor layers (video, menus)
  lobby/              2D lobby (browser version)
public/               Icons, environment pictures, privacy policy, asset links
store/horizon/        Store package configuration and listing
tools/                Smoke test, fake Jellyfin server, screenshots, store art
```

## History

Next features are in the [README roadmap](../README.md#roadmap).

- **Foundations**: Vite + A-Frame PWA; lobby with Quick Connect; procedural
  theatre; player with a runtime device profile (direct play / HLS remux),
  controls, text subtitles, progress reporting.
- **Library**: Continue watching, Next up, new, Movies and Shows (sort, genre,
  hide watched), favourites, search; details and series views; mark watched;
  "Up next" with auto-play; media versions.
- **Picture and comfort**: menus and video as compositor layers; 72 Hz,
  optional 1.25× resolution; volume through Web Audio. Teleport onto seats,
  snap turn, recenter (also reclined), eye height for lying down; room
  brightness and a screen light that follows the picture.
- **Environments**: a kit (textures, geometry, merged builder, instanced
  seats, lighting, decor); theatre with a projector beam, home cinema, the ISS
  Cupola in zero g, lakeside cabin with a fire, dark void, passthrough.
- **Watching**: PGS subtitles (libpgs); skip intro and credits; subtitle size,
  colour, style, position and timing; seek bar previews and chapters; episode
  cards; clock and end time on the controls.
- **Meta Horizon Store (v0.2.2 – v0.2.6)**: custom domain, Bubblewrap package
  in immersive mode, sign-in and sign-out in VR, store listing and art.
  Published on 15 October 2026.
- **v0.2.7**: `https://` prefilled and plain-HTTP servers explained; keyboard
  click sound and press colour; 12/24-hour clock setting; a gentler screen
  light in small rooms and a dimmer space station.
- **v0.2.8**: the library fills the big screen edge to edge (the idle screen
  returns to 16:9 after a film).
- **v0.3.0**: virtual surround (cinema speakers around the seat, a head model
  that keeps the treble).
- **v0.4.0, jungle hammock**: the first environment for lying down (in bed). The
  layout's `head` puts the eyes on the hammock and its `screen.tilt` leans the
  screen back above them; in VR it is always recentered reclined. Recentering
  reclined now also turns the picture upright for the eyes (whichever way the
  user lies), and the menus, under `#view`, follow the gaze. New kit:
  `nature.js` (trunks, buttress roots, ropes, instanced leaf cards, treeline,
  fireflies) and bark, leaf litter, foliage and hammock textures. The
  environment picker shows four cards a row from seven environments. Room
  brightness also dims the moon and the lantern; fireflies keep away from the
  screen. Virtual surround: no more speech notch around 2 kHz, surrounds at
  -3 dB; the film is no longer silent when it starts with Virtual surround
  off.
- **v0.4.1**: the environment picker fills the panel (four cards a row) and
  tags each place with icon chips (`ENVIRONMENT_TAGS`: indoor / outdoor /
  passthrough, sitting / lying down / floating, several seats); the current
  one is outlined. Shorter descriptions. Shortcuts to the picker: an
  Environment button in the library's header and a landscape icon on the
  controls (choosing closes the panel). Header buttons get icons beside their
  label (`ui-button` `iconPosition: left`).
