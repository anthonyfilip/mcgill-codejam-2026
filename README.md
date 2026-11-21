# Shotgun Tracker — McGill CodeJam 2026

> Point a laptop camera at someone shotgunning a can. It hears the crack, sees the can at
> their mouth, stops the clock when the can comes down, and posts the run to a shared feed
> and leaderboard — no stopwatch, no arguing.

*(Working name — TODO: final name.)* Built in 36 hours at McGill CodeJam 2026. The live demo
uses a can of Celsius.

**Try it:** https://getsendy-app.vercel.app — open it on a phone or laptop, tap **Record
Chug**, and allow the camera and microphone.

## What it does

- **Hands-free timing.** Press **GET SENDY!**, then just drink. The timer starts on its own at the
  crack of the can and stops on its own when the can leaves your mouth.
- **🤙 to send it.** Flash a shaka when you're done to confirm the run. The final time is
  set to the moment the can came down, not when you got your hand up — your reaction time
  doesn't count against you.
- **Anti-cheat built in.** A crack only counts if the can is already at the drinker's mouth
  (someone else opening a can nearby is ignored), and a 🤙 while the can is still at your mouth
  is refused.
- **Works from across the room.** HD camera input, a full-body pose model, and zoomed-in hand
  tracking around each wrist so hands are found even when people stand a few metres back.
- **Results, feed and leaderboard.** Every run gets a results page with a replay clip, can be
  named and posted to a shared feed with a description, rated with stars and commented on. The
  leaderboard ranks runs rated ★3.5+ first, then by fastest time, with each run's name and day.
- **Profiles.** Pick a unique username and a photo; your profile shows your runs, personal best
  and cheers. No passwords yet: a profile belongs to the browser that made it.

## How accurate is it?

We collected 18 real shotgun videos and labelled the true start (tab pop) and end (can leaves
the mouth) frame by frame. The built-in **detection lab** runs the exact same rules as the live
tracker on every clip and compares them to those labels.

| 8 single-person clips | Detected | Average error | Within ±0.5 s |
|---|---|---|---|
| **Start** (crack) | 8 / 8 | **0.64 s** | 5 / 8 |
| **End** (can leaves mouth) | 8 / 8 | **0.40 s** | 6 / 8 |

Across all 18 clips (including groups of 2–3 people) a run is found in 17. Where the crack is
audible it starts the clock in all 8 such clips, every one within 0.5 s. On a live laptop-mic
recording of a real can opened ~2 m away the crack scores in the thousands against a threshold
of 4, and a noisy no-crack recording produced zero false cracks.

Honest caveats: 18 clips is a small set, about half of the phone videos have a crack too quiet
to hear (those fall back to the "can at mouth" start, which runs a little late), and clips with
several people are harder because the tracker follows the most prominent person.

## How it works

Everything runs in the browser — camera and microphone are processed on the device.

```
camera ──► MediaPipe Pose (full) ──► wrist-to-mouth distance, arm height ─┐
       └─► MediaPipe hand model on zoomed wrist crops ──► 🤙 shaka (3D finger bends)
mic ────► loudness + brightness (energy above 3 kHz) every 20 ms ──► crack score
                                                                          ▼
                       start/end rules ──► timer ──► results ──► Supabase feed + leaderboard
```

- **Crack detection** — a crack is a sudden, *bright* jump compared with the half-second just
  before it (loudness jump × share of energy above 3 kHz). Comparing with the moment before,
  instead of a slow running background, is what makes it work in loud parties.
- **Start rule** — the crack must happen with the can at the mouth (or up to 1 s before it
  gets there). If no crack is heard, the can held at the mouth with the hand raised for 0.8 s
  starts the run, back-dated to when it began.
- **End rule** — the 🤙 confirms; the time stops at the last moment the can was at the mouth.
- **Shaka detection** — MediaPipe has no shaka gesture, so we measure how much each finger
  bends using the 3D hand landmarks: thumb and pinky straight, the other three curled. Bend
  angles work whichever way the hand faces, including back-of-hand to the camera.
- **Thresholds are data-driven** — wrist-to-mouth 0.8 body-widths (real drinking measured
  0.25–0.66, otherwise 1.0–1.4), crack score 4, etc. Each value in `CONFIG` notes where it came from.

## Run it locally

Requires Node.js 20+.

```powershell
cd app
npm install
npm run dev
```

Then open:

| Page | URL |
|---|---|
| Record Chug (the tracker) | http://localhost:5173 |
| Feed | http://localhost:5173/feed.html |
| Leaderboard | http://localhost:5173/leaderboard.html |
| Detection lab (dev tool) | http://localhost:5173/lab.html |

Allow camera and microphone when asked. Stand far enough back that your head, shoulders and
elbows are in frame.

### Shared feed (optional)

Without keys, posts are saved in your own browser only. To share them, create a Supabase
project, run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor, and put the keys in
`app/.env.local` (never commit it). Team members: ask a teammate for the project's two values
privately rather than creating a new project.

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Detection lab

`lab.html` loads test clips from `Chug_Examples/` (gitignored — real people, never committed).
Label each clip's start/end with **Set start / Set end**, then **Analyse all clips & score**
to measure accuracy. Results are cached, so changing a threshold and pressing **Re-score**
takes a second.

## Project layout

```
app/
  index.html, src/live/      live tracker (camera, mic, start/end rules, shaka)
  src/detect/                shared maths: angles, crack detector, clip-scoring rules
  src/feed/                  results page, feed, ratings, comments, profiles, leaderboard
  lab.html, src/lab/         detection lab + accuracy scoreboard
supabase/schema.sql          tables and storage for the shared feed
docs/                        status, architecture, devpost draft
```

## Team

- **Anthony Filip** — tracker: camera/mic detection, crack detector, shaka, accuracy lab
- **Lana Avdalovic** — live tracker v1, results page, feed, comments, ratings, profiles, leaderboard, Supabase

## Built with

JavaScript · TypeScript · React · Vite · MediaPipe Tasks Vision (pose, hand / gesture models) ·
Web Audio API · Supabase (Postgres + storage)
