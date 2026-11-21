import {
  FilesetResolver,
  PoseLandmarker,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { handAngles, nearestHand, toPx } from "../detect/angles.ts";

// All thresholds in one place. Starting guesses — tune with real cans.
const CONFIG = {
  windowMs: 1500,          // how long a signal light stays on after it fires (display only)
  // Start rule: the can must be at the mouth FIRST, then the crack — the order of a real shotgun.
  crackGraceMs: 1000,      // a crack counts with the can at the mouth, or up to this long BEFORE it gets there
                           // (people lift and crack almost at once — live test: crack 0.2 s after reaching the mouth)
  gapMs: 250,              // tracking dropouts shorter than this don't count as "left the mouth"
  visualStartMs: 800,      // fallback if no crack is heard: can at mouth AND tipped for this long
  // End rule: the 🤙 confirms the end, but the time stops when the can last left the mouth.
  maxBackdateMs: 4000,     // only back-date if the can left the mouth at most this long before the 🤙
  // Crack = sudden bright jump vs the half-second before (same as src/detect/cracks.ts cracksByContrast).
  // Tuned on the 18 labelled clips (8 crack starts, all within 0.5 s) + live laptop-mic recordings
  // (0 false cracks in a noisy no-crack recording; a real Monster crack at ~2 m scored in the thousands).
  crackScore: 4,           // jump (× louder than the last crackLookS) × brightness
  crackMinRms: 0.01,       // ignore anything quieter than this
  crackLookS: 0.5,
  crackHighFreqHz: 3000,
  // Tuned on the 18 labelled clips (lab → "Analyse all clips"): arm angle barely differed between
  // drinking and not (both ~25°), so "tipped" now just means the hand is raised above the shoulder.
  angleDeg: 0,             // forearm tilt from vertical that counts as "can tipped"
  mouthDist: 0.8,          // wrist-to-mouth distance, in body-scale units (clips: drinking 0.25–0.66, otherwise 1.0–1.4)
  sendHoldMs: 300,         // how long the 🤙 "send it" (shaka) must be held
  sendAboveHead: false,    // false = a shaka anywhere in frame ends the run (true = must be above the nose)
  thumbOutRatio: 0.4,      // thumb tip → index knuckle distance, in palm lengths (live: shaka ~0.55, but a fist is similar)
  thumbBendDeg: 35,        // ...and the thumb must be straight. Live: shaka 4–21°, fist with thumb wrapped 51–61°.
                           // Thumbs-up has a straight thumb too — it's rejected because the pinky is curled (~100°).
  fingerBendDeg: 60,       // a finger bent more than this (knuckle→joint vs joint→tip, in 3D) counts as curled
  minRunMs: 1000,          // ignore the end gesture right after the start
  minVisibility: 0.5,      // pose landmark confidence
  // Distance: people stand several metres back, so hands are small in the frame.
  handCropScale: 1.4,      // zoom box around each wrist, in body-scale units (shoulder width)
  handCropPx: 256,         // the zoomed box is resized to this before the hand model sees it
  wristMinVisibility: 0.3, // try a wrist crop even if the pose is only fairly sure where the wrist is
};

// "full" is more accurate than "lite" on small/far-away people, at some speed cost.
const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// Pose landmark indices
const NOSE = 0, MOUTH_L = 9, MOUTH_R = 10, SHOULDER_L = 11, SHOULDER_R = 12;
const ELBOW_L = 13, ELBOW_R = 14, WRIST_L = 15, WRIST_R = 16;

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx2d = canvas.getContext("2d");

let pose, gesture, handCrop, stream, analyser, highAnalyser, audioCtx, recorder, chunks = [];
const cropCanvas = document.createElement("canvas");
const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
let state = "idle"; // idle → armed → running → done

// Last time each start signal was true (ms, performance.now()).
const seen = { crack: -Infinity, angle: -Infinity, mouth: -Infinity };
let run = null;     // { startAt, startedBy, angles: [] }
let sendSince = null;
let live = {};      // latest readings, for the debug panel

// Continuous "can at the mouth" / "can tipped" tracking (ms, performance.now()).
// *Since = when the current stretch began (null if not currently true); last*At = last frame it was true.
const track = { mouthSince: null, lastMouthAt: -Infinity, angleSince: null, lastAngleAt: -Infinity };

function resetTrack() {
  track.mouthSince = track.angleSince = null;
  track.lastMouthAt = track.lastAngleAt = -Infinity;
}

// Update a stretch: true this frame extends it; false for longer than gapMs ends it.
function updateStretch(isTrue, now, sinceKey, lastKey) {
  if (isTrue) {
    if (track[sinceKey] === null || now - track[lastKey] > CONFIG.gapMs) track[sinceKey] = now;
    track[lastKey] = now;
  } else if (now - track[lastKey] > CONFIG.gapMs) {
    track[sinceKey] = null;
  }
}

// How long the can has been held at the mouth right now (0 if it isn't).
function mouthHeldMs(now) {
  if (track.mouthSince === null || now - track.lastMouthAt > CONFIG.gapMs) return 0;
  return track.lastMouthAt - track.mouthSince;
}

$("arm").onclick = async () => {
  $("arm").disabled = true;
  if (!stream) {
    try {
      await setup();
    } catch (err) {
      setStateText(`Setup failed: ${err.message}`);
      $("arm").disabled = false;
      return;
    }
  }
  $("results").hidden = true;
  run = null;
  sendSince = null;
  seen.crack = seen.angle = seen.mouth = -Infinity;
  resetTrack();
  setState("armed");
};

async function setup() {
  setStateText("Loading models…");
  stream = await navigator.mediaDevices.getUserMedia({
    // Ask for HD: someone across the room needs the pixels. The browser falls back if unsupported.
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    // Raw audio: noise suppression would eat the crack transient.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  const mic = audioCtx.createMediaStreamSource(stream);
  mic.connect(analyser);
  // Same mic through a steep high-pass (two filters), to measure how "bright" the sound is.
  const hp1 = audioCtx.createBiquadFilter(), hp2 = audioCtx.createBiquadFilter();
  for (const hp of [hp1, hp2]) { hp.type = "highpass"; hp.frequency.value = CONFIG.crackHighFreqHz; }
  highAnalyser = audioCtx.createAnalyser();
  highAnalyser.fftSize = 2048;
  highAnalyser.smoothingTimeConstant = 0;
  mic.connect(hp1).connect(hp2).connect(highAnalyser);

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  pose = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  gesture = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
  // Second instance for zoomed-in wrist crops: IMAGE mode, one hand per crop.
  handCrop = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: "GPU" },
    runningMode: "IMAGE",
    numHands: 1,
  });

  // Audio runs on its own timer so a slow video frame doesn't hide a crack.
  setInterval(checkCrack, 20);
  requestAnimationFrame(loop);
}

