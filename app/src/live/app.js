import {
  FilesetResolver,
  PoseLandmarker,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { fromVertical, handAngles, nearestHand, toPx } from "../detect/angles.ts";
import { refineEnd, confirmedStart } from "../detect/rules.ts"; // shared with the lab, so both time the same way
import { loudestFrame } from "../audio/offline.ts";

// All thresholds in one place. Starting guesses — tune with real cans.
const CONFIG = {
  windowMs: 1500,          // how long a signal light stays on after it fires (display only)
  // Start needs ALL of: the can at the mouth FIRST, then a sound (crack or click), then within
  // drinkConfirmMs the drinking motion — head tips back AND forearm swings toward (or is already
  // near) vertical — with the can still at the mouth. The clock starts at the sound. Holding the
  // can at the mouth alone never starts a run (live test, Sat: it used to). Same as rules.ts.
  crackMouthHoldMs: 150,   // a sound only counts once the can has been at the mouth this long (none before it gets there)
  gapMs: 250,              // tracking dropouts shorter than this don't count as "left the mouth"
  drinkConfirmMs: 1500,    // the drinking motion must show within this long after the sound
  drinkBaseMs: 500,        // baseline = median over this long just before the sound
  drinkHoldMs: 300,        // ...vs the median over the last this-long (≥ 3 frames): the motion must last
  headBackRise: 0.15,      // head tilt rise, shoulder widths (every labelled start rose ≥ 0.22; holding still ~0.05)
  armSwingDeg: 25,         // forearm drop toward vertical (every labelled start ≥ 29°; holding still 10–30°)...
  armUpDeg: 45,            // ...or the forearm already within this of vertical (can held high before the crack)
  // End rule: the 🤙 confirms the end, but the time stops when the can last left the mouth.
  maxBackdateMs: 4000,     // only back-date if the can left the mouth at most this long before the 🤙
  // Wrist lost right after 2+ frames at the mouth = arm/can covering the face at full tilt: still drinking
  // for up to this long (clip 02 ended 1.24 s early without it).
  hiddenHoldMs: 500,
  // Clicks = loudest ~6 ms above 6 kHz (src/detect/cracks.ts clicksFromProfile): catch cracks the
  // loud-crack detector misses. Of several sounds before drinking, the strongest wins (the crack
  // was the strongest click in 7/8 single-person clips).
  clickHighFreqHz: 6000,
  clickFrameS: 256 / 44100, // ~6 ms
  clickDb: 15,             // dB above the median click of the previous crackLookS
  // End = when the head comes forward (head tilt steps down) near when the can left the mouth.
  // Closest signal to the labelled ends (median 0.13 s); visible even when the arm covers the face.
  endSearchBeforeMs: 1500,
  endSearchAfterMs: 500,
  headStepMs: 400,         // compare head tilt this long after vs before each moment
  headStepZ: 2,            // ...the drop must be at least this many standard deviations
  // Crack = sudden bright jump vs the half-second before (same as src/detect/cracks.ts cracksByContrast).
  // Tuned on the 18 labelled clips (8 crack starts, all within 0.5 s) + live laptop-mic recordings
  // (0 false cracks in a noisy no-crack recording; a real Monster crack at ~2 m scored in the thousands).
  crackScore: 4,           // jump (× louder than the last crackLookS) × brightness
  crackMinRms: 0.01,       // ignore anything quieter than this
  crackLookS: 0.5,
  crackHighFreqHz: 3000,
  mouthDist: 0.8,          // wrist-to-mouth distance, in body-scale units (clips: drinking 0.25–0.66, otherwise 1.0–1.4)
  sendHoldMs: 0,           // how long the 🤙 "send it" (shaka) must be held (0 = first frame ends it; was 300)
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

// Phones (touch screen as the main pointer) get the lighter settings below, to stay ≥ 15 fps.
const PHONE = matchMedia("(pointer: coarse)").matches;
// "full" is more accurate than "lite" on small/far-away people, at some speed cost — so laptops
// keep "full" (what the lab's accuracy numbers were measured with) and phones use "lite".
const POSE_MODEL = PHONE
  ? "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
  : "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// Pose landmark indices
const NOSE = 0, EAR_L = 7, EAR_R = 8, MOUTH_L = 9, MOUTH_R = 10, SHOULDER_L = 11, SHOULDER_R = 12;
const ELBOW_L = 13, ELBOW_R = 14, WRIST_L = 15, WRIST_R = 16;

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx2d = canvas.getContext("2d");

let pose, gesture, handCrop, stream, analyser, highAnalyser, clickAnalyser, audioCtx, recorder, chunks = [];
let facing = "user";  // "user" = front camera (mirrored on screen), "environment" = back camera
let mic = null, micTargets = []; // the mic's audio source and the nodes it feeds (re-wired on camera flip)
let wakeLock = null;
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
// mouthFrames / lastSeenAtMouth: consecutive frames with the wrist seen at the mouth (for hiddenHoldMs).
const track = { mouthSince: null, lastMouthAt: -Infinity, angleSince: null, lastAngleAt: -Infinity, mouthFrames: 0, lastSeenAtMouth: -Infinity };
// Recent pose readings { t, headTilt, armAngle } and sounds heard with the can at the mouth { t, db }
// (a loud crack has db = Infinity, so it beats any click).
let headLog = [], sounds = [];
const LOG_MS = 6000;

function resetTrack() {
  track.mouthSince = track.angleSince = null;
  track.lastMouthAt = track.lastAngleAt = track.lastSeenAtMouth = -Infinity;
  track.mouthFrames = 0;
  sounds = [];
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

// A crack at time t counts only if the can has been at the mouth for crackMouthHoldMs by then
// (same as rules.ts heldLongEnough).
function crackCounts(t) {
  return track.mouthSince !== null && t - track.lastMouthAt <= CONFIG.gapMs && t - track.mouthSince >= CONFIG.crackMouthHoldMs;
}

// How long the can has been held at the mouth right now (0 if it isn't).
function mouthHeldMs(now) {
  if (track.mouthSince === null || now - track.lastMouthAt > CONFIG.gapMs) return 0;
  return track.lastMouthAt - track.mouthSince;
}

$("arm").onclick = async () => {
  $("arm").disabled = true;
  // iPhone: audio only runs if the AudioContext is created/resumed inside the tap itself, before
  // any await — otherwise it stays suspended and no crack is ever heard.
  audioCtx ??= new AudioContext();
  audioCtx.resume();
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
  keepAwake(true);
};

// Switch front ↔ back camera (not mid-run: the recording uses the current camera).
$("flip").onclick = async () => {
  if (state === "running") return;
  facing = facing === "user" ? "environment" : "user";
  $("stage").classList.toggle("mirror", facing === "user");
  if (!stream) return; // the camera opens on GET SENDY!, with the side chosen here
  $("flip").disabled = true;
  try {
    await openCamera();
  } catch (err) {
    setStateText(`Couldn't switch camera: ${err.message}`);
  }
  $("flip").disabled = false;
};

// 🔦 Light for night chugs, on from GET SENDY! until the run ends. Back camera: the phone's
// flashlight ("torch", W3C Image Capture spec) where the browser can switch it (track capability
// `torch`; Android Chrome — iPhones usually can't). Front camera (no flash): the page around the
// camera view turns white, like a ring light. The choice is remembered on this device.
let lightOn = false;
try { lightOn = localStorage.getItem("tracker.light") === "on"; } catch { /* storage blocked */ }

function canTorch() {
  const track = stream?.getVideoTracks()[0];
  const t = track?.getCapabilities?.().torch;
  return Array.isArray(t) ? t.includes(true) : !!t;
}

function applyLight() {
  $("light").classList.toggle("on", lightOn);
  const want = lightOn && !!stream && (state === "armed" || state === "running");
  const torch = facing === "environment" && canTorch();
  if (torch) stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: want }] }).catch(() => {});
  document.body.classList.toggle("screen-light", want && facing === "user");
  if (want && facing === "environment" && !torch) setStateText("No flashlight in this browser — turn the room lights on");
}

