# Status

Updated Mon 2026-11-23. **The hackathon is over** (McGill CodeJam 2026, pitched with a Celsius can);
getSendy! is now an ongoing side project. Live: https://getsendy-app.vercel.app (every merge to
`main` deploys). Hackathon-era plan: [TODO.md](TODO.md) (historical).

## Next up (start here in a new chat)
1. **iPhone: test "Upload a video of your chug" again** after #70 (close every tab first, good
   Wi-Fi). Before #70 an upload sat at "Loading the body tracker…" for minutes on an iPhone (Brave/
   Chrome); never reproduced on the laptop. If it still stalls, the next suspects are the download
   size (the upload loads its own full pose + hand models, ~17 MB, on top of the live tracker's
   ~13.5 MB) and iPhone memory — e.g. reuse the live tracker's models for uploads.
2. **Upload accuracy on slow phones:** the upload plays the clip once at normal speed and analyses
   only the frames it keeps up with, so a slow phone skips frames and mistimes the run. Analyse
   frame by frame (seek) instead of in real time.
3. **Parked start fix:** when a weak click starts the run and a clearly louder crack follows within
   ~2.5 s with the can at the mouth, move the start to the louder crack. Seen on the post "Tall can
   torpedo" (posted 6.28 s; the lab rules gave 4.25 s: a 19 dB click at 2.55 s instead of the real
   crack at ~4.4 s). Change `app.js` and `rules.ts`, score on the 18 labelled clips (old + fresh
   analyses) before calling it done.
4. **Docs still in hackathon mode:** CLAUDE.md ("36 h", submission time, "Only Lana merges into
   `main`", the Vercel author limit) and TODO.md.
5. Then the cut list below.

## Main flow
1. Open the site → first visit (not logged in): **welcome pop-up** — what the app does, how to use
   it (incl. the 🤙 shaka to stop the clock), **Sign up** / **Log in**, small **Terms of Service** link.
2. Record (camera starts on its own) → **GET SENDY!** → crack the can at the mouth and drink → the
   timer appears and runs from the crack.
3. Lower the can, flash a 🤙 → timer freezes (back-dated to when the head came forward / can left
   the mouth); the clip keeps recording 1 s more.
4. Results page: time, replay, personal best, rank → name the run → post.
5. Feed (rate ★, comment, share) → Leaderboard ranks it. Or: **upload a video** of a chug instead.

## Record screen (app.js + Lana's share.ts)
- **Opens the camera on page load** when arriving from our own pages (`share.ts` sends outside
  visitors to the feed first). GET SENDY! stays hidden until ready; if refused, tapping it asks again.
- **Full-screen camera**, Instagram-style (`object-fit: cover`). Phones ask for no size (camera
  default: iPhone portrait requests came back landscape and 70% cropped); laptops ask 1280×720.
- **GET SENDY!** starts the recording (tap → 1 s after the 🤙). **No text during or after a run**;
  the timer is hidden until the chug starts. After the clip stops, the results page opens.
- Top-left: 🔄 flip (front ↔ back; only front is mirrored) and ⚡ light (back camera → flashlight,
  always attempted and re-applied every second during a run, since recording switches it off on
  iPhone; front camera → white frame as a ring light). Light always starts off.
- **Upload a video of your chug** (Lana): times an uploaded clip with the lab's pipeline
  (`src/feed/upload.ts`: sound profile → pose + hands frame by frame → `detect()`). Since #70 the
  camera and live tracking **stop while an upload is analysed** (`upload:start` / `upload:end`
  events) and come back if it fails. Laptop, clip 02 (labelled 5.6 s): 3.93 s with the camera
  running → 5.37 s with it paused.
- Phones: `lite` pose model, hand model every frame only during a run (every 4th while armed),
  screen kept awake, vibration on start/end (Android), mp4 recording where supported, AudioContext
  resumed in the GET SENDY! tap (iPhone).
- No tracking visuals for users: overlay, debug readout and lab link only on `npm run dev`.

## Accounts, feed and legal (Lana's area; welcome + terms added Sun evening)
- **Welcome pop-up** (`ProfileModal.tsx`) for anyone without a profile, on every page incl. the
  Profile tab; "Make your profile" opens only from **Sign up**, the log-in form from **Log in**.
  A logged-in user whose name was taken goes straight to the profile form.
- **Terms of Service** (`Terms.tsx`): link at the bottom of your Profile tab and under the welcome
  buttons; pop-up with 18+, no alcohol, "users are not advised to post more than 1 chug an hour or
  3 chugs a day", ~2 energy drinks a day (a Celsius ≈ 200 mg caffeine; adults < 400 mg/day),
  safety, **posting = public video + consent**, camera/mic stay on the phone, conduct, small print.
  Not reviewed by a lawyer.
- Profile opens as a view (no text boxes until Edit profile), autofill off on profile forms,
  passwords to log back in on another phone, delete account, "getSendy! the app" install button,
  empty feed says "crickets…".

## Detection rules (live `app.js` CONFIG = lab `rules.ts` RULES)
- **Start needs ALL of:** 1. can at the mouth ≥ 0.15 s; 2. a sound — loud crack or a **click**
  (loudest ~6 ms above 6 kHz, ≥ 15 dB over the previous 0.5 s); 3. within 2.5 s the drinking motion,
  lasting 0.5 s: head tilts back ≥ 0.1 shoulder widths AND forearm swings ≥ 25° toward vertical (or
  is already within 45°), can still at the mouth; 4. a **real person** (face + shoulder confidence
  ≥ 0.5, shoulders ≥ 4% of frame height). Clock = the strongest of those sounds. **No sound → no
  start.** A crack while the can hides the face still counts within 1.2 s.
- **End:** 🤙 anywhere in frame (3D finger bends), no hold; refused while the can is at the mouth;
  the time always stops when the head came forward near the last moment the can was at the mouth,
  however late the 🤙 comes. The on-screen timer freezes the instant the 🤙 is seen.
- **Shared code:** `app.js` imports the start check (`confirmedStart`) and end timing
  (`refineEnd`) from `rules.ts`; the thresholds and per-frame signal/sound code are still two
  copies — change both.
- **Accuracy (lab, 18 labelled clips, fresh analysis Sat ~14:00):** single-person — all 8 start,
  start error 0.15 s avg, no false starts; run time 0.15 s on 7 clips, clip 18's end +1.2 s (8-clip
  avg 0.29 s). Groups: all 10 start, 2 late (wrong person).