// ---------- Signal 1: crack (microphone) ----------

// Crack = a sudden, BRIGHT jump compared with the half-second just before it. Measured exactly
// like the lab's sound profiles (src/audio/offline.ts) — loudness of the last 2048 samples, and
// brightness = share of that energy left after a steep 3 kHz high-pass — so the threshold tuned
// on the 18 labelled clips (src/detect/cracks.ts cracksByContrast) applies here unchanged.
const timeBuf = new Float32Array(2048);
const highBuf = new Float32Array(2048);
const recentRms = [], recentHigh = []; // last crackLookS of readings
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };

function checkCrack() {
  analyser.getFloatTimeDomainData(timeBuf);
  highAnalyser.getFloatTimeDomainData(highBuf);
  let e = 0, eh = 0;
  for (let i = 0; i < timeBuf.length; i++) { e += timeBuf[i] * timeBuf[i]; eh += highBuf[i] * highBuf[i]; }
  const rms = Math.sqrt(e / timeBuf.length);
  const highShare = e > 0 ? eh / e : 0;

  const look = Math.round(CONFIG.crackLookS / 0.02);
  const prevR = recentRms.length ? median(recentRms) : rms;
  const prevH = recentHigh.length ? median(recentHigh) : highShare;
  const jump = rms / Math.max(prevR, 1e-4);
  const score = highShare > prevH + 0.3 ? jump * Math.min(highShare, 1.5) : 0;
  recentRms.push(rms); recentHigh.push(highShare);
  if (recentRms.length > look) { recentRms.shift(); recentHigh.shift(); }

  const isCrack = recentRms.length >= look && rms >= CONFIG.crackMinRms && score >= CONFIG.crackScore;
  const t = performance.now();
  if (isCrack && state === "armed" && t - seen.crack > 300) { // one crack = one event, not every 20 ms poll
    seen.crack = t;
    // Sequence rule: the crack must happen with the can at the mouth. A crack with the can
    // elsewhere (or someone else's can) is ignored — unless the can reaches the mouth within
    // crackGraceMs AFTER it (checked in loop()), since people lift and crack almost at once.
    const atMouthNow = mouthHeldMs(t) > 0;
    live.crackLog = [{ t, rms, ratio: jump, high: highShare, score, atMouth: atMouthNow }, ...(live.crackLog ?? [])].slice(0, 5);
    if (atMouthNow) startRun(t, ["can at mouth", "crack"]);
    else live.ignoredCrack = t;
  }
  live.rms = rms; live.jump = jump; live.highShare = highShare; live.crackScore = score;
  live.peakScore = Math.max(score, (live.peakScore ?? 0) * 0.97); // decays, so a brief pop stays readable
}

