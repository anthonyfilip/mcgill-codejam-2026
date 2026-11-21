// The live tracker's start/end rules (src/live/app.js), as a pure function over recorded
// clip signals, so they can be scored against Chug_Examples/labels.csv.
// KEEP IN SYNC with CONFIG and loop()/checkCrack() in src/live/app.js.
//
// One difference: party clips have no 🤙. Live, the 🤙 only *confirms* the end and the
// time is back-dated to when the can last left the mouth — so here the end is "the can
// left the mouth and didn't come back for leaveMs", which is the time live would report.

import type { Crack } from '../audio/offline'
import type { FrameSignals } from './signals'

export const RULES = {
  // from src/live/app.js CONFIG
  mouthDist: 0.8, // tuned on the 18 labelled clips (was 0.6: cut through the middle of real drinking)
  angleDeg: 0, // i.e. just "hand raised above the shoulder" — arm angle didn't separate drinking from not
  gapMs: 250,
  crackMouthHoldMs: 150, // a crack only counts once the can has been at the mouth this long (no cracks before it gets there)
  visualStartMs: 800,
  minRunMs: 1000,
  // Crack = sudden bright jump vs the half-second before (src/detect/cracks.ts cracksByContrast).
  // Tuned on the 18 clips: 8 runs started by a crack, all within 0.5 s; 0 false cracks in a
  // live laptop-mic room recording; a real Monster crack at ~2 m scored in the thousands.
  crackScore: 4,
  crackMinRms: 0.01,
  crackLookS: 0.5,
  crackHighFreqHz: 3000,
  // old detector (cracksFromProfile), kept for comparison
  crackRatio: 6,
  crackHighFreqShare: 0.45,
  // Wrist lost right after 2+ frames at the mouth = the arm/can is covering the face (full tilt):
  // still drinking for up to this long. Clip 02 ended 1.24 s early without it.
  hiddenHoldMs: 500,
  // No loud crack: the visual start says roughly when, so look for a quieter crack just before it.
  // A lower bar is only safe in this small window (everywhere, it started 03 and 17 seconds early).
  softCrackScore: 2,
  softCrackBeforeMs: 1500,
  softCrackAfterMs: 300,
  // End = when the head comes forward (head tilt steps down), searched around the moment the can
  // left the mouth. Head tilt was the closest signal to the labelled ends (median 0.13 s) and stays
  // visible when the arm covers the face.
  endSearchBeforeMs: 1500,
  endSearchAfterMs: 500,
  headStepMs: 400, // compare the head tilt this long after vs before each moment
  headStepZ: 2, // ...the drop must be at least this many standard deviations
  // clip-only: how long the can must stay away from the mouth to count as finished
  leaveMs: 800, // tuned on the labelled clips
}
export type Rules = typeof RULES

export interface Detection {
  start: number | null // seconds
  startBy: string
  end: number | null
  endBy: string
  ignoredCracks: number // cracks heard with the can not at the mouth
}

type Sample = { t: number; headTilt: number | null } // t in ms
type SoftCrack = { t: number; score: number } // t in ms
type EndRules = Pick<Rules, 'endSearchBeforeMs' | 'endSearchAfterMs' | 'headStepMs' | 'headStepZ'>
type SoftRules = Pick<Rules, 'softCrackBeforeMs' | 'softCrackAfterMs'>

/** Shared with the live tracker. Moves the end to where the head tilt drops most sharply near
 *  `end` (the head coming forward). Returns `end` unchanged if there's no clear drop. */
export function refineEnd(samples: Sample[], end: number, R: EndRules): number {
  const s = samples.filter((x): x is { t: number; headTilt: number } => x.headTilt !== null)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const sd = (a: number[]) => {
    const m = mean(a)
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1))
  }
  let best = { t: end, z: 0 }
  for (const { t } of s) {
    if (t < end - R.endSearchBeforeMs || t > end + R.endSearchAfterMs) continue
    const b = s.filter((x) => x.t >= t - R.headStepMs && x.t < t).map((x) => x.headTilt)
    const a = s.filter((x) => x.t >= t && x.t < t + R.headStepMs).map((x) => x.headTilt)
    if (b.length < 3 || a.length < 3) continue
    const drop = (mean(b) - mean(a)) / (Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2) + 1e-6)
    if (drop > best.z) best = { t, z: drop }
  }
  return best.z >= R.headStepZ ? best.t : end
}