## Deploy
- Every merge to `main` runs `.github/workflows/deploy.yml` (Vercel CLI, Lana's Hobby account).
- **Anyone's merges deploy now.** While the repo was private, Vercel refused commits not authored
  by Lana; since it went public, Anthony's merges (#67–#70) deployed fine.
- Phones keep a stale copy after a deploy — fully close the app/tab.

## Verified / not yet verified
- **Verified on an iPhone** (Sat evening → Sun morning): the Record flow end to end (camera, timer,
  🤙, replay, results).
- **Verified on the laptop only** (Sun–Mon): welcome pop-up, Terms, upload with the camera paused.
- **Not yet verified:** upload on an iPhone after #70; phone fps (target ≥ 15; one phone post
  looked like ~13 fps at 480×640); `lite`-model accuracy; a full crack-to-🤙 run on Android.

## Known issues / limits
- **iPhone camera "not loading" after the permission prompt** (Sun evening) was the phone's state,
  not the code — most likely another tab still holding the camera. Fix: close every tab, swipe the
  browser away, reopen in one tab.
- Upload: big download (~17 MB extra), real-time analysis (see Next up 1–2).
- Groups: the tracker follows the most prominent person, not necessarily the drinker.
- Clip 18 (slow drinker): end detected 1.2 s late.
- Phones record at the camera default (~480×640), thin for spotting the 🤙 from 2 m.
- The live tracker and the lab/upload use different MediaPipe versions (CDN 0.10.14 vs npm 1.2.3).
- iPhones can't be inspected from Windows: for phone-only bugs, add a temporary on-screen readout.
- `Chug_Examples/` (clips, labels, analysis) exists only on Anthony's laptop — not backed up.
- Profiles belong to a browser unless a password is set; no email or account recovery.

## Cut list / ideas
- Verified badge + sanity checks (left frame, impossible times)
- Follow the person whose hand is at the mouth (groups)
- Service worker (offline / better install), App Store packaging (Capacitor)
- School vs school leaderboard · two-person race mode · spillage detection, other games
