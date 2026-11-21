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
  crackGraceMs: 1000,
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

export function detect(rows: FrameSignals[], cracks: Crack[], R: Rules = RULES): Detection {
  const ms = (s: number) => s * 1000
  let mouthSince: number | null = null
  let lastMouthAt = -Infinity
  let angleSince: number | null = null
  let lastAngleAt = -Infinity
  let lastCrack = -Infinity
  let start: number | null = null
  let startBy = 'not detected'
  let ignored = 0
  let ci = 0

  const stretch = (isTrue: boolean, t: number, since: number | null, last: number): [number | null, number] => {
    if (isTrue) return [since === null || t - last > R.gapMs ? t : since, t]
    return [t - last > R.gapMs ? null : since, last]
  }
  const atMouthAt = (t: number) => mouthSince !== null && t - lastMouthAt <= R.gapMs

  for (const row of rows) {
    const t = ms(row.t)

    // Cracks that happened up to this frame (audio is checked between frames).
    while (start === null && ci < cracks.length && ms(cracks[ci].t) <= t) {
      const tc = ms(cracks[ci].t)
      if (atMouthAt(tc)) {
        start = tc
        startBy = 'crack with can at mouth'
      } else {
        lastCrack = tc
        ignored++
      }
      ci++
    }

    const atMouth = row.liveMouthDist !== null && row.liveMouthDist < R.mouthDist
    const tipped = row.liveAngle !== null && row.liveAngle >= R.angleDeg
    ;[mouthSince, lastMouthAt] = stretch(atMouth, t, mouthSince, lastMouthAt)
    ;[angleSince, lastAngleAt] = stretch(tipped, t, angleSince, lastAngleAt)

    if (start === null) {
      // Crack shortly BEFORE the can reached the mouth.
      if (atMouth && mouthSince !== null && mouthSince - lastCrack >= 0 && mouthSince - lastCrack <= R.crackGraceMs) {
        start = lastCrack
        startBy = 'crack, can at mouth right after'
      }
      // No crack heard: at mouth + tipped together long enough (back-dated).
      else if (atMouth && tipped && mouthSince !== null && angleSince !== null) {
        const both = Math.max(mouthSince, angleSince)
        if (t - both >= R.visualStartMs) {
          start = both
          startBy = 'mouth + tipped (no crack)'
        }
      }
      continue
    }

    // Running: finished once the can has been away from the mouth for leaveMs.
    if (!atMouth && lastMouthAt > start + R.minRunMs && t - lastMouthAt >= R.leaveMs) {
      return { start: start / 1000, startBy, end: lastMouthAt / 1000, endBy: 'can left mouth', ignoredCracks: ignored }
    }
  }

  if (start === null) return { start: null, startBy, end: null, endBy: '-', ignoredCracks: ignored }
  const end = lastMouthAt > start + R.minRunMs ? lastMouthAt / 1000 : null
  return { start: start / 1000, startBy, end, endBy: end === null ? 'never left mouth' : 'clip ended', ignoredCracks: ignored }
}