// ---------- Signals 2 + 3: angle and mouth (pose) ----------

function readPose(lm) {
  const W = canvas.width, H = canvas.height;
  const px = (p) => ({ x: p.x * W, y: p.y * H, v: p.visibility ?? 1 });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const mouth = { x: (lm[MOUTH_L].x + lm[MOUTH_R].x) / 2 * W, y: (lm[MOUTH_L].y + lm[MOUTH_R].y) / 2 * H };
  const sL = px(lm[SHOULDER_L]), sR = px(lm[SHOULDER_R]);
  const shoulderMid = { x: (sL.x + sR.x) / 2, y: (sL.y + sR.y) / 2 };
  // Shoulder width collapses when filmed side-on, so fall back to neck length.
  const scale = Math.max(dist(sL, sR), dist(mouth, shoulderMid));

  // Drinking arm = whichever wrist is closer to the mouth.
  const arms = [
    { wrist: px(lm[WRIST_L]), elbow: px(lm[ELBOW_L]), shoulder: sL },
    { wrist: px(lm[WRIST_R]), elbow: px(lm[ELBOW_R]), shoulder: sR },
  ].filter((a) => a.wrist.v > CONFIG.minVisibility && a.elbow.v > CONFIG.minVisibility);
  if (!arms.length || scale === 0) return null;
  arms.sort((a, b) => dist(a.wrist, mouth) - dist(b.wrist, mouth));
  const arm = arms[0];

  const mouthDist = dist(arm.wrist, mouth) / scale;

  // Forearm tilt from straight up: 0° = can upright, 90° = level, >90° = past level.
  // Only meaningful with the hand raised; a hanging arm would otherwise read 180°.
  let angle = null;
  if (arm.wrist.y < arm.shoulder.y) {
    const dx = arm.wrist.x - arm.elbow.x, dy = arm.wrist.y - arm.elbow.y;
    angle = Math.acos(-dy / Math.hypot(dx, dy)) * 180 / Math.PI;
  }
  return { arm, mouth, mouthDist, angle, scale, nose: px(lm[NOSE]) };
}

