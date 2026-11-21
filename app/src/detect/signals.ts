import type { HandLandmarkerResult, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { fromVertical, handAngles, nearestHand, toPx } from './angles'

// Pose landmark indices (MediaPipe BlazePose, 33 points).
const NOSE = 0
const LEFT_EAR = 7
const RIGHT_EAR = 8
const MOUTH_L = 9
const MOUTH_R = 10
const L_SHOULDER = 11
const R_SHOULDER = 12
const L_ELBOW = 13
const R_ELBOW = 14
const L_WRIST = 15
const R_WRIST = 16
const L_INDEX = 19
const R_INDEX = 20

/** One row per processed frame. Distances are in shoulder-widths so they don't
 *  depend on how far the person is from the camera. null = person not found. */
export interface FrameSignals {
  t: number // seconds into the clip
  people: number // poses detected this frame
  handToMouth: number | null // closest wrist/index fingertip to the mouth
  handsNearMouth: number // hand-tracker hands within 1 shoulder-width of the mouth
  headTilt: number | null // (ear height − nose height); rises when the head tips back
  handAboveShoulder: number | null // how far the higher wrist is above the shoulders
  // Drinking arm = the arm whose wrist is closest to the mouth. Degrees from straight up.
  armAngle: number | null // forearm elbow→wrist
  handAngle: number | null // hand wrist→middle knuckle
  wristFlex: number | null // bend between forearm and hand (0 = straight)
  canAngle: number | null // estimated can tilt from upright, from the knuckle line (0–90)
  // Exactly what the LIVE tracker (src/live/app.js readPose) measures, so clip scores match live behaviour:
  liveMouthDist: number | null // drinking wrist → mouth ÷ max(shoulder width, neck length)
  liveAngle: number | null // drinking forearm from vertical, only when that wrist is above its shoulder
  loudnessDb: number
  brightness: number
}

const dist = (a: NormalizedLandmark, b: NormalizedLandmark, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y)

/** The contestant = the biggest person in frame (widest shoulders → closest to camera). */
export function pickContestant(pose: PoseLandmarkerResult, aspect: number): NormalizedLandmark[] | null {
  let best: NormalizedLandmark[] | null = null
  let bestWidth = 0
  for (const lm of pose.landmarks) {
    const w = dist(lm[L_SHOULDER], lm[R_SHOULDER], aspect)
    if (w > bestWidth) {
      bestWidth = w
      best = lm
    }
  }
  return best
}

export function computeSignals(
  t: number,
  pose: PoseLandmarkerResult,
  hands: HandLandmarkerResult,
  aspect: number, // video width / height, so x and y distances are comparable
  loudnessDb: number,
  brightness: number,
): FrameSignals {
  const base: FrameSignals = {
    t,
    people: pose.landmarks.length,
    handToMouth: null,
    handsNearMouth: 0,
    headTilt: null,
    handAboveShoulder: null,
    armAngle: null,
    handAngle: null,
    wristFlex: null,
    canAngle: null,
    liveMouthDist: null,
    liveAngle: null,
    loudnessDb,
    brightness,
  }
  const lm = pickContestant(pose, aspect)
  if (!lm) return base

  const shoulderW = Math.max(dist(lm[L_SHOULDER], lm[R_SHOULDER], aspect), 1e-3)
  const mouth: NormalizedLandmark = {
    x: (lm[MOUTH_L].x + lm[MOUTH_R].x) / 2,
    y: (lm[MOUTH_L].y + lm[MOUTH_R].y) / 2,
    z: 0,
    visibility: 1,
  }

  const handPoints = [L_WRIST, R_WRIST, L_INDEX, R_INDEX].map((i) => lm[i])
  const handToMouth = Math.min(...handPoints.map((p) => dist(p, mouth, aspect))) / shoulderW

  let handsNearMouth = 0
  for (const hand of hands.landmarks) {
    const closest = Math.min(...hand.map((p) => dist(p, mouth, aspect))) / shoulderW
    if (closest < 1) handsNearMouth++
  }

  const earY = (lm[LEFT_EAR].y + lm[RIGHT_EAR].y) / 2
  const headTilt = (earY - lm[NOSE].y) / shoulderW

  const shoulderY = (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2
  const wristY = Math.min(lm[L_WRIST].y, lm[R_WRIST].y)
  const handAboveShoulder = (shoulderY - wristY) / shoulderW

  // Angles: work in "pixels" scaled by aspect so x and y distances are comparable.
  const P = (p: NormalizedLandmark) => ({ x: p.x * aspect, y: p.y })
  const leftCloser = dist(lm[L_WRIST], mouth, aspect) <= dist(lm[R_WRIST], mouth, aspect)
  const elbow = P(lm[leftCloser ? L_ELBOW : R_ELBOW])
  const wrist = P(lm[leftCloser ? L_WRIST : R_WRIST])
  const handsPx = hands.landmarks.map((h) => toPx(h, aspect, 1))
  const i = nearestHand(handsPx, wrist, shoulderW) // hand must be within one shoulder-width of the pose wrist
  const a = i >= 0 ? handAngles(handsPx[i], elbow, wrist) : null
  const angles = {
    armAngle: fromVertical(elbow, wrist), // pose alone is enough for the arm
    handAngle: a?.hand ?? null,
    wristFlex: a?.wristFlex ?? null,
    canAngle: a?.can ?? null,
  }

  // Live-tracker definitions (mirror src/live/app.js readPose).
  const sL = P(lm[L_SHOULDER]), sR = P(lm[R_SHOULDER])
  const mouthP = P(mouth)
  const neck = Math.hypot(mouthP.x - (sL.x + sR.x) / 2, mouthP.y - (sL.y + sR.y) / 2)
  const liveScale = Math.max(Math.hypot(sL.x - sR.x, sL.y - sR.y), neck) || 1e-3
  const liveMouthDist = Math.hypot(wrist.x - mouthP.x, wrist.y - mouthP.y) / liveScale
  const drinkShoulder = leftCloser ? sL : sR
  const liveAngle = wrist.y < drinkShoulder.y ? fromVertical(elbow, wrist) : null

  return { ...base, handToMouth, handsNearMouth, headTilt, handAboveShoulder, ...angles, liveMouthDist, liveAngle }
}

export function signalsToCsv(rows: FrameSignals[]): string {
  const cols: (keyof FrameSignals)[] = [
    't',
    'people',
    'handToMouth',
    'handsNearMouth',
    'headTilt',
    'handAboveShoulder',
    'armAngle',
    'handAngle',
    'wristFlex',
    'canAngle',
    'liveMouthDist',
    'liveAngle',
    'loudnessDb',
    'brightness',
  ]
  const fmt = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : v.toFixed(4))
  return [cols.join(','), ...rows.map((r) => cols.map((c) => fmt(r[c])).join(','))].join('\n')
}
