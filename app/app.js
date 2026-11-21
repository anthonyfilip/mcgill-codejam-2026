import {
  FilesetResolver,
  PoseLandmarker,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// All thresholds in one place. Starting guesses — tune with real cans.
const CONFIG = {
  windowMs: 1500,          // 2 of 3 signals must be true within this window
  crackRatio: 6,           // crack RMS must be this many times the background RMS
  crackMinRms: 0.02,       // ...and at least this loud in absolute terms
  crackHighFreqShare: 0.45,// share of spectral energy above crackHighFreqHz
  crackHighFreqHz: 3000,
  angleDeg: 60,            // forearm tilt from vertical that counts as "can tipped"
  mouthDist: 0.6,          // wrist-to-mouth distance, in body-scale units
  sendHoldMs: 300,         // how long the 🤘 must be held above the head
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
  if (isCrack && state === "armed") seen.crack = performance.now();
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
  return { arm, mouth, mouthDist, angle, nose: px(lm[NOSE]) };
}

// ---------- End: 🤘 above the head (gesture) ----------

function readSend(result, noseY) {
  for (let i = 0; i < result.gestures.length; i++) {
    const g = result.gestures[i][0];
    const wristY = result.landmarks[i][0].y * canvas.height;
    if (g?.categoryName === "ILoveYou" && wristY < noseY) return true;
  }
  return false;
}

// ---------- Main loop ----------

function loop() {
  const now = performance.now();
  const res = pose.detectForVideo(video, now);
  const lm = res.landmarks[0];
  const p = lm ? readPose(lm) : null;

  if (p && state === "armed") {
    if (p.mouthDist < CONFIG.mouthDist) seen.mouth = now;
    if (p.angle !== null && p.angle >= CONFIG.angleDeg) seen.angle = now;
  }

  // Start: any 2 of 3 signals within the window.
  const active = Object.keys(seen).filter((k) => now - seen[k] <= CONFIG.windowMs);
  if (state === "armed" && active.length >= 2) {
    // If the crack is one of them, the clock starts at the crack.
    const startAt = active.includes("crack") ? seen.crack : now;
    startRun(startAt, active);
  }

  let send = false;
  if (state === "running") {
    if (p?.angle != null) run.angles.push(p.angle);
    send = readSend(gesture.recognizeForVideo(video, now), p ? p.nose.y : 0);
    if (send) sendSince ??= now;
    else sendSince = null;
    if (sendSince !== null && now - sendSince >= CONFIG.sendHoldMs && sendSince - run.startAt >= CONFIG.minRunMs) {
      endRun(sendSince);
    }
    $("timer").textContent = ((now - run.startAt) / 1000).toFixed(2);
  }

  draw(p);
  for (const k of ["crack", "angle", "mouth"]) {
    $(`sig-${k}`).classList.toggle("on", state === "armed" && now - seen[k] <= CONFIG.windowMs);
  }
  $("sig-send").classList.toggle("on", send);
  $("debug").textContent =
    `state ${state}\n` +
    `audio rms ${live.rms?.toFixed(3)} bg ${live.bgRms?.toFixed(3)} (×${(live.rms / live.bgRms).toFixed(1)}) high ${live.highShare?.toFixed(2)}\n` +
    `angle ${p?.angle?.toFixed(0) ?? "-"}°  mouth ${p?.mouthDist?.toFixed(2) ?? "-"}`;

  requestAnimationFrame(loop);
}

function startRun(startAt, startedBy) {
  run = { startAt, startedBy, angles: [] };
  chunks = [];
  const mimeType = ["video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = showClip;
  recorder.start();
  setState("running");
}

function endRun(endAt) {
  run.timeMs = endAt - run.startAt;
  recorder.stop();
  setState("done");
  const a = run.angles;
  $("r-time").textContent = (run.timeMs / 1000).toFixed(2);
  $("timer").textContent = (run.timeMs / 1000).toFixed(2);
  $("r-max").textContent = a.length ? Math.max(...a).toFixed(0) : "-";
  $("r-avg").textContent = a.length ? (a.reduce((s, x) => s + x, 0) / a.length).toFixed(0) : "-";
  $("r-by").textContent = run.startedBy.join(" + ");
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

function draw(p) {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
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
