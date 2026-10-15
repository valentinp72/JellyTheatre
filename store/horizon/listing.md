# Meta Horizon Store listing

Text and answers for the app's page in the Developer Dashboard. Art and
screenshots: `npm run store-assets` (into `assets/`, not committed). Limits:
name 40 characters, short description 500, long description 1500.

## Basics

- **Name:** JellyTheatre
- **Package:** `eu.vpelloin.jellytheatre`
- **Category / genre:** Entertainment; media and video
- **Website:** https://jellytheatre.vpelloin.eu/
- **Privacy policy:** https://jellytheatre.vpelloin.eu/privacy.html
- **External support link** (optional, no email needed):
  https://github.com/valentinp72/JellyTheatre/issues
- **Price:** free
- **Play mode:** sitting (also works standing); controllers (Touch)
- **Comfort:** comfortable. Seated, no continuous movement: teleport only
  between seats, snap turns.
- **Internet:** required (streams from your Jellyfin server)
- **Languages:** English

## Short description

Watch your own Jellyfin library on a giant screen: a movie theatre, a home
cinema, a lakeside cabin, a space station or your own room in passthrough.

## Long description

JellyTheatre turns your Meta Quest into a private cinema for your Jellyfin
media server. Sign in with a Quick Connect code (no typing), pick a film and
watch it on a giant screen.

PLACES TO WATCH
- A movie theatre with dimming lights and a screen that lights up the room
- A home cinema, a lakeside cabin with a crackling fire, the Cupola of a space
  station floating above the planet, a dark void
- Your own room in passthrough, with a screen you can place anywhere

YOUR LIBRARY, IN SYNC
- Continue watching, next up, new movies and shows, favourites, search
- Seasons and episodes with thumbnails and watched marks
- Your progress and watched status go back to Jellyfin, so you can pick up on
  any other device

GENTLE ON YOUR SERVER
- Plays your files directly whenever the headset can, so your server doesn't
  have to convert them
- Shows whether a film plays directly or is being converted

MADE FOR WATCHING
- Subtitles (text and Blu-ray PGS) with size, style, position and timing
- Skip intro and credits, chapters, seek bar previews, up-next episodes

REQUIREMENTS
- A Jellyfin server reachable over HTTPS
- A Jellyfin account on that server

JellyTheatre is an independent project, not affiliated with the Jellyfin
project. It does not provide any content: it plays the media on your own
server.

Screenshots show Blender Foundation open movies (Tears of Steel, Sintel,
Caminandes and others), CC BY, © Blender Foundation, studio.blender.org.

## Notes for the reviewers

JellyTheatre needs a Jellyfin media server. Please use Jellyfin's public demo
server, which has public-domain and Creative Commons films:

1. Launch JellyTheatre: it opens in VR, on a sign-in panel.
2. Server address: type `demo.jellyfin.org/stable` with the on-screen keyboard
   (the `?123` key has `/`), then press Connect.
3. Choose "Sign in with a password". Username: `demo`, password: leave empty.
   Press Sign in.
4. Open "Movies", pick a film (for example Caminandes: Llamigos) and press
   Play. Point at the screen and press the trigger to show the playback
   controls.
5. The settings (header of the library panel) change the environment,
   subtitles and display; Settings, then Account, then Sign out returns to
   the sign-in panel.

Choosing the passthrough environment ("My room") takes effect at the next
launch of the app.

## Data use (Data Use Checkup)

- The developer collects no data: no analytics, no crash reporting, no
  advertising, no account.
- No Meta platform features are used (no user ID, profile, friends,
  entitlements or in-app purchases).
- Stored on the device only: Jellyfin server address, user name, access
  token, a random device ID, settings. Sent only to the user's own Jellyfin
  server.

## Age rating (IARC questionnaire)

- No violence, sexual content, gambling, purchases or chat in the app itself.
- The app plays media from a server the user chooses, like a video player or
  a browser: answer that users can access content not provided by the
  developer (unrestricted media from their own server).
- Intended age group for uploads: `TEENS_AND_ADULTS`.

## Assets

| Asset | Size | File |
|---|---|---|
| Hero | 3000 × 900 | `hero.png` |
| Cover landscape | 2560 × 1440 | `cover-landscape.png` |
| Cover square | 1440 × 1440 | `cover-square.png` |
| Cover portrait | 1008 × 1440 | `cover-portrait.png` |
| Mini landscape | 1080 × 360 | `mini-landscape.png` |
| Logo (transparent) | 2400 × 520 | `logo.png` |
| Icon | 512 × 512 | `icon.png` |
| Spatialized tile, background | 512 × 512 (and 180 × 180, optional) | `spatial-background-512.png`, `spatial-background-180.png` |
| Spatialized tile, foreground (transparent) | 512 × 512 (and 180 × 180, optional) | `spatial-foreground-512.png`, `spatial-foreground-180.png` |
| Screenshots (5) | 2560 × 1440 | `screenshot-1…5-*.png` |

The `background-*.png` files are only the source renders of the covers.
