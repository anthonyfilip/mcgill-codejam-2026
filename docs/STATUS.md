# Status

Updated Sat 2026-11-21 ~01:00 · submission ~Sun 07:00 (confirm) · demo with a Celsius can.
Tomorrow's plan: [TODO.md](TODO.md).

## Demo path (the one flow that must work for judges)
1. Drinker stands ~2 m back, head + shoulders + elbows in frame, Celsius can in hand.
2. Press **GET SENDY!** → crack the can at the mouth → timer starts on its own.
3. Drink, lower the can, flash a 🤙 → timer stops (back-dated to when the can left the mouth).
4. Results page: time, replay, personal best, rank → name the run → post.
5. Feed shows it (rate ★, comment) → Leaderboard ranks it.
6. Accuracy slide: "chug time within 0.16 s on average of frame-by-frame timing on real videos"
   (8 single-person phone clips; 7/8 within a quarter second).

Backup: a recorded run of the full demo, in case the live camera fails on stage.

## Working (end-to-end tested Sat ~01:00)
- Water-bottle run on Anthony's laptop: tracker → results → posted (5.54 s) → in Supabase with
  its clip → shared feed → leaderboard. Lana's profile is on the same database.
- **Tracker:** HD webcam, full pose model, zoomed wrist crops (works ~2–3 m back), hand skeleton
  overlay, debug panel (person size, crack score, finger readings).
- **Tracker on phones (Sat, built — no real phone run yet):** 🔄 front/back camera flip (only the
  front camera is mirrored); the camera view takes the camera's shape (portrait on an upright
  phone, ≤ 70% of the screen); `lite` pose model + hand model only during a run (every 4th frame
  while armed) on touch devices, fps in the debug panel; audio started inside the GET SENDY! tap
  (iPhone); screen kept awake while armed/running; vibration on start/finish (Android); records
  mp4 when supported so clips play on iPhones. Laptops behave as before.
- **🔦 Light for night chugs (Sat, built — not tried on a phone):** a button next to 🔄; when on,
  from GET SENDY! until the run ends: back camera → the phone's flashlight where the browser can
  switch it (camera `torch` capability: Android Chrome; iPhones usually can't — then a "turn the
  room lights on" hint); front camera → the page around the camera view turns white like a ring
  light (turn screen brightness up by hand). Remembered per device.
- **Start needs ALL of** (Sat — live test started runs just from holding the can at the mouth):
  1. the can at the mouth for ≥ 0.15 s, then 2. a sound — a loud crack or a **click** (loudest
  ~6 ms above 6 kHz, ≥ 15 dB over the previous 0.5 s), then 3. within 1.5 s the drinking motion,
  lasting 0.3 s: head tilts back ≥ 0.15 shoulder widths AND forearm swings ≥ 25° toward vertical
  (or is already within 45°), can still at the mouth. Clock = the strongest of those sounds (loud
  crack beats any click). **No sound → no start** (the old video-only fallback is gone).
  **And a real person in the shot** (Sat — a phone pointed at a foot made a phantom pose that
  started a run): face + shoulder confidence ≥ 0.5 and shoulders ≥ 4% of the frame height, at the
  sound (within 0.5 s, like the hidden-face allowance) and on every frame the motion is judged on.
  Around real starts single clips were ≥ 0.67 / ≥ 6.7%; the check changes no clip's score.
  The 46 ms crack detector misses cracks in noisy clips; at 6 ms the crack was the strongest
  click in 7/8 single clips. Cracks with the can elsewhere are ignored.
- **End:** 🤙 shaka anywhere in frame (3D finger bends; works back-of-hand too), no hold — one frame ends it; refused
  while the can is still at the mouth; time = when the head came forward (head tilt drop) near the
  last moment the can was at the mouth, else that moment. Wrist hidden right after being at the
  mouth (arm covering the face) counts as still drinking for 0.5 s.
- **Crack detector:** sudden bright jump vs the previous 0.5 s. Real Monster crack at ~2 m on the
  laptop mic scored in the thousands (threshold 4); 0 false cracks in a noisy no-crack recording.
- **Accuracy (lab, 18 labelled clips, Sat — head-tilt end + click start):** single-person — start
  avg error 0.15 s (was 0.64), end 0.14 s (was 0.40), **run time 0.16 s (was 0.73; 7/8 within
  ±0.25 s, worst 0.26 s; runs read ~0.1 s short on average)** — unchanged by the stricter start,
  and no false starts on single clips. Groups — start 0.95 s, 2/10 never start (05, 11): the
  tracker watches the wrong person's head/arm. 16/18 found.
  **Re-analysed all 18 clips (Sat ~14:00, to record face confidence):** a fresh run of the model
  reads some clips differently, and the start rule now **misses 2/8 single clips** — 03 (the can
  hides the face for ~1 s around the crack, so the pose is lost) and 18 (the head barely tips back
  within 1.5 s). The 6 that start: start 0.18 s, end 0.12 s, run time 0.16 s. Loosening the motion
  thresholds brings back 10–16 s early starts, so the drinking-motion rule needs a sturdier design
  (e.g. a longer hidden-face allowance for the crack). Old analysis backed up in the session scratchpad.
  Clips 10 and 04 were re-analysed (old saves had a 3 s gap at the crack / stopped before the end):
  run time −1.57 → +0.06 s and −0.52 → −0.19 s. Clip 10's crack lands exactly where the can starts
  tilting from upright.
  Head tilt was the signal closest to the labelled ends (median 0.13 s); no video signal times
  the tab pop — only the crack does. Sound profiles were re-saved with the new `click` field.
- **Feed side (Lana):** results page (PB, rank, retake, name + description), shared feed with
  clips, ★ ratings (final once given), comments, profiles (username + photo), leaderboard (★3.5+
  first, then fastest), only the poster can delete their post.
- **Docs:** README, Devpost draft (`docs/DEVPOST.md`), this file, architecture, CLAUDE.md.

## Not yet verified
- A **real can** cracked live in the tracker (the bottle-crush test started from the fallback).
- The app on **Lana's laptop** end to end, and each of you seeing the other's posts.
- On a phone. (Deployed Sat ~12:45: https://shotgun-tracker-xi.vercel.app, auto-deploys from
  `main`; the tracker loads there over HTTPS with the new start rule — no live run tried yet.)
- The stricter start rule (sound + can at mouth + head back + arm up) with a real camera and mic.

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
