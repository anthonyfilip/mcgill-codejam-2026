# CLAUDE.md — McGill CodeJam 2026

<!--
Built from human-written guidance, not generated from scratch:
- Anthropic, "Claude Code: Best practices for agentic coding" — keep this file short,
  list real commands, say what NOT to do, iterate on it like a prompt.
- Boris Cherny (Claude Code team) — the team CLAUDE.md is checked into git and every
  time Claude makes a mistake, a one-line rule is added so it doesn't happen again.
- Andrej Karpathy's observations on LLM coding pitfalls (as distilled in the popular
  "karpathy-guidelines" CLAUDE.md): state assumptions, simplicity first, surgical
  changes, define verifiable success criteria.
- Kent Beck, "Augmented Coding" / Tidy First — small steps, keep tests green,
  never separate structural and behavioural changes in the same commit.
Rule of thumb: if a line here wouldn't change Claude's behaviour, delete it.
-->

## Project
- **What:** A web app that uses the camera + microphone to automatically time someone
  shotgunning a can, then posts the run (with replay) to a shared feed and leaderboard.
- **Direction (from Sat 2026-11-21):** mobile-first **PWA** (installable web app), not native —
  keeps the tuned in-browser detection. Design for phones first: portrait, one hand, ≥44 px
  targets, safe-area insets, front/back camera. Must stay fast on a mid-range phone (≥15 fps).
- **Track / sponsor prize:** Celsius (sponsor) — live demo uses a Celsius can. TODO: confirm prize/track name.
- **Hackathon:** McGill CodeJam 2026, 36 h. Started Fri 2026-11-20 19:00; submission ~Sun 2026-11-22 07:00
  (TODO: confirm exact time + Devpost link). Demo > completeness.
- **Team / ownership:** Anthony — `app/src/live/` (tracker), `app/src/lab/`, `app/src/detect/`,
  `app/src/audio/`. Lana — `app/src/feed/` (results, feed, profiles, ratings, leaderboard),
  `supabase/`. Ask before editing the other person's area.
- More context: [docs/architecture.md](docs/architecture.md) · progress: [docs/STATUS.md](docs/STATUS.md) ·
  plan: [docs/TODO.md](docs/TODO.md)

## Stack & commands
Multi-page Vite app in `app/`. Detection runs in the browser (MediaPipe + Web Audio API);
Supabase stores posts, clips, profiles, comments and ratings.
- **Record Chug (tracker)** — `app/index.html` + `app/src/live/app.js` (plain JS). GET SENDY! →
  start once a crack/click is heard with the can at the mouth AND the head tips back + arm comes up
  (no sound = no start; clock = the sound) →
  🤙 shaka confirms the end; time stops when the can last left the mouth. All thresholds are in
  `CONFIG` at the top of `app.js`, each with a note on where its value came from.
- **Results / Feed / Leaderboard** — `results.html`, `feed.html`, `leaderboard.html` +
  `app/src/feed/` (React + TS). The tracker hands a finished run over via a `run:finished` window
  event (`src/feed/share.ts`). Without Supabase keys everything saves to the browser only.
- **Detection lab** — `app/lab.html` + `app/src/lab/`. Label clips, graph signals, and score the
  start/end rules (`src/detect/rules.ts`, a pure mirror of the live rules) against `labels.csv`.
- **Supabase** — keys in `app/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`;
  gitignored). Schema in `supabase/schema.sql` — change it there and re-run it in the Supabase SQL editor.
All commands run from `app/`:
- Install: `npm install`
- Dev server: `npm run dev` → http://localhost:5173 (tracker), `/feed.html`, `/leaderboard.html`, `/lab.html`
- Build / type-check: `npm run build` · Lint: `npm run lint` · Tracker syntax: `node --check src/live/app.js`
- Deploy: automatic — every push to `main` runs `.github/workflows/deploy.yml` (Vercel CLI, repo
  secret `VERCEL_TOKEN`; Supabase env vars live in the Vercel project) → https://shotgun-tracker-xi.vercel.app.
  So merging a PR ships it live; manual redeploy: Actions → Deploy to Vercel → Run workflow.

## Git workflow
Work on a branch, never directly on `main`: `git switch main; git pull; git switch -c <task>` →
commit small → push → open a PR (`gh pr create --body-file <file>`) → the other person merges →
both `git switch main; git pull`. Merge small and often.

