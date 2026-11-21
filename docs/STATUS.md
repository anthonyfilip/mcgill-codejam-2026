# Status

Updated Sat 2026-11-21 ~17:45 · submission ~Sun 07:00 (confirm) · demo with a Celsius can.
Live: https://getsendy-app.vercel.app (auto-deploys when **Lana** merges to `main`). Plan: [TODO.md](TODO.md).

## Next up (start here in a new chat)
1. **iPhone test of everything merged Sat afternoon** (fully close the app/tab first — phones kept
   showing stale copies): camera fills the screen without heavy zoom on both cameras; permission
   prompt as soon as Record opens; GET SENDY! → no text during the run → timer appears at the crack
   → 🤙 freezes it → replay includes ~1 s after the 🤙 → results page; ⚡ light: **back camera
   flashlight** (now always attempted — worked once earlier in Brave, unverified since) and **front
   white frame**.
2. **Back camera from ~2 m with a real Celsius can**: does the 🤙 still register at the phone's
   default camera resolution (lower than 1280×720)? Does the crack register on the iPhone mic?
3. Then TODO §5 (demo + submission).

## Demo path (the one flow that must work for judges)
1. Drinker stands ~2 m back, head + shoulders + elbows in frame, Celsius can in hand.
2. Open Record (camera starts on its own) → tap **GET SENDY!** → crack the can at the mouth and
   drink → the timer appears and runs from the crack.
3. Lower the can, flash a 🤙 → timer freezes (back-dated to when the head came forward / can left
   the mouth).
4. Results page: time, replay, personal best, rank → name the run → post.
5. Feed shows it (rate ★, comment) → Leaderboard ranks it.
6. Accuracy slide: "start within 0.15 s on average of frame-by-frame timing on real videos"
   (8 single-person phone clips, all found; see Accuracy below for run-time numbers).

Backup: a recorded run of the full demo, in case the live camera fails on stage.

## Record screen (as of Sat ~17:45, all merged)
- **Opens the camera on page load**: camera + mic permission is asked as soon as Record opens
  (only when arriving from our own pages — `share.ts` sends outside visitors to the feed first).
  GET SENDY! stays hidden until ready; if refused, tapping GET SENDY! asks again.
- **Full-screen camera** above the tab bar, Instagram-style (`object-fit: cover`), page doesn't
  scroll. **Phones ask for no size (camera default)**: asking an iPhone for portrait 720×1280 gave a
  landscape 1280×720 picture and filling the screen cut off 70% (looked very zoomed). Laptops ask
  1280×720 (what the lab was tuned with).
- **GET SENDY!** at the bottom centre starts the *recording* (clip = tap → 1 s after the 🤙) and
  hides while recording. "Upload a video of your chug" (Lana's) floats above it, hidden while
  recording. **No text during or after a run**; the **timer is hidden until the chug starts**.
- Top-left: 🔄 flip (front ↔ back; only front is mirrored) and ⚡ light. **Light**: back camera →
  phone flashlight, always attempted (both torch-constraint forms; not gated on `getCapabilities()`,
  which broke it on iPhone); front camera → thick white frame around the camera (ring light).
- **No tracking visuals for users**: skeleton/hand/mouth overlay, debug readout and lab link show
  only on the local dev server (`npm run dev`, scroll below the camera); the Crack/Angle/Mouth/🤙
  lights are hidden everywhere.
- Phones: `lite` pose model, hand model every frame only during a run (every 4th while armed),
  screen kept awake, vibration on start/end (Android), mp4 recording where supported, AudioContext
  resumed in the GET SENDY! tap (iPhone).
- After the clip stops, the run goes straight to Lana's **results page** (kept on purpose — it's
  where runs are named and posted).

## Detection rules (live `app.js` CONFIG = lab `rules.ts` RULES)
- **Start needs ALL of:** 1. can at the mouth ≥ 0.15 s; 2. a sound — loud crack or a **click**
  (loudest ~6 ms above 6 kHz, ≥ 15 dB over the previous 0.5 s); 3. within 2.5 s the drinking motion,
  lasting 0.5 s: head tilts back ≥ 0.1 shoulder widths AND forearm swings ≥ 25° toward vertical (or
  is already within 45°), can still at the mouth; 4. a **real person** (face + shoulder confidence
  ≥ 0.5, shoulders ≥ 4% of frame height) — a phone pointed at a foot once started a run. Clock =
  the strongest of those sounds. **No sound → no start.** Crack while the can hides the face (pose
  lost) still counts within 1.2 s if the can was at the mouth with a real person when it vanished.
- **End:** 🤙 anywhere in frame (3D finger bends), no hold; refused while the can is at the mouth;
  time = when the head came forward (head-tilt drop) near the last moment the can was at the mouth.
  The on-screen timer freezes the instant the 🤙 is seen. Wrist hidden right after being at the
  mouth counts as still drinking for 0.5 s.
- **Accuracy (lab, 18 labelled clips, fresh analysis Sat ~14:00):** single-person — all 8 start,
  start error 0.15 s avg, no false starts; run time 0.15 s on 7 clips, clip 18's end +1.2 s (8-clip
  avg 0.29 s). Groups: all 10 start, 2 late (wrong person). Tuned on both the old and fresh analyses.

## Not yet verified
- Everything above on a real iPhone/Android after the latest merges (see Next up).
- A real can cracked live into a **phone** mic; phone fps (target ≥ 15); `lite`-model accuracy.
- Back-camera flashlight on iPhone (Safari and Brave) since the "always try" change.

## Known issues / limits
- Groups: the tracker follows the most prominent person, not necessarily the drinker.
- Clip 18 (slow drinker): end detected 1.2 s late on the fresh analysis.
- Live rules and the lab mirror are separate copies — change thresholds in both.
- iPhones can't be inspected from Windows: for phone-only bugs, add a temporary on-screen readout
  (like the long-press camera check used Sat) and remove it after.
- Phones may show a stale copy of the site — fully close the app/tab after a deploy.
- Only Lana's merges deploy (Vercel Hobby). Repo public at submission may lift this.
- `Chug_Examples/` (clips, labels, analysis) exists only on Anthony's laptop — not backed up.
- Profiles have no passwords; a profile belongs to the browser that made it.

## Cut list (drop from the bottom if time runs out)
- Verified badge + sanity checks (left frame, impossible times)
- Follow the person whose hand is at the mouth (groups)
- School vs school leaderboard · two-person race mode · spillage detection, other games
