# Status

Hackathon started Fri 19:00 · submission ~Sun 07:00 (confirm) · demo with a Celsius can.

## Demo path (the one flow that must work for judges)
1. Drinker steps in front of the camera holding a Celsius can; the app shows "Ready" once it sees them.
2. Tab pops → timer starts on its own.
3. Can is empty / lowered → timer stops on its own.
4. Results screen: time, form score, short replay.
5. Name goes onto the leaderboard (individual + school vs school tabs).
6. Show accuracy: "within X s of the hand-labelled time on 18 real clips."

Backup: a recorded run of the full demo, in case the live camera fails on stage.

## Plan by phase
- [ ] **Hours 3–10 — Detection lab (riskiest part first):** page that plays a clip from
      `Chug_Examples`, draws MediaPipe pose/hands/face, and graphs wrist-to-mouth distance,
      head tilt and audio loudness against the labelled start/end.
- [ ] **Hours 10–16 — Start/stop rules:** turn those signals into automatic start/stop;
      score every clip against `labels.csv`.
- [ ] **Hours 16–20 — Live mode:** same detection on the webcam + mic.
- [ ] **Hours 20–26 — Results + leaderboard:** results screen, Supabase table, school tab.
- [ ] **Hours 26–31 — Polish:** Celsius branding, replay clip, form score.
- [ ] **Hours 31–36 — Ship:** deploy, backup video, Devpost writeup, rehearse pitch.

## Done
- Repo, CLAUDE.md, MCP servers (playwright, context7), `/demo-check` skill.
- 18 example clips collected and renamed; `labels.csv` created.

- Detection lab (`app/src/lab/`): pick a clip, Analyse → pose + hands overlay, six signal
  graphs vs labelled start/end, "Download signals CSV". Runs ~8 frames/s with both models.

- Live tracker (Lana): webcam + mic, auto-start on 2 of 3 signals (crack / arm angle /
  wrist at mouth), 🤘 to end, results with time + angles + replay clip. Main page of the app.
  Not yet tested against the labelled clips.

## In progress
- Filling in start/end times in `Chug_Examples/labels.csv` (team) — needed before tuning.
- Next: run every clip through the lab, look at what the signals do at the labelled
  start/end, then write the start/stop rules in `app/src/detect/`.

## Next / cut list (drop from the bottom if time runs out)
- Form score
- Replay clip on the results screen
- School vs school tab
- Two-person race mode (split frame)
- Comments / ratings / reviews
- Spillage detection
- Other games (boat races, beer die)

## Known issues
- Audio can't tell two people apart; with several people in frame the camera decides who's timed.