$("light").onclick = () => {
  lightOn = !lightOn;
  try { localStorage.setItem("tracker.light", lightOn ? "on" : "off"); } catch { /* storage blocked */ }
  applyLight();
};
$("light").classList.toggle("on", lightOn);

// Open (or re-open) the camera + mic on the chosen side, and re-wire the mic into the audio graph.
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera needs a secure (https) page");
  stream?.getTracks().forEach((t) => t.stop()); // phones can't open two cameras at once
  stream = await navigator.mediaDevices.getUserMedia({
    // Ask for HD: someone across the room needs the pixels. The browser falls back if unsupported.
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
    // Raw audio: noise suppression would eat the crack transient.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  video.srcObject = stream;
  await video.play();
  fitStage();
  if (audioCtx && micTargets.length) {
    mic?.disconnect();
    mic = audioCtx.createMediaStreamSource(stream);
    for (const node of micTargets) mic.connect(node);
  }
  applyLight(); // a new camera track starts with its flashlight off
}

// The camera view takes the camera's own shape (portrait on a phone held upright), and the
// overlay matches its pixels. Runs again if the phone rotates (the video's size changes).
function fitStage() {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  canvas.width = w;
  canvas.height = h;
  $("stage").style.setProperty("--w", w);
  $("stage").style.setProperty("--h", h);
}
video.addEventListener("resize", fitStage);

// Keep the screen on while waiting for / timing a run (phones dim and lock otherwise).
async function keepAwake(on) {
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock?.request("screen");
      wakeLock?.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch { /* not supported or refused — the run still works */ }
}
// The lock is dropped when the page is hidden; take it again on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (state === "armed" || state === "running")) keepAwake(true);
});

