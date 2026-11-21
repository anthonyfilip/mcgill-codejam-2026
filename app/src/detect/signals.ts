import type { HandLandmarkerResult, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'

// Pose landmark indices (MediaPipe BlazePose, 33 points).
const NOSE = 0
const LEFT_EAR = 7
const RIGHT_EAR = 8
const MOUTH_L = 9
const MOUTH_R = 10
const L_SHOULDER = 11
const R_SHOULDER = 12
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

  return { ...base, handToMouth, handsNearMouth, headTilt, handAboveShoulder }
}

export function signalsToCsv(rows: FrameSignals[]): string {
  const cols: (keyof FrameSignals)[] = [
    't',
    'people',
    'handToMouth',
    'handsNearMouth',
    'headTilt',
    'handAboveShoulder',
    'loudnessDb',
    'brightness',
  ]
  const fmt = (v: number | null) => (v === null ? '' : Number.isInteger(v) ? String(v) : v.toFixed(4))
  return [cols.join(','), ...rows.map((r) => cols.map((c) => fmt(r[c])).join(','))].join('\n')
}
