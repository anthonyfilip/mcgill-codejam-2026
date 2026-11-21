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
- **What:** A web app that uses the camera + microphone to automatically time and
  verify someone shotgunning a can, with leaderboards (individual and school vs school).
- **Track / sponsor prize:** Celsius (sponsor) — live demo uses a Celsius can. TODO: confirm prize/track name.
- **Hackathon:** McGill CodeJam 2026, 36 h. Started Fri 2026-11-20 19:00; submission ~Sun 2026-11-22 07:00
  (TODO: confirm exact time + Devpost link). Demo > completeness.
- More context: [docs/architecture.md](docs/architecture.md) · progress: [docs/STATUS.md](docs/STATUS.md)

## Stack & commands
Vite app in `app/` with two pages. MediaPipe Tasks Vision and the Web Audio API run in
the browser — no backend for detection. Supabase for the leaderboard (later).
- **Live tracker** — `app/index.html` + `app/src/live/` (plain JS, Lana's). The product:
  Arm → auto-start on 2 of 3 signals (crack / arm angle / wrist at mouth) → 🤘 above head to end.
  All thresholds are in `CONFIG` at the top of `src/live/app.js`.
- **Detection lab** — `app/lab.html` + `app/src/lab/` (React + TypeScript). Dev tool: label
  clips, graph signals against `labels.csv`.
All commands run from `app/`:
- Install: `npm install`
- Dev server: `npm run dev` → live tracker at http://localhost:5173, lab at http://localhost:5173/lab.html
- Build / type-check: `npm run build`
- Lint: `npm run lint`
- Deploy: TODO (Vercel, from GitHub)

## Test data
- `Chug_Examples/` — 18 real shotgun clips (`shotgun_01.mp4` … `shotgun_18.mp4`). Gitignored:
  real people, never commit or upload them anywhere.
- `Chug_Examples/labels.csv` — ground truth per clip: `start_s`, `end_s`, `people_in_frame`,
  `contestant`, `camera_angle`, `lighting`, `outcome`, `notes`.
- Shotgunning = can held ~horizontal at the mouth, tab pop starts the pour. The start signal
  is the tab pop + hand at the can top, not a tilt-up like a normal chug.

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
- Camera/mic data stays in the browser. Never upload video or audio unless a feature explicitly needs it.

## Gotchas (append a line every time Claude gets something wrong)
- Windows dev machine: shell is PowerShell — use `;` not `&&`, and `$env:VAR` for env vars.
- `npm` commands must run inside `app/`, not the repo root (there's no package.json at the root).
- Once a `<video>` feeds an AudioContext it's silent unless also connected to `ctx.destination`.
- The live tracker and the lab use different MediaPipe versions (CDN 0.10.14 vs npm 1.2.3) — keep in mind when comparing results.
