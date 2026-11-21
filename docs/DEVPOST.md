# Devpost draft — McGill CodeJam 2026

Copy each section into the matching Devpost field. Items marked **TODO** need a decision.

---

**Project name:** TODO (working name: Shotgun Tracker)

**Tagline (≤ 200 chars):**
> Crack it, drink it, send it 🤙 — a camera-and-mic referee that times a shotgun on its own and puts it on a live leaderboard.

---

## Inspiration

Every shotgun race ends the same way: someone fumbled the stopwatch, someone started early, and
everyone argues about who actually won. We wanted a referee that doesn't blink — point a laptop
at the drinker, and the app decides when the run started and when it ended, with a replay to
prove it.

## What it does

- **Times itself.** Press GET SENDY! and drink. The timer starts when it *hears* the can crack while
  the can is at your mouth, and stops when it *sees* the can come down.
- **Send it 🤙.** Flash a shaka to confirm you're done. Your time is set to the moment the can
  left your mouth, so how fast you get your hand up doesn't matter.
- **Can't be gamed easily.** A crack only counts with the can already at the drinker's mouth
  (someone opening a can nearby won't start your run), and a shaka with the can still at your
  mouth is refused.
- **Works across a room.** People stand a few metres back at a party, so the tracker uses HD
  video, a full-body pose model and zoomed-in hand tracking.
- **Social.** Every run gets a results page with a replay, can be named and posted to a shared
  feed, rated with stars and commented on. The leaderboard ranks runs rated ★3.5+ first, then the
  fastest — so a sloppy, half-spilled run can't top a clean one.

## How we built it

Everything runs in the browser — no server touches the camera or microphone.

- **Vision:** Google's MediaPipe pose model tracks the drinker's wrists and mouth; a hand model
  runs on zoomed-in crops around each wrist so small, far-away hands are still found.
- **The shaka:** MediaPipe has no shaka gesture, so we built our own detector from the 21 hand
  landmarks: thumb and pinky straight, the other fingers curled, measured as 3D bend angles so it
  works whichever way the hand is turned.
- **The crack:** a can opening is a short burst of treble. We measure loudness and "brightness"
  (energy above 3 kHz) every 20 ms and look for a sudden bright jump compared with the half-second
  before — which keeps working in a loud room.
- **Feed and leaderboard:** React + Supabase (Postgres for posts, ratings, comments and profiles;
  storage for replay clips and profile photos).
- **A test lab:** we collected 18 real shotgun videos, labelled the true start and end of each by
  hand, and built a lab page that runs the exact live rules on every clip and scores them against
  our labels. Every threshold in the tracker was tuned from that data, not guessed.

## Challenges we ran into

- **A crack is quiet compared with a party.** Our first detector demanded a sound 6× louder than
  the room; in real party videos a crack is only 3–5× louder, so it heard just 5 of 18. Switching to
  "sudden bright jump versus the last half-second" doubled the runs started by the actual crack
  — every one within half a second.
- **Our guesses were wrong.** We assumed the drinking arm would be tilted steeply. The data said
  arm angle barely differs between drinking and not drinking (~25° both), and our "hand at mouth"
  distance cut right through real drinking. Measuring instead of guessing more than halved the
  error.
- **Hands disappear.** A hand wrapped around a can at a distance is hard for a hand model to see —
  cropping and enlarging the area around each wrist fixed that.
- **No shaka in MediaPipe**, and a curled hand facing away from the camera breaks simple 2D
  checks — 3D finger-bend angles solved it.

## Accomplishments that we're proud of

- On real single-person shotgun videos, the **finish time is within 0.4 s on average** of
  frame-by-frame human timing (6 of 8 within half a second), and the **start within 0.64 s**.
- A real can cracked ~2 m from a laptop scores in the thousands on our crack detector (threshold:
  4), with **zero false cracks** in a noisy recording with no can.
- A detection lab that turns "does it feel right?" into a number we can improve.
- Two people building the tracker and the social side in parallel and merging them with no
  conflicts.

## What we learned

- Collect data and label it early — every big accuracy win came from looking at real clips.
- Real-world audio and video are messy; rules that compare against "just before" beat fixed
  thresholds.
- How to split work across branches, merge often, and keep `main` demoable.

## What's next for TODO (project name)

- **Groups:** follow the person who's actually drinking (not just the biggest in frame), and
  split-screen races for two drinkers at once.
- **More data:** more labelled clips, especially laptop-recorded ones, to tighten the start time.
- **School vs school** leaderboards and event modes for parties and tournaments.
- **Any drink:** the timer doesn't care what's in the can — water and soda challenges too.

## Built with

`javascript` `typescript` `react` `vite` `mediapipe` `web-audio-api` `supabase` `postgresql` `html5` `css3`

---

### Before submitting (TODO)

- [ ] Final project name + tagline.
- [ ] Confirm team names/roles (README "Team" section too).
- [ ] Celsius / sponsor prize: add the track name and one line on how the demo uses Celsius.
- [ ] Repo **public** (judges can't open a private repo) and link it.
- [ ] Demo video (≤ 2–3 min): GET SENDY! → crack → drink → 🤙 → results → feed → leaderboard,
      plus 10 s of the lab's accuracy table.
- [ ] Screenshots: tracker mid-run with the skeleton, results page, leaderboard, lab scoreboard.
- [x] Supabase: only the poster can delete their post (`delete_post()` checks their profile
      secret), and a clip can only be removed once its post is gone. Done in #4.
- [ ] Re-check the accuracy numbers in the lab right before submitting if thresholds changed.