// ---------- End: 🤙 "send it" / shaka (hand landmarks) ----------
// MediaPipe has no built-in shaka, so we read the 21 hand points ourselves:
// thumb + pinky out, index + middle + ring curled.
// Uses the 3D world landmarks (metres, centred on the hand) and measures how much each
// finger BENDS, so it works whichever way the hand faces — including back of the hand
// to the camera with the fingers curled in towards the person, where the curled
// fingertips point along the camera's line of sight and 2D distances are meaningless.

const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, MIDDLE_MCP = 9;
const FINGERS = { index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20] }; // [knuckle, middle joint, tip]

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dist3 = (a, b) => len(sub(a, b));

// Angle (degrees) between knuckle→joint and joint→tip: ~0° straight, ~90°+ curled.
function bendDeg(h, [mcp, pip, tip]) {
  const v1 = sub(h[pip], h[mcp]), v2 = sub(h[tip], h[pip]);
  const cos = (v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / ((len(v1) * len(v2)) || 1e-9);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

function readShaka(h) {
  const palm = dist3(h[WRIST], h[MIDDLE_MCP]) || 1e-9;
  const ext = {}, bend = {};
  for (const [name, joints] of Object.entries(FINGERS)) {
    bend[name] = bendDeg(h, joints);
    ext[name] = bend[name] < CONFIG.fingerBendDeg;
  }
  const thumbRatio = dist3(h[THUMB_TIP], h[INDEX_MCP]) / palm;
  bend.thumb = bendDeg(h, [2, 3, 4]); // thumb knuckle → joint → tip
  ext.thumb = thumbRatio > CONFIG.thumbOutRatio && bend.thumb < CONFIG.thumbBendDeg;
  const shaka = ext.thumb && ext.pinky && !ext.index && !ext.middle && !ext.ring;
  return { shaka, ext, bend: { ...bend, thumbRatio } };
}

// hands: [{ px: 21 points in pixels, world: 21 3D points (metres) or null }]
function readSend(hands, noseY) {
  let fingers = null;
  for (const hand of hands) {
    // 3D world landmarks when available; otherwise pixel landmarks (2D only).
    const { shaka, ext, bend } = readShaka(hand.world ?? hand.px);
    fingers = { ...ext, bend };
    const highEnough = !CONFIG.sendAboveHead || hand.px[WRIST].y < noseY;
    if (shaka && highEnough) return { send: true, fingers };
  }
  return { send: false, fingers };
}

// ---------- Hands at a distance: zoom in on each wrist ----------
// The hand model searches the whole frame and misses small (far-away) hands. Instead,
// use the pose's wrists to cut a square around each hand, enlarge it to handCropPx, and
// run the hand model on that close-up. Falls back to the whole frame if no pose is found.

function detectHands(now, lm) {
  if (lm) {
    const W = canvas.width, H = canvas.height;
    const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility ?? 1 });
    const sL = P(SHOULDER_L), sR = P(SHOULDER_R);
    const body = Math.max(Math.hypot(sL.x - sR.x, sL.y - sR.y), 40); // shoulder width in px
    const hands = [];
    for (const [wi, ei] of [[WRIST_L, ELBOW_L], [WRIST_R, ELBOW_R]]) {
      const w = P(wi), e = P(ei);
      if (w.v < CONFIG.wristMinVisibility) continue;
      // The hand sits beyond the wrist, along the forearm: shift the box that way.
      const cx = w.x + (w.x - e.x) * 0.35, cy = w.y + (w.y - e.y) * 0.35;
      const size = body * CONFIG.handCropScale;
      const sx = cx - size / 2, sy = cy - size / 2;
      cropCanvas.width = cropCanvas.height = CONFIG.handCropPx;
      cropCtx.fillStyle = "#000";
      cropCtx.fillRect(0, 0, CONFIG.handCropPx, CONFIG.handCropPx);
      cropCtx.drawImage(video, sx, sy, size, size, 0, 0, CONFIG.handCropPx, CONFIG.handCropPx);
      const r = handCrop.recognize(cropCanvas);
      if (!r.landmarks.length) continue;
      hands.push({
        px: r.landmarks[0].map((q) => ({ x: sx + q.x * size, y: sy + q.y * size })), // back to full-frame pixels
        world: r.worldLandmarks?.[0] ?? null,
        box: { sx, sy, size },
      });
    }
    // Both crops can land on the same hand when the wrists are close: keep one.
    if (hands.length === 2) {
      const d = Math.hypot(hands[0].px[WRIST].x - hands[1].px[WRIST].x, hands[0].px[WRIST].y - hands[1].px[WRIST].y);
      if (d < body * 0.25) hands.pop();
    }
    live.handMode = `zoomed wrist crops (${hands.length} hand${hands.length === 1 ? "" : "s"})`;
    if (hands.length) return hands;
  }
  // No pose (or no hand in either crop): search the whole frame.
  const g = gesture.recognizeForVideo(video, now);
  live.handMode = `whole frame (${g.landmarks.length} hand${g.landmarks.length === 1 ? "" : "s"})`;
  return g.landmarks.map((h, i) => ({
    px: toPx(h, canvas.width, canvas.height),
    world: g.worldLandmarks?.[i] ?? null,
  }));
}