## Test data
- `Chug_Examples/` — 18 real shotgun clips (`shotgun_01.mp4` … `shotgun_18.mp4`). Gitignored:
  real people, never commit or upload them anywhere.
- `Chug_Examples/labels.csv` — ground truth per clip: `start_s` (tab pop), `end_s` (can leaves
  the mouth for good), `people_in_frame`, `notes`. Edit via the lab's Set start / Set end buttons.
- `Chug_Examples/signals/` — cached lab analysis (`<clip>.json` vision, `<clip>.audio.json` sound
  profile, `live_monster_*.audio.json` laptop-mic recordings). Re-score in the lab is instant.
- Everything in `Chug_Examples/` exists only on Anthony's laptop — not in git, not backed up.
- Current accuracy (single-person clips, analysis re-run Sat ~14:00): start found in 8/8, start
  0.15 s avg error; run time 0.15 s on 7 clips (clip 18's end is 1.2 s late). See docs/STATUS.md.

## How to work
1. **Think before coding.** State assumptions out loud. If a request is ambiguous,
   ask one question instead of guessing. If there's a simpler approach, say so.
2. **Simplest thing that demos.** No speculative abstractions, config options, or
   "future-proofing". It's a 24-hour hackathon — hardcode it, then move on.
3. **Surgical changes.** Touch only what the task needs. Don't reformat, rename,
   or "improve" unrelated code. Match the existing style.
4. **Define done before starting.** Turn each task into a check you can run
   (a test, a curl, a page that loads). Loop until it passes, then stop.
5. **Small commits.** Commit after every working step with a clear message so we
   can always `git revert` back to a demoable state.
6. **Plan first for big moves.** Anything touching more than ~3 files or the data
   model: write a short plan and wait for approval.

## Rules
- Never commit secrets. Real keys live in `.env` (gitignored); add new variable
  *names* to `.env.example` whenever you introduce one.
- Read the real API docs/OpenAPI spec (use the context7 MCP or the URL) before
  calling an external API — don't guess endpoints or params.
- Don't add a dependency without saying why; prefer what's already installed.
- If a fix fails twice, stop and explain what you've learned instead of thrashing.
- Update [docs/STATUS.md](docs/STATUS.md) when a feature lands or a plan changes.
- Any change to start/stop detection must be checked against the labelled clips in
  `Chug_Examples/labels.csv` before calling it done — report how far off the timer was.
- A threshold change in `src/live/app.js` CONFIG must be made in `src/detect/rules.ts` RULES too
  (and vice versa), or the lab's scores stop describing the live app.
- Camera/mic data stays in the browser. The only upload is the replay clip, when the user posts.
- Never put real clips, labels or `.env.local` in git or in a PR.

## Gotchas (append a line every time Claude gets something wrong)
- Windows dev machine: shell is PowerShell — use `;` not `&&`, and `$env:VAR` for env vars.
- `npm` commands must run inside `app/`, not the repo root (there's no package.json at the root).
- Once a `<video>` feeds an AudioContext it's silent unless also connected to `ctx.destination`.
- The live tracker and the lab use different MediaPipe versions (CDN 0.10.14 vs npm 1.2.3) — keep in mind when comparing results.
- Chrome starts AudioContexts suspended: a `<video>` routed into one shows "playing" but never advances. Call `ctx.resume()` on play/click.
- MediaPipe VIDEO mode needs strictly increasing timestamps — use its own clock, not `video.currentTime` (which goes backwards on seek).
- Chrome allows ~6 connections per site: serve video in ≤1 MB ranges and destroy streams on close, or later clips never load.
- Hidden tabs get no video frames (`requestVideoFrameCallback` stops) — batch analysis must keep the tab visible.
- Supabase embeds: `posts` ↔ `profiles` has several paths (direct, via comments, via ratings) — always hint the FK, e.g. `profiles!profile_id(...)`.
- `gh pr create --body "..."` breaks on quotes in PowerShell — write the body to a file and use `--body-file`.
- Vite only reads env files inside `app/` (`app/.env.local`), not the repo root.
- Same for `git commit -m @'...'@` in PowerShell 5.1: a `"` in the message splits it into pathspecs — use `git commit -F <file>`.
- While the lab's "Analyse all clips" runs, don't save ANY file under `app/src` — the dev server reloads every open page (the lab too) and the run stops. Edit only after it finishes.
- A fresh lab analysis of the same clip reads slightly differently each run — check rule changes on more than one analysis before trusting small wins.
