# Status

Updated Sat 2026-11-21 ~01:00 · submission ~Sun 07:00 (confirm) · demo with a Celsius can.
Tomorrow's plan: [TODO.md](TODO.md).

## Demo path (the one flow that must work for judges)
1. Drinker stands ~2 m back, head + shoulders + elbows in frame, Celsius can in hand.
2. Press **GET SENDY!** → crack the can at the mouth → timer starts on its own.
3. Drink, lower the can, flash a 🤙 → timer stops (back-dated to when the can left the mouth).
4. Results page: time, replay, personal best, rank → name the run → post.
5. Feed shows it (rate ★, comment) → Leaderboard ranks it.
6. Accuracy slide: "finish within 0.4 s of frame-by-frame timing on real videos."

Backup: a recorded run of the full demo, in case the live camera fails on stage.

## Working (end-to-end tested Sat ~01:00)
- Water-bottle run on Anthony's laptop: tracker → results → posted (5.54 s) → in Supabase with
  its clip → shared feed → leaderboard. Lana's profile is on the same database.
- **Tracker:** HD webcam, full pose model, zoomed wrist crops (works ~2–3 m back), hand skeleton
  overlay, debug panel (person size, crack score, finger readings).
- **Start:** crack with the can already at the mouth for ≥ 0.15 s (no more cracks just before it
  gets there); fallback = can at mouth + hand raised for 0.8 s, back-dated — and if a quieter crack
  (score ≥ 2, can at the mouth ≥ 0.15 s) was heard in the 1.5 s before that, the clock starts at it.
  Cracks with the can elsewhere are ignored.
- **End:** 🤙 shaka anywhere in frame (3D finger bends; works back-of-hand too), no hold — one frame ends it; refused
  while the can is still at the mouth; time = when the head came forward (head tilt drop) near the
  last moment the can was at the mouth, else that moment. Wrist hidden right after being at the
  mouth (arm covering the face) counts as still drinking for 0.5 s.
- **Crack detector:** sudden bright jump vs the previous 0.5 s. Real Monster crack at ~2 m on the
  laptop mic scored in the thousands (threshold 4); 0 false cracks in a noisy no-crack recording.
- **Accuracy (lab, 18 labelled clips, Sat after head-tilt end):** single-person — start avg error
  0.57 s (was 0.64), end 0.18 s (was 0.40; 6/8 within ±0.25 s), run time 0.66 s (was 0.73).
  Groups — start 0.21 s (was 0.65), end 1.13 s (was 1.22). All clips: 17/18 found.
  (0.15 s at-mouth rule for cracks: single-person unchanged; group clip 01 lost its quiet crack.)
  What's left on single-person clips is the no-crack start (03 +1.9 s; 10 +1.4 s has missing frames
  near its start — re-analyse it in the lab). Head tilt was the signal closest to the labelled ends
  (median 0.13 s); no video signal times the tab pop — only the crack does.
- **Feed side (Lana):** results page (PB, rank, retake, name + description), shared feed with
  clips, ★ ratings (final once given), comments, profiles (username + photo), leaderboard (★3.5+
  first, then fastest), only the poster can delete their post.
- **Docs:** README, Devpost draft (`docs/DEVPOST.md`), this file, architecture, CLAUDE.md.

## Not yet verified
- A **real can** cracked live in the tracker (the bottle-crush test started from the fallback).
- The app on **Lana's laptop** end to end, and each of you seeing the other's posts.
- Anything deployed / on a phone / over HTTPS.

## Known issues / limits
- Groups: the tracker follows the most prominent person, not necessarily the drinker (multi-person
  clips: end error 1.2 s). Audio can't tell two people apart.
- ~Half the phone clips have an inaudible crack → those start from the fallback (a bit late).
- Live rules (`src/live/app.js`) and the lab's mirror (`src/detect/rules.ts`) are separate copies —
  keep thresholds in sync by hand.
- Profiles have no passwords; a profile belongs to the browser that made it.
- `Chug_Examples/` (clips, labels, analysis) exists only on Anthony's laptop — not backed up.
- Lana's branch `fix-local-profile-upload` (upload profiles made before Supabase) is not merged yet.

## Cut list (drop from the bottom if time runs out)
- Verified badge + sanity checks (left frame, impossible times)
- Follow the person whose hand is at the mouth (groups)
- School vs school leaderboard
- Two-person race mode (split frame)
- Spillage detection, other games