// "thumb ✋ index ✊ …" — which fingers the tracker thinks are out, for tuning the shaka.
function fingerText(f) {
  if (!f) return "none seen";
  const thumb = `thumb ${f.thumb ? "out" : "in"} (${f.bend?.thumbRatio?.toFixed(2) ?? "-"}× palm, ${f.bend?.thumb?.toFixed(0) ?? "-"}°)`;
  return [thumb, ...["index", "middle", "ring", "pinky"]
    .map((n) => `${n} ${f[n] ? "out" : "in"}${f.bend?.[n] != null ? ` (${f.bend[n].toFixed(0)}°)` : ""}`)]
    .join(" · ");
}

// ---------- Main loop ----------

function loop() {
  const now = performance.now();
  const res = pose.detectForVideo(video, now);
  const lm = res.landmarks[0];
  const p = lm ? readPose(lm) : null;

  const atMouth = !!p && p.mouthDist < CONFIG.mouthDist;
  const tipped = !!p && p.angle !== null && p.angle >= CONFIG.angleDeg;
  updateStretch(atMouth, now, "mouthSince", "lastMouthAt");
  updateStretch(tipped, now, "angleSince", "lastAngleAt");
  if (state === "armed") {
    if (atMouth) seen.mouth = now;
    if (tipped) seen.angle = now;
  }

  // Crack slightly BEFORE the can reached the mouth: start at the crack time.
  if (state === "armed" && atMouth && track.mouthSince !== null &&
      track.mouthSince - seen.crack >= 0 && track.mouthSince - seen.crack <= CONFIG.crackGraceMs) {
    startRun(seen.crack, ["crack", "can at mouth right after"]);
  }

  // Start (main path) happens in checkCrack: can at mouth, THEN crack.
  // Fallback when no crack is heard (quiet mic, loud room): can at the mouth AND tipped,
  // together for visualStartMs. The clock is back-dated to when both became true.
  if (state === "armed" && track.mouthSince !== null && track.angleSince !== null) {
    const bothSince = Math.max(track.mouthSince, track.angleSince);
    if (atMouth && tipped && now - bothSince >= CONFIG.visualStartMs) {
      startRun(bothSince, ["can at mouth", "can tipped", "no crack heard"]);
    }
  }

  // Read the hand while armed too, so the 🤙 light can be tested before a run starts.
  // Hands are tracked in every state (also after a run), so the overlay always shows them.
  // Only the "running" state acts on the 🤙.
  let send = false;
  let ang = null; // arm / hand / wrist / can angles for the drinking hand
  let handsPx = [];
  {
    const hands = detectHands(now, lm);
    handsPx = hands.map((h) => h.px);
    live.boxes = hands.map((h) => h.box).filter(Boolean);
    const r = readSend(hands, p ? p.nose.y : 0);
    send = r.send;
    live.fingers = r.fingers;
    // Match a tracked hand to the pose's drinking arm, then measure its angles.
    if (p) {
      const i = nearestHand(handsPx, p.arm.wrist, p.scale);
      if (i >= 0) ang = handAngles(handsPx[i], p.arm.elbow, p.arm.wrist);
    }
  }
  live.ang = ang;
  if (state === "running") {
    if (p?.angle != null) run.angles.push(p.angle);
    if (ang) run.hand.push({ t: now - run.startAt, hand: ang.hand, wristFlex: ang.wristFlex, can: ang.can });
    if (send) sendSince ??= now;
    else sendSince = null;
    const confirmed = sendSince !== null && now - sendSince >= CONFIG.sendHoldMs && sendSince - run.startAt >= CONFIG.minRunMs;
    if (confirmed) {
      if (atMouth) {
        // Can still at the mouth → they're signing mid-drink. Don't end yet.
        setStateText("Lower the can to finish 🤙");
      } else {
        // End = last moment the can was at the mouth, if that was recent; otherwise the 🤙 itself.
        const lastMouth = track.lastMouthAt;
        const backdate = lastMouth > run.startAt + CONFIG.minRunMs && sendSince - lastMouth <= CONFIG.maxBackdateMs;
        endRun(backdate ? lastMouth : sendSince, backdate ? "can left mouth (🤙 confirmed)" : "🤙 (can not tracked)");
      }
    }
    if (state === "running") $("timer").textContent = ((now - run.startAt) / 1000).toFixed(2);
  }

  draw(p, ang, handsPx, send);
  for (const k of ["crack", "angle", "mouth"]) {
    $(`sig-${k}`).classList.toggle("on", state === "armed" && now - seen[k] <= CONFIG.windowMs);
  }
  $("sig-send").classList.toggle("on", send);
  const shoulderPx = lm ? Math.hypot((lm[SHOULDER_L].x - lm[SHOULDER_R].x) * canvas.width, (lm[SHOULDER_L].y - lm[SHOULDER_R].y) * canvas.height) : null;
  $("debug").textContent =
    `state ${state}\n` +
    `camera ${video.videoWidth}×${video.videoHeight} · person ${shoulderPx ? `${shoulderPx.toFixed(0)} px shoulders` : "not found"} · hands via ${live.handMode ?? "-"}\n` +
    `audio rms ${live.rms?.toFixed(3)} · jump ×${live.jump?.toFixed(1)} · bright ${live.highShare?.toFixed(2)} · crack score ${live.crackScore?.toFixed(1)} (recent peak ${live.peakScore?.toFixed(1)}, need ${CONFIG.crackScore})\n` +
    `angle ${p?.angle?.toFixed(0) ?? "-"}°  mouth ${p?.mouthDist?.toFixed(2) ?? "-"}\n` +
    `drinking hand: ${ang ? `arm ${ang.arm?.toFixed(0) ?? "-"}° · hand ${ang.hand.toFixed(0)}° · wrist bend ${ang.wristFlex?.toFixed(0) ?? "-"}° · can ~${ang.can.toFixed(0)}° from upright` : "not matched"}\n` +
    `at mouth for ${(mouthHeldMs(now) / 1000).toFixed(1)}s` +
    `${now - (live.ignoredCrack ?? -Infinity) < 2000 ? "  · crack IGNORED (can not at mouth)" : ""}\n` +
    `cracks heard: ${(live.crackLog ?? []).map((c) => `${((now - c.t) / 1000).toFixed(1)}s ago score ${c.score.toFixed(0)} (×${c.ratio.toFixed(1)}, bright ${c.high.toFixed(2)})${c.atMouth ? " @mouth" : ""}`).join(" · ") || "none"}\n` +
    `hand ${fingerText(live.fingers)}  🤙 ${send ? "YES" : "no"}`;

  requestAnimationFrame(loop);
}