/** Shared with the live tracker. The strongest quiet crack just before a visual start, or null. */
export function pickSoftCrack(cracks: SoftCrack[], start: number, R: SoftRules): number | null {
  const near = cracks.filter((c) => c.t >= start - R.softCrackBeforeMs && c.t <= start + R.softCrackAfterMs)
  if (!near.length) return null
  return near.reduce((a, b) => (b.score > a.score ? b : a)).t
}

/** Crack score as the detector computes it (jump × brightness), for pickSoftCrack. */
export const crackScore = (c: Crack) => c.ratio * Math.min(c.high, 1.5)

export function detect(rows: FrameSignals[], cracks: Crack[], R: Rules = RULES, softCracks: Crack[] = []): Detection {
  const ms = (s: number) => s * 1000
  const head = rows.map((r) => ({ t: ms(r.t), headTilt: r.headTilt }))
  const soft = softCracks.map((c) => ({ t: ms(c.t), score: crackScore(c) }))
  let mouthFrames = 0 // consecutive frames with the wrist seen at the mouth
  let lastSeenAtMouth = -Infinity
  let mouthSince: number | null = null
  let lastMouthAt = -Infinity
  let angleSince: number | null = null
  let lastAngleAt = -Infinity
  let start: number | null = null
  let startBy = 'not detected'
  let ignored = 0
  let ci = 0
  let si = 0
  const softAtMouth: typeof soft = [] // quiet cracks heard with the can at the mouth long enough

  const stretch = (isTrue: boolean, t: number, since: number | null, last: number): [number | null, number] => {
    if (isTrue) return [since === null || t - last > R.gapMs ? t : since, t]
    return [t - last > R.gapMs ? null : since, last]
  }
  const atMouthAt = (t: number) => mouthSince !== null && t - lastMouthAt <= R.gapMs
  // A crack counts only with the can already at the mouth for crackMouthHoldMs.
  const heldLongEnough = (t: number) => atMouthAt(t) && t - mouthSince! >= R.crackMouthHoldMs

  for (const row of rows) {
    const t = ms(row.t)

    // Cracks that happened up to this frame (audio is checked between frames).
    while (start === null && ci < cracks.length && ms(cracks[ci].t) <= t) {
      const tc = ms(cracks[ci].t)
      if (heldLongEnough(tc)) {
        start = tc
        startBy = 'crack with can at mouth'
      } else ignored++
      ci++
    }
    while (start === null && si < soft.length && soft[si].t <= t) {
      if (heldLongEnough(soft[si].t)) softAtMouth.push(soft[si])
      si++
    }

    const seenAtMouth = row.liveMouthDist !== null && row.liveMouthDist < R.mouthDist
    if (row.liveMouthDist !== null) {
      mouthFrames = seenAtMouth ? mouthFrames + 1 : 0
      if (mouthFrames >= 2) lastSeenAtMouth = t
    }
    const hidden = row.liveMouthDist === null && t - lastSeenAtMouth <= R.hiddenHoldMs
    const atMouth = seenAtMouth || hidden
    const tipped = hidden || (row.liveAngle !== null && row.liveAngle >= R.angleDeg)
    ;[mouthSince, lastMouthAt] = stretch(atMouth, t, mouthSince, lastMouthAt)
    ;[angleSince, lastAngleAt] = stretch(tipped, t, angleSince, lastAngleAt)

    if (start === null) {
      // No crack heard: at mouth + tipped together long enough (back-dated).
      if (atMouth && tipped && mouthSince !== null && angleSince !== null) {
        const both = Math.max(mouthSince, angleSince)
        if (t - both >= R.visualStartMs) {
          const quiet = pickSoftCrack(softAtMouth, both, R)
          start = quiet ?? both
          startBy = quiet === null ? 'mouth + tipped (no crack)' : 'quiet crack, then mouth + tipped'
        }
      }
      continue
    }

    // Running: finished once the can has been away from the mouth for leaveMs.
    if (!atMouth && lastMouthAt > start + R.minRunMs && t - lastMouthAt >= R.leaveMs) {
      const end = Math.max(refineEnd(head, lastMouthAt, R), start + R.minRunMs)
      return { start: start / 1000, startBy, end: end / 1000, endBy: end === lastMouthAt ? 'can left mouth' : 'head came forward', ignoredCracks: ignored }
    }
  }

  if (start === null) return { start: null, startBy, end: null, endBy: '-', ignoredCracks: ignored }
  const end = lastMouthAt > start + R.minRunMs ? Math.max(refineEnd(head, lastMouthAt, R), start + R.minRunMs) / 1000 : null
  return { start: start / 1000, startBy, end, endBy: end === null ? 'never left mouth' : 'clip ended', ignoredCracks: ignored }
}