async function setup() {
  setStateText("Loading models…");
  await openCamera();

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  // Same mic through a steep high-pass (two filters), to measure how "bright" the sound is.
  const hp1 = audioCtx.createBiquadFilter(), hp2 = audioCtx.createBiquadFilter();
  for (const hp of [hp1, hp2]) { hp.type = "highpass"; hp.frequency.value = CONFIG.crackHighFreqHz; }
  highAnalyser = audioCtx.createAnalyser();
  highAnalyser.fftSize = 2048;
  highAnalyser.smoothingTimeConstant = 0;
  hp1.connect(hp2).connect(highAnalyser);
  // And through a 6 kHz high-pass for clicks. A bigger buffer (~90 ms) so no audio is lost between
  // polls when a slow video frame delays the 20 ms timer.
  const hp3 = audioCtx.createBiquadFilter(), hp4 = audioCtx.createBiquadFilter();
  for (const hp of [hp3, hp4]) { hp.type = "highpass"; hp.frequency.value = CONFIG.clickHighFreqHz; }
  clickAnalyser = audioCtx.createAnalyser();
  clickAnalyser.fftSize = 4096;
  clickAnalyser.smoothingTimeConstant = 0;
  hp3.connect(hp4).connect(clickAnalyser);
  micTargets = [analyser, hp1, hp3];
  mic = audioCtx.createMediaStreamSource(stream);
  for (const node of micTargets) mic.connect(node);

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
  checkClick(t, look);
  if (isCrack && state === "armed" && t - seen.crack > 300) { // one crack = one event, not every 20 ms poll
    seen.crack = t;
    // Sequence rule: the crack must happen with the can already at the mouth for crackMouthHoldMs.
    // A crack with the can elsewhere (or someone else's can) is ignored. It starts the run only once
    // the drinking motion follows (loop() → confirmedStart).
    const atMouthNow = crackCounts(t);
    live.crackLog = [{ t, rms, ratio: jump, high: highShare, score, atMouth: atMouthNow }, ...(live.crackLog ?? [])].slice(0, 5);
    if (atMouthNow) addSound(t, Infinity);
    else live.ignoredCrack = t;
  }
  live.rms = rms; live.jump = jump; live.highShare = highShare; live.crackScore = score;
  live.peakScore = Math.max(score, (live.peakScore ?? 0) * 0.97); // decays, so a brief pop stays readable
}