function startRun(startAt, startedBy) {
  if (state !== "armed") return; // crack (audio timer) and the video loop can both try to start
  run = { startAt, startedBy, angles: [], hand: [] }; // hand: per-frame hand/wrist/can angles
  chunks = [];
  const mimeType = ["video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = showClip;
  recorder.start();
  setState("running");
}

function endRun(endAt, endedBy) {
  run.timeMs = endAt - run.startAt;
  run.endedBy = endedBy;
  recorder.stop();
  setState("done");
  const a = run.angles;
  $("r-time").textContent = (run.timeMs / 1000).toFixed(2);
  $("timer").textContent = (run.timeMs / 1000).toFixed(2);
  $("r-max").textContent = a.length ? Math.max(...a).toFixed(0) : "-";
  $("r-avg").textContent = a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(0) : "-";
  $("r-by").textContent = `${run.startedBy.join(" + ")} → ended by ${run.endedBy}`;
  $("results").hidden = false;
  $("arm").textContent = "Again";
  $("arm").disabled = false;
}

function showClip() {
  const blob = new Blob(chunks, { type: recorder.mimeType });
  const url = URL.createObjectURL(blob);
  $("replay").src = url;
  $("download").href = url;
  $("download").download = `shotgun.${recorder.mimeType.includes("mp4") ? "mp4" : "webm"}`;
}

// Bones of the 21-point hand: thumb, index, middle, ring, pinky, and the palm.
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function draw(p, ang, handsPx = [], send = false) {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  // Faint boxes showing where the hand model zoomed in.
  ctx2d.lineWidth = 1;
  ctx2d.strokeStyle = "rgba(255,255,255,0.35)";
  for (const b of live.boxes ?? []) ctx2d.strokeRect(b.sx, b.sy, b.size, b.size);
  // Every tracked hand, green when it's making the 🤙.
  for (const h of handsPx) {
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = send ? "#2e9d4f" : "#63e6be";
    ctx2d.beginPath();
    for (const [a, b] of HAND_BONES) {
      ctx2d.moveTo(h[a].x, h[a].y);
      ctx2d.lineTo(h[b].x, h[b].y);
    }
    ctx2d.stroke();
    ctx2d.fillStyle = "#fff";
    for (const pt of h) {
      ctx2d.beginPath();
      ctx2d.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }
  if (ang) {
    // Estimated can axis along the knuckle line, extended a bit each way.
    const [a, b] = ang.canAxis;
    const dx = (b.x - a.x) * 0.8, dy = (b.y - a.y) * 0.8;
    ctx2d.lineWidth = 6;
    ctx2d.strokeStyle = "#22b8cf";
    ctx2d.beginPath();
    ctx2d.moveTo(a.x - dx, a.y - dy);
    ctx2d.lineTo(b.x + dx, b.y + dy);
    ctx2d.stroke();
  }
  if (!p) return;
  const { arm, mouth } = p;
  ctx2d.lineWidth = 4;
  ctx2d.strokeStyle = "#f5b400";
  ctx2d.beginPath();
  ctx2d.moveTo(arm.elbow.x, arm.elbow.y);
  ctx2d.lineTo(arm.wrist.x, arm.wrist.y);
  ctx2d.stroke();
  ctx2d.fillStyle = p.mouthDist < CONFIG.mouthDist ? "#2e9d4f" : "#fff";
  ctx2d.beginPath();
  ctx2d.arc(mouth.x, mouth.y, 8, 0, Math.PI * 2);
  ctx2d.fill();
}

function setState(s) {
  state = s;
  setStateText({
    armed: "Armed — crack it",
    running: "GO GO GO",
    done: "Sent ✔",
  }[s]);
  if (s === "armed") $("timer").textContent = "0.00";
}

function setStateText(t) { $("state").textContent = t; }
