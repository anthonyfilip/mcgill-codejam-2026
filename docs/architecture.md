# Architecture

Keep this to one screen. Claude reads it on demand via the link in CLAUDE.md.

## Overview
A multi-page Vite app in `app/`. Detection runs entirely in the browser: MediaPipe tracks the
drinker's body and hands from the camera, the Web Audio API listens for the crack, and a small
rule engine decides when a run starts and ends. A finished run is handed to the React results
page and, when posted, saved to Supabase (row + replay clip) for the shared feed and leaderboard.

## Components
| Piece | Tech | Lives in | Owner | Notes |
|-------|------|----------|-------|-------|
| Tracker ("Record Chug") | Plain JS, MediaPipe 0.10.14 from CDN (Pose full + Gesture recognizer) | `index.html`, `src/live/app.js` | Anthony | GET SENDY! → crack/mouth start → 🤙 end; `CONFIG` holds every threshold |
| Shared maths | TypeScript, pure functions | `src/detect/` (`angles`, `cracks`, `rules`, `signals`) | Anthony | Crack detector + clip-scoring mirror of the live rules |
| Audio | Web Audio API, AnalyserNode + 3 kHz high-pass | `src/audio/`, tracker's `checkCrack` | Anthony | Loudness + brightness every 20 ms |
| Results / Feed / Leaderboard / Profiles | React + TS | `results.html`, `feed.html`, `leaderboard.html`, `src/feed/` | Lana | `share.ts` receives the `run:finished` event from the tracker |
| Data | Supabase: Postgres (posts, comments, ratings, profiles) + storage (clips, avatars) | `supabase/schema.sql`, `src/feed/store.ts` | Lana | Keys in `app/.env.local`; browser-only fallback without keys |
| Detection lab | React + TS, MediaPipe 1.2.3 (npm) | `lab.html`, `src/lab/` | Anthony | Labelling, signal graphs, accuracy scoreboard; dev only |
| Test clips | 18 MP4s + `labels.csv` + cached signals | `Chug_Examples/` | Anthony | Gitignored, served by the dev server only |
| Hosting | Vercel, deployed by a GitHub Action on every push to `main` | `.github/workflows/deploy.yml` | Lana | https://getsendy-app.vercel.app · repo secret `VERCEL_TOKEN` · lab won't work there (no clips) — fine |

## Data flow
Camera + mic → pose (wrists, mouth) + hand crops (🤙) + crack score →
start: crack with can at mouth (or can at mouth + hand raised 0.8 s) →
end: 🤙 confirms, time = last moment the can was at the mouth →
`run:finished` {time, clip} → results page → name + description → post →
Supabase row + clip upload → feed (ratings, comments) → leaderboard (★3.5+ first, then fastest).

## Decisions
- 2026-11-20 — Browser-only detection (no backend) — judges open a URL; camera/mic never leave the device (only the posted clip does).
- 2026-11-20 — Landmarks + audio instead of detecting the can as an object — can shape barely matters; no calibration step for users.
- 2026-11-20 — Build the detection lab on recorded clips before tuning live — repeatable, measurable.
- 2026-11-20 — End = 🤙 shaka (custom 3D finger-bend detector; MediaPipe has none), anywhere in frame; time back-dated to when the can left the mouth.
- 2026-11-20 — Start needs the can at the mouth when the crack happens — ignores other people's cans.
- 2026-11-21 — Thresholds tuned on the labelled clips: mouth 0.8 body-widths, arm angle dropped, crack = sudden bright jump vs the previous 0.5 s.
- 2026-11-21 — Feed, results and leaderboard (Lana) merged with the tracker; Supabase shared across devices; only the poster can delete a post.
- 2026-11-21 — Mobile app = PWA (installable, phone-first UI), not native: the detection already runs in the browser and is tuned; a native rewrite won't fit the time. App-store packaging (Capacitor) is a later step.