// Clicks (same as the lab's sound profile "click" + clicksFromProfile): the loudest ~6 ms above
// 6 kHz in the audio that arrived since the last poll, in dB above the median of the previous
// crackLookS of polls. Kept only with the can at the mouth for crackMouthHoldMs; once the drinking
// motion follows, the strongest sound starts the run (confirmedStart).
const clickBuf = new Float32Array(4096);
const recentClick = [];
let lastPollAt = null;

function addSound(t, db) {
  sounds.push({ t, db });
  while (sounds.length && t - sounds[0].t > LOG_MS) sounds.shift();
}

function checkClick(t, look) {
  clickAnalyser.getFloatTimeDomainData(clickBuf);
  const sr = audioCtx.sampleRate;
  const fresh = lastPollAt === null ? Math.round(0.02 * sr) : Math.min(clickBuf.length, Math.round(((t - lastPollAt) / 1000) * sr));
  lastPollAt = t;
  const { e, end } = loudestFrame(clickBuf, clickBuf.length - fresh, clickBuf.length, Math.round(CONFIG.clickFrameS * sr));
  const db = recentClick.length >= look ? 10 * Math.log10((e + 1e-12) / (median(recentClick) + 1e-12)) : 0;
  recentClick.push(e);
  if (recentClick.length > look) recentClick.shift();
  const at = t - ((clickBuf.length - end) / sr) * 1000; // when the click happened, not when we polled
  if (db >= CONFIG.clickDb && crackCounts(at)) addSound(at, db);
  live.clickDb = db;
  live.peakClick = Math.max(db, (live.peakClick ?? 0) * 0.97);
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
  // Same forearm angle without the "hand raised" condition (src/detect/signals.ts armAngle):
  // for the drinking-motion check, which compares it before vs after the crack.
  const armAngle = fromVertical(arm.elbow, arm.wrist);
  return { arm, mouth, mouthDist, angle, armAngle, scale, nose: px(lm[NOSE]) };
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

let frameNo = 0, lastFrameAt = null;

// Runs every animation frame and ALWAYS schedules the next one. A camera flip stops the old
// camera before the new one has a picture; MediaPipe throwing on such an empty frame used to end
// the loop for good (phone test, Sat: tracking stopped after 🔄). Empty frames are now skipped and
// any error is shown in the debug panel instead of killing tracking.
function loop() {
  try {
    if (video.readyState >= 2 && video.videoWidth > 0) frame();
  } catch (err) {
    live.loopError = `${new Date().toLocaleTimeString()} ${err?.message ?? err}`;
    console.error("tracker frame failed", err);
  }
  requestAnimationFrame(loop);
}

function frame() {
  const now = performance.now();
  if (lastFrameAt !== null) live.fps = 0.9 * (live.fps ?? 0) + 0.1 * (1000 / Math.max(1, now - lastFrameAt));
  lastFrameAt = now;
  frameNo++;
  const res = pose.detectForVideo(video, now);
  const lm = res.landmarks[0];
  const p = lm ? readPose(lm) : null;

  const seenAtMouth = !!p && p.mouthDist < CONFIG.mouthDist;
  if (p) {
    track.mouthFrames = seenAtMouth ? track.mouthFrames + 1 : 0;
    if (track.mouthFrames >= 2) track.lastSeenAtMouth = now;
  }
  const hidden = !p && now - track.lastSeenAtMouth <= CONFIG.hiddenHoldMs; // arm/can covering the face
  const atMouth = seenAtMouth || hidden;
  const armUp = !!p && p.armAngle <= CONFIG.armUpDeg; // display only: the "Angle" light

  // Head tilt = how far the ears sit below the nose, in shoulder widths (src/detect/signals.ts headTilt).
  // Drops when the head comes forward after drinking — used to time the end.
  let headTilt = null;
  if (lm) {
    const W = canvas.width, H = canvas.height;
    const shoulderPx = Math.hypot((lm[SHOULDER_L].x - lm[SHOULDER_R].x) * W, (lm[SHOULDER_L].y - lm[SHOULDER_R].y) * H);
    if (shoulderPx > 0) headTilt = ((lm[EAR_L].y + lm[EAR_R].y) / 2 - lm[NOSE].y) * H / shoulderPx;
  }
  headLog.push({ t: now, headTilt, armAngle: p?.armAngle ?? null });
  while (headLog.length && now - headLog[0].t > LOG_MS) headLog.shift();
  live.headTilt = headTilt;
  updateStretch(atMouth, now, "mouthSince", "lastMouthAt");
  if (state === "armed") {
    if (atMouth) seen.mouth = now;
    if (armUp) seen.angle = now;
  }

  // Start: a sound (crack/click) was heard with the can at the mouth (checkCrack/checkClick), and now
  // the drinking motion has followed with the can still at the mouth → start at the strongest sound.
  if (state === "armed" && atMouth) {
    const s = confirmedStart(sounds, headLog, now, CONFIG);
    if (s !== null) {
      const loud = sounds.find((x) => x.t === s)?.db === Infinity;
      startRun(s, [loud ? "crack" : "click (crack)", "can at mouth", "head back + arm up"]);
    }
  }

  // Read the hand while armed too, so the 🤙 light can be tested before a run starts.
  // Only the "running" state acts on the 🤙. The hand model is the heavy part, so on phones it
  // runs every frame only during a run, every 4th frame while armed, and not at all otherwise
  // (the start uses only the pose + sound). Laptops keep it on every frame.
  let send = false;
  let ang = null; // arm / hand / wrist / can angles for the drinking hand
  let handsPx = [];
  const wantHands = !PHONE || state === "running" || (state === "armed" && frameNo % 4 === 0);
  if (wantHands) {
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
        run.sendAt ??= sendSince; // remember the 🤙 even if the hand drops before we finish below
      }
    }
    if (run.sendAt != null && atMouth) run.sendAt = null; // went back to drinking
    if (run.sendAt != null) {
      // End = when the head came forward near the last moment the can was at the mouth, if that
      // was recent; otherwise the 🤙 itself. Wait until there's enough head tilt after it to search.
      const lastMouth = track.lastMouthAt;
      const backdate = lastMouth > run.startAt + CONFIG.minRunMs && run.sendAt - lastMouth <= CONFIG.maxBackdateMs;
      if (!backdate) endRun(run.sendAt, "🤙 (can not tracked)");
      else if (now - lastMouth >= CONFIG.endSearchAfterMs + CONFIG.headStepMs) {
        const end = Math.max(refineEnd(headLog, lastMouth, CONFIG), run.startAt + CONFIG.minRunMs);
        endRun(end, end === lastMouth ? "can left mouth (🤙 confirmed)" : "head came forward (🤙 confirmed)");
      } else {
        // 🤙 seen: stop the clock on screen NOW, at the moment the can left the mouth (phone test,
        // Sat: it kept counting for up to 0.9 s). The head-tilt search above finishes a moment later
        // and may nudge the final time.
        $("timer").textContent = ((lastMouth - run.startAt) / 1000).toFixed(2);
        setStateText("🤙 Got it!");
      }
    }
    if (state === "running" && run.sendAt == null) $("timer").textContent = ((now - run.startAt) / 1000).toFixed(2);
  }

  draw(p, ang, handsPx, send);
  for (const k of ["crack", "angle", "mouth"]) {
    $(`sig-${k}`).classList.toggle("on", state === "armed" && now - seen[k] <= CONFIG.windowMs);
  }
  $("sig-send").classList.toggle("on", send);
  const shoulderPx = lm ? Math.hypot((lm[SHOULDER_L].x - lm[SHOULDER_R].x) * canvas.width, (lm[SHOULDER_L].y - lm[SHOULDER_R].y) * canvas.height) : null;
  $("debug").textContent =
    `state ${state} · ${live.fps?.toFixed(0) ?? "-"} fps · ${PHONE ? "phone (lite pose model)" : "laptop (full pose model)"} · ${facing === "user" ? "front" : "back"} camera\n` +
    `camera ${video.videoWidth}×${video.videoHeight} · person ${shoulderPx ? `${shoulderPx.toFixed(0)} px shoulders` : "not found"} · hands via ${live.handMode ?? "-"}\n` +
    `audio rms ${live.rms?.toFixed(3)} · jump ×${live.jump?.toFixed(1)} · bright ${live.highShare?.toFixed(2)} · crack score ${live.crackScore?.toFixed(1)} (recent peak ${live.peakScore?.toFixed(1)}, need ${CONFIG.crackScore})\n` +
    `click ${live.clickDb?.toFixed(0) ?? "-"} dB (recent peak ${live.peakClick?.toFixed(0) ?? "-"}, need ${CONFIG.clickDb}) · sounds at mouth (waiting for head back + arm up): ${sounds.length}\n` +
    `angle ${p?.angle?.toFixed(0) ?? "-"}°  mouth ${p?.mouthDist?.toFixed(2) ?? "-"}${hidden ? " (hidden — holding)" : ""}  head tilt ${live.headTilt?.toFixed(2) ?? "-"}\n` +
    `drinking hand: ${ang ? `arm ${ang.arm?.toFixed(0) ?? "-"}° · hand ${ang.hand.toFixed(0)}° · wrist bend ${ang.wristFlex?.toFixed(0) ?? "-"}° · can ~${ang.can.toFixed(0)}° from upright` : "not matched"}\n` +
    `at mouth for ${(mouthHeldMs(now) / 1000).toFixed(1)}s` +
    `${now - (live.ignoredCrack ?? -Infinity) < 2000 ? `  · crack IGNORED (can not at mouth for ${CONFIG.crackMouthHoldMs / 1000} s)` : ""}\n` +
    `cracks heard: ${(live.crackLog ?? []).map((c) => `${((now - c.t) / 1000).toFixed(1)}s ago score ${c.score.toFixed(0)} (×${c.ratio.toFixed(1)}, bright ${c.high.toFixed(2)})${c.atMouth ? " @mouth" : ""}`).join(" · ") || "none"}\n` +
    `hand ${fingerText(live.fingers)}  🤙 ${send ? "YES" : "no"}` +
    (live.loopError ? `\nlast tracking error: ${live.loopError}` : "");
}

