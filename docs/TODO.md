# TODO — Saturday → submission (~Sun 07:00, confirm)

Tick items off here as they land (a PR can include the tick). Owners: **A** = Anthony, **L** = Lana.
Order matters: the top section is what the demo can't work without.

## 0. First thing (15 min, both)
- [ ] **Both:** `git switch main; git pull`, then `cd app; npm install`. Restart `npm run dev`.
- [ ] **L:** open a PR for `fix-local-profile-upload` (or fold it into your next branch) → merge.
- [ ] **Both:** confirm the exact submission time + Devpost link, and the Celsius prize/track name.
      Put them in CLAUDE.md "Project".

## 1. Must work for the demo
- [ ] **A — Real-can live run (30 min).** Buy cans (Celsius for the demo; a few extras to test).
      GET SENDY! → crack at the mouth → check the debug panel's crack score jumps past 4 and the
      run says "can at mouth + crack". Repeat from where the demo will happen. If it misses, lower
      `crackScore` a little in **both** `src/live/app.js` CONFIG and `src/detect/rules.ts`, then
      Re-score in the lab to check nothing else got worse.
- [ ] **L — Two-laptop test (20 min).** Do a run on Lana's laptop, post it; check it appears on
      Anthony's feed/leaderboard and vice versa. Rate and comment on each other's runs.
- [ ] **A or L — Deploy (1 h).** Vercel from GitHub, root `app/`, build `npm run build`, output
      `dist/`. Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in Vercel's env settings.
      Then on the public URL: camera + mic permission (HTTPS), a full run, a post. Hide or ignore
      the lab link there (no clips in production). Put the URL in README "Try it".
- [ ] **Both — Demo setup (45 min).** Pick the spot: light on the drinker's face, plain
      background, ~2 m from the laptop (tape a mark on the floor), laptop mic facing them. Decide
      who drinks (one can only; it's ~200 mg caffeine). Towel + bin nearby, laptop out of splash range.
- [ ] **Both — Backup video (20 min).** Screen-record one perfect run end to end
      (GET SENDY! → crack → 🤙 → results → feed → leaderboard). Keep it on both laptops.

## 2. Submission
- [ ] **Both — Final name + tagline** (README, DEVPOST.md, page titles if easy).
- [ ] **A — Devpost** from `docs/DEVPOST.md`: paste sections, add demo video, screenshots
      (tracker mid-run with skeleton, results, feed, leaderboard, lab scoreboard), team, repo link.
- [ ] **Both — Rehearse the pitch** (2–3 times, ≤ 3 min): problem → live run → feed/leaderboard →
      accuracy slide → what's next.
- [ ] **A — Re-check accuracy numbers** in the lab if any threshold changed; update README/DEVPOST.
- [ ] **Either — Make the GitHub repo public** right before submitting (Settings → General →
      Change visibility). Check nothing private is in it first (`.env.local`, `Chug_Examples/` are
      gitignored — confirm with `git ls-files`).
- [ ] **Either — Clean test posts** out of the feed before judging (e.g. "testing the booty bandit
      chug time"), or keep one good run as an example.

## 3. Should do if time allows (in this order)
- [ ] **A — Follow the drinker in groups:** pick the person whose hand is at their mouth instead of
      the biggest person. Measure with the lab (multi-person end error is 1.2 s today).
- [ ] **A — Verified badge + sanity checks:** run unverified if the drinker leaves frame > 1 s;
      flag < 2 s; auto-reset after 30 s; show ✔ crack ✔ in frame ✔ can lowered on results.
      (Needs a small hand-off to L's results page via the `run:finished` event.)
- [ ] **A — Back up `Chug_Examples/`** (clips, labels.csv, signals/) somewhere private
      (e.g. a personal OneDrive folder). It only exists on Anthony's laptop.
- [ ] **L — Phone check:** open the deployed URL on a phone; feed and leaderboard readable.

## 4. Nice to have
- [ ] Celsius branding touch on the results page (sponsor love).
- [ ] School vs school leaderboard tab.
- [ ] One rules module shared by the tracker and the lab (no more hand-syncing thresholds).
- [ ] Two-person race mode.

## Don't forget
- Sleep a few hours. Leave the last ~3 h for video, Devpost and rehearsal — not new features.
- Small PRs, merged often. Don't both edit `src/live/app.js` or `src/feed/store.ts` at once.
