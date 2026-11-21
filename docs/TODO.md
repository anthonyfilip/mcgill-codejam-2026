# TODO — Saturday → submission (~Sun 07:00, confirm)

**State at Sat ~17:45:** §1–§2 built and live; Record screen redesigned (§4, see STATUS "Record
screen"); PWA basics done by Lana (§3). **Next:** the iPhone test list in STATUS "Next up", then §5.

**Goal for tomorrow: a mobile app with a cleaner, friendlier UI.** Route: a **PWA** — the same
web app, made installable ("Add to Home Screen" → full-screen, own icon) and designed
phone-first. A native app would mean rewriting the tuned detection; a PWA keeps it.
App-store packaging (Capacitor) goes in Devpost "What's next".

Owners: **A** = Anthony (tracker, detection, performance), **L** = Lana (UI, feed, Supabase).
Tick items off as they land. Order matters — phones need HTTPS for the camera, so deploy first.

## 0. First thing (30 min, both)
- [x] **Both:** `git switch main; git pull; cd app; npm install`, restart `npm run dev`.
- [x] **L:** PR + merge `fix-local-profile-upload`.
- [ ] **Both:** confirm submission time, Devpost link, Celsius prize/track → CLAUDE.md "Project".
- [ ] **Both — Decide (5 min):** who holds the phone in the main flow?
      **(a) Propped up**, front camera, drinker films themselves — or
      **(b) A friend films** with the back camera (matches how our 18 test clips were shot).
      Recommendation: support both with a camera flip button; demo with (b).

## 1. Get it on a phone (morning, ~2 h)
- [x] **A or L — Deploy to Vercel (45 min).** Live at https://getsendy-app.vercel.app;
      every push to `main` redeploys (GitHub Action + `VERCEL_TOKEN` secret). URL in README "Try it".
- [ ] **Both — Phone test, as-is (30 min).** Open the URL on an iPhone (Safari) and an Android
      (Chrome). Do a run, post it, open feed + leaderboard. Write every problem in a list below
      this section (layout, permissions, speed, audio, recording). This list drives the rest of the day.
- [ ] **A — Measure speed on the phones (15 min).** The debug panel → frames per second during a
      run. Under ~10 fps the detection gets unreliable. (The debug panel is dev-server only now:
      Android → USB + `chrome://inspect` port-forward `5173`; iPhone can't reach the dev server —
      add a temporary on-screen fps readout if needed.)

## 2. Make the tracker work on phones (A, ~3 h)
(Built Sat afternoon — every box below still needs one real phone run to confirm.)
- [x] **Camera:** flip button (front ↔ back, `facingMode`); mirror the video only for the front
      camera; full-screen picture. Phones ask for the camera's default picture (asking an iPhone
      for portrait 720×1280 gave landscape 1280×720 → 70% cropped, very zoomed).
- [x] **Speed:** on phones use the `lite` pose model ~~and lower resolution~~ (kept HD: far-away
      hands need the pixels), and only run the hand model while armed/running (it's the heavy part).
      Target ≥ 15 fps on a mid-range phone — **measure it** (fps is in the debug panel's first line).
- [x] **iPhone audio:** create/resume the AudioContext inside the GET SENDY! tap (iOS blocks it
      otherwise); **check** the crack still registers with the phone mic (click dB in debug).
- [x] **Recording:** records mp4 first wherever supported (plays on every phone); **check** the
      replay and upload on iOS.
- [x] **Keep the screen on** during a run (`navigator.wakeLock`), and a short vibration on start/finish
      where supported (`navigator.vibrate`, Android).
- [x] **Re-check accuracy** in the lab after any threshold/model change — rules unchanged, lab
      scores unchanged (lab uses the full model; phones' lite model isn't measured yet).

## 3. Installable app — PWA (L or A, ~1.5 h)
- [x] Web app manifest ("getSendy!", icons, standalone, opens on Chugs) — Lana, `public/manifest.webmanifest`.
- [ ] Service worker — not added (none in the repo). Optional; skip unless install needs it.
- [x] iOS tags (`apple-touch-icon`, capable, status bar) + "Get the app" section on Profile — Lana.
- [x] App icon (Lana's pixel-art icon).

## 4. Better-looking, friendlier UI (L lead, A on the tracker screen, ~5 h)
Design once, then apply everywhere. Phone-first: one hand, thumb reach, big targets.
- [ ] **L — Style guide (30 min):** 2–3 colours, one font, button + card styles, dark theme.
      Celsius-inspired accents for the demo. Put it in a shared CSS file both sides import.
- [x] **L — Navigation:** bottom tab bar (Chugs · Leaderboard · Profile) + sideways swipes — Lana.
- [x] **A — Record screen (the hero):** done Sat, with Anthony's choices: full-screen camera that
      starts on page open, GET SENDY! at the bottom centre, timer only once the chug starts, **no
      prompts/messages at all** (decided against the step-by-step prompts), no tracking visuals;
      debug panel only on the local dev server. Details: STATUS "Record screen".
- [x] ~~**A — First-run screen**~~ — dropped: the camera/mic prompt now appears as soon as Record
      opens (Anthony's call).
- [ ] **L — Results screen:** big time, replay, PB/rank as simple badges, name + description, one
      primary **Post** button, Retake as secondary.
- [ ] **L — Feed:** full-width video cards, tap to play, rating + comments in a bottom sheet.
- [ ] **L — Leaderboard + Profile:** podium for the top 3, your own row highlighted; profile edit
      as a sheet.
- [ ] **Both — Polish pass (45 min):** loading states, empty states ("No runs yet — be the first"),
      error messages in plain words, consistent spacing.

## 5. Demo + submission (last ~3–4 h, both)
- [ ] **Demo setup on a phone:** friend films with the back camera (or phone on a tripod ~2 m
      away), good light on the drinker, one Celsius can (≈200 mg caffeine — one drinker, one can).
      **Mirror the phone screen to the projector** (AirPlay / Android cast / a cable) — practise it.
- [ ] **Backup video:** screen-record one perfect run on the phone, end to end.
- [ ] **Final name + tagline + app icon.**
- [ ] **Devpost** from `docs/DEVPOST.md`: rewrite "What it does" for mobile, phone screenshots,
      demo video, repo + live URL; add "installable app" to Built with.
- [ ] **Rehearse** (≤ 3 min) twice: problem → live run on the phone → feed/leaderboard →
      accuracy slide → what's next (App Store via Capacitor, groups, school vs school).
- [ ] **Make the repo public** right before submitting; check `git ls-files` has no `.env.local`
      or clips. Clean test posts out of the feed.

## Still worth doing if time allows
- [ ] **A — Back up `Chug_Examples/`** somewhere private (only exists on Anthony's laptop).
- [ ] **A — Follow the drinker in groups** (person whose hand is at their mouth), measured in the lab.
- [ ] **A — Verified badge:** unverified if the drinker leaves frame; flag < 2 s; reset after 30 s.

## Cut list (not tomorrow)
App Store / Play Store packaging (Capacitor) · push notifications · offline feed ·
school vs school · two-person races · one shared rules module for tracker + lab.

## Don't forget
- Sleep a few hours. Stop new features ~3 h before the deadline.
- UI work touches both areas: agree the style guide first, then L styles `src/feed/`, A styles
  `index.html` + `src/live/`. Small PRs, merged often — **Lana merges** (only her merges deploy).
