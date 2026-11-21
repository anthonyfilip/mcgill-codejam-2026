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
  mouthHoldMs: 300,        // can at the mouth at least this long before a crack counts
  gapMs: 250,              // tracking dropouts shorter than this don't count as "left the mouth"
  visualStartMs: 800,      // fallback if no crack is heard: can at mouth AND tipped for this long
  // End rule: the 🤙 confirms the end, but the time stops when the can last left the mouth.
  maxBackdateMs: 4000,     // only back-date if the can left the mouth at most this long before the 🤙
  crackRatio: 6,           // crack RMS must be this many times the background RMS
  crackMinRms: 0.02,       // ...and at least this loud in absolute terms
  crackHighFreqShare: 0.45,// share of spectral energy above crackHighFreqHz
  crackHighFreqHz: 3000,
  angleDeg: 35,            // forearm tilt from vertical that counts as "can tipped" (live: drinking ≈ 40–47°)
  mouthDist: 0.6,          // wrist-to-mouth distance, in body-scale units
  sendHoldMs: 300,         // how long the 🤙 "send it" (shaka) must be held
  sendAboveHead: false,    // false = a shaka anywhere in frame ends the run (true = must be above the nose)
  thumbOutRatio: 0.4,      // thumb tip → index knuckle distance, in palm lengths (live: shaka ~0.55, but a fist is similar)
  thumbBendDeg: 35,        // ...and the thumb must be straight. Live: shaka 4–21°, fist with thumb wrapped 51–61°.
                           // Thumbs-up has a straight thumb too — it's rejected because the pinky is curled (~100°).
  fingerBendDeg: 60,       // a finger bent more than this (knuckle→joint vs joint→tip, in 3D) counts as curled
  minRunMs: 1000,          // ignore the end gesture right after the start
  minVisibility: 0.5,      // pose landmark confidence
};

const POSE_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const GESTURE_MODEL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// Pose landmark indices
const NOSE = 0, MOUTH_L = 9, MOUTH_R = 10, SHOULDER_L = 11, SHOULDER_R = 12;
const ELBOW_L = 13, ELBOW_R = 14, WRIST_L = 15, WRIST_R = 16;

const $ = (id) => document.getElementById(id);
const video = $("video"), canvas = $("overlay"), ctx2d = canvas.getContext("2d");

let pose, gesture, stream, analyser, audioCtx, recorder, chunks = [];
let state = "idle"; // idle → armed → running → done

// Last time each start signal was true (ms, performance.now()).
const seen = { crack: -Infinity, angle: -Infinity, mouth: -Infinity };
let bgRms = 0.01;
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
    video: { facingMode: "user", width: 640, height: 480 },
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
  audioCtx.createMediaStreamSource(stream).connect(analyser);

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

  // Audio runs on its own timer so a slow video frame doesn't hide a crack.
  setInterval(checkCrack, 20);
  requestAnimationFrame(loop);
}

// ---------- Signal 1: crack (microphone) ----------

const timeBuf = new Float32Array(2048);
const freqBuf = new Float32Array(1024);

function checkCrack() {
  analyser.getFloatTimeDomainData(timeBuf);
  let sum = 0;
  for (const s of timeBuf) sum += s * s;
  const rms = Math.sqrt(sum / timeBuf.length);

  analyser.getFloatFrequencyData(freqBuf);
  const hzPerBin = audioCtx.sampleRate / analyser.fftSize;
  let total = 0, high = 0;
  for (let i = 0; i < freqBuf.length; i++) {
    const p = Math.pow(10, freqBuf[i] / 10);
    total += p;
    if (i * hzPerBin >= CONFIG.crackHighFreqHz) high += p;
  }
  const highShare = total > 0 ? high / total : 0;

  const isCrack = rms > CONFIG.crackMinRms && rms > bgRms * CONFIG.crackRatio && highShare > CONFIG.crackHighFreqShare;
  if (isCrack && state === "armed") {
    const now = performance.now();
    seen.crack = now;
    // Sequence rule: a crack only starts the run if the can was ALREADY at the mouth.
    // A crack with the can elsewhere (or someone else's can) is ignored.
    if (mouthHeldMs(now) >= CONFIG.mouthHoldMs) startRun(now, ["can at mouth", "crack"]);
    else live.ignoredCrack = now;
  }
  // Only learn the background from non-spikes.
  if (rms < bgRms * 2) bgRms = bgRms * 0.98 + rms * 0.02;

  live.rms = rms; live.bgRms = bgRms; live.highShare = highShare;
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

function readSend(result, noseY) {
  let fingers = null;
  for (let i = 0; i < result.landmarks.length; i++) {
    const hand = result.landmarks[i];
    // 3D world landmarks when available; otherwise image landmarks (their z is a rough depth).
    const { shaka, ext, bend } = readShaka(result.worldLandmarks?.[i] ?? hand);
    fingers = { ...ext, bend };
    const wristY = hand[WRIST].y * canvas.height;
    const highEnough = !CONFIG.sendAboveHead || wristY < noseY;
    if (shaka && highEnough) return { send: true, fingers };
  }
  return { send: false, fingers };
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
  let send = false;
  let ang = null; // arm / hand / wrist / can angles for the drinking hand
  if (state === "armed" || state === "running") {
    const g = gesture.recognizeForVideo(video, now);
    const r = readSend(g, p ? p.nose.y : 0);
    send = r.send;
    live.fingers = r.fingers;
    // Match a tracked hand to the pose's drinking arm, then measure its angles.
    if (p) {
      const hands = g.landmarks.map((h) => toPx(h, canvas.width, canvas.height));
      const i = nearestHand(hands, p.arm.wrist, p.scale);
      if (i >= 0) ang = handAngles(hands[i], p.arm.elbow, p.arm.wrist);
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

  draw(p, ang);
  for (const k of ["crack", "angle", "mouth"]) {
    $(`sig-${k}`).classList.toggle("on", state === "armed" && now - seen[k] <= CONFIG.windowMs);
  }
  $("sig-send").classList.toggle("on", send);
  $("debug").textContent =
    `state ${state}\n` +
    `audio rms ${live.rms?.toFixed(3)} bg ${live.bgRms?.toFixed(3)} (×${(live.rms / live.bgRms).toFixed(1)}) high ${live.highShare?.toFixed(2)}\n` +
    `angle ${p?.angle?.toFixed(0) ?? "-"}°  mouth ${p?.mouthDist?.toFixed(2) ?? "-"}\n` +
    `drinking hand: ${ang ? `arm ${ang.arm?.toFixed(0) ?? "-"}° · hand ${ang.hand.toFixed(0)}° · wrist bend ${ang.wristFlex?.toFixed(0) ?? "-"}° · can ~${ang.can.toFixed(0)}° from upright` : "not matched"}\n` +
    `at mouth for ${(mouthHeldMs(now) / 1000).toFixed(1)}s (need ${CONFIG.mouthHoldMs / 1000}s before crack)` +
    `${now - (live.ignoredCrack ?? -Infinity) < 2000 ? "  · crack IGNORED (can not at mouth)" : ""}\n` +
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

function draw(p, ang) {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
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
