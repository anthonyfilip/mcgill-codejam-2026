# Architecture

Keep this to one screen. Claude reads it on demand via the link in CLAUDE.md.

## Overview
A browser app (Vite + React + TypeScript in `app/`). Detection runs entirely client-side:
MediaPipe tracks the body, hands and face from the camera, and the Web Audio API measures
sound from the mic. A small rule engine turns those signals into "started" / "finished"
events. Finished runs are saved to Supabase for the leaderboard.

## Components
| Piece | Tech | Lives in | Notes |
|-------|------|----------|-------|
| UI | React + TypeScript (Vite) | `app/src/` | Screens: lab (dev), live run, results, leaderboard |
| Vision | MediaPipe Tasks Vision — Pose, Hand, Face landmarkers | `app/src/vision/` | Runs in the browser (WASM/GPU), models loaded from CDN |
| Audio | Web Audio API (`AnalyserNode`) | `app/src/audio/` | Loudness per frame; tab-pop = sharp spike |
| Detection rules | Plain TS functions over per-frame signals | `app/src/detect/` | Pure functions → easy to test on clips |
| Leaderboard | Supabase (Postgres + JS client) | `app/src/data/` | Keys in `.env` as `VITE_SUPABASE_*` |
| Test clips | 18 MP4s + `labels.csv` | `Chug_Examples/` | Gitignored; served to the dev lab page only |
| Hosting | Vercel | — | TODO |

## Data flow
Camera + mic (or a test clip) → per frame: MediaPipe landmarks + audio loudness →
signals (wrist-to-mouth distance, head tilt, loudness) → rule engine →
start/stop events → timer → results screen → save to Supabase → leaderboard.

## Decisions
- 2026-11-20 — Browser-only detection (no backend) — judges open a URL; video never leaves the device.
- 2026-11-20 — Landmarks + audio instead of detecting the can as an object — can shape (slim Celsius vs beer can) barely matters.
- 2026-11-20 — Build the detection lab on recorded clips before live camera — riskiest part first, repeatable testing.