function startRun(startAt, startedBy) {
  if (state !== "armed") return; // crack (audio timer) and the video loop can both try to start
  run = { startAt, startedBy, angles: [], hand: [] }; // hand: per-frame hand/wrist/can angles
  chunks = [];
  // mp4 first when the browser can record it (Safari always; recent Chrome too): it plays on every
  // phone, while webm clips don't play on older iPhones in the feed.
  const mimeType = ["video/mp4", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = showClip;
  recorder.start();
  setState("running");
  $("flip").disabled = true;
  navigator.vibrate?.(150); // Android only; iPhones ignore it
}

function endRun(endAt, endedBy) {
  run.timeMs = endAt - run.startAt;
  run.endedBy = endedBy;
  recorder.stop();
  setState("done");
  $("flip").disabled = false;
  keepAwake(false);
  navigator.vibrate?.([80, 60, 80]);
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
  $("download").download = `shotgun.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
  // Hand the finished run to the feed (src/feed/share.ts opens the results page).
  const a = run.angles;
  window.dispatchEvent(new CustomEvent("run:finished", {
    detail: { timeMs: run.timeMs, maxAngle: a.length ? Math.round(Math.max(...a)) : null, startedBy: run.startedBy, clip: blob },
  }));
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
  applyLight(); // 🔦 on while armed/running, off once the run is done
}

function setStateText(t) { $("state").textContent = t; }
