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
| Tracker ("Record Chug") | Plain JS, MediaPipe 0.10.14 from CDN (Pose full on laptops / lite on phones + Gesture recognizer) | `index.html`, `src/live/app.js`, `src/live/style.css` | Anthony | Full-screen camera starts on page open; GET SENDY! starts the recording; sound+mouth+drinking start → 🤙 end; `CONFIG` holds every threshold; debug panel/overlay dev-server only |
| Shared maths | TypeScript, pure functions | `src/detect/` (`angles`, `cracks`, `rules`, `signals`) | Anthony | Crack + click detectors; `rules.ts` = clip-scoring mirror of the live rules, and `confirmedStart`/`drankAfter`/`refineEnd` are shared with the tracker |
| Audio | Web Audio API: AnalyserNodes + 3 kHz and 6 kHz high-passes | `src/audio/`, tracker's `checkCrack`/`checkClick` | Anthony | Loudness + brightness every 20 ms; "click" = loudest ~6 ms above 6 kHz |
| Results / Feed / Leaderboard / Profiles | React + TS | `results.html`, `feed.html`, `leaderboard.html`, `src/feed/` | Lana | `share.ts` receives the `run:finished` event from the tracker |
| Data | Supabase: Postgres (posts, comments, ratings, profiles) + storage (clips, avatars) | `supabase/schema.sql`, `src/feed/store.ts` | Lana | Keys in `app/.env.local`; browser-only fallback without keys |
| Detection lab | React + TS, MediaPipe 1.2.3 (npm) | `lab.html`, `src/lab/` | Anthony | Labelling, signal graphs, accuracy scoreboard; dev only |
| Test clips | 18 MP4s + `labels.csv` + cached signals | `Chug_Examples/` | Anthony | Gitignored, served by the dev server only |
| Hosting | Cloudflare Pages (free), deployed by a GitHub Action on every push to `main`, any author | `.github/workflows/deploy.yml` | Lana | https://getsendy.pages.dev · repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` · data stays in Supabase · lab won't work there (no clips) — fine |

## Data flow
Record page opens → camera + mic + models start → GET SENDY! starts the clip recording →
pose (wrists, mouth, head tilt, forearm) + hand crops (🤙) + crack/click detectors →
start: a crack/click with the can at the mouth (real person in frame), then head back + arm up
within 2.5 s → clock = the sound →
end: 🤙 confirms, time = when the head came forward near the can leaving the mouth; clip records
1 s more → `run:finished` {time, clip} → results page → name + description → post →
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
- 2026-11-21 — Click detector (~6 ms, 6 kHz) added: the 46 ms crack detector missed cracks in noisy clips; the crack was the strongest click in 7/8 single clips.
- 2026-11-21 — End time from the head coming forward (closest signal to the labelled ends); 🤙 freezes the on-screen timer at once.
- 2026-11-21 — Start needs a sound AND the drinking motion AND a real person — holding the can at the mouth, or a phantom pose on a foot, started runs.
- 2026-11-21 — Record = Instagram-style full-screen camera that starts on page open, no on-screen text, no tracking visuals for users (debug only on `npm run dev`). Phones use the camera's default picture size (iPhone ignored a portrait request → 70% crop).
- 2026-11-21 — Only Lana merges into `main` (Vercel Hobby only deploys her commits). Results page kept after every run (it's where runs are posted).
