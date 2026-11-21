// The live tracker's start/end rules (src/live/app.js), as a pure function over recorded
// clip signals, so they can be scored against Chug_Examples/labels.csv.
// KEEP IN SYNC with CONFIG and loop()/checkCrack() in src/live/app.js.
//
// One difference: party clips have no 🤙. Live, the 🤙 only *confirms* the end and the
// time is back-dated to when the can last left the mouth — so here the end is "the can
// left the mouth and didn't come back for leaveMs", which is the time live would report.

import type { Crack } from '../audio/offline'
import type { Click } from './cracks'
import type { FrameSignals } from './signals'

export const RULES = {
  // from src/live/app.js CONFIG
  mouthDist: 0.8, // tuned on the 18 labelled clips (was 0.6: cut through the middle of real drinking)
  gapMs: 250,
  crackMouthHoldMs: 150, // a crack only counts once the can has been at the mouth this long (no cracks before it gets there)
  // ...and only with a REAL person in the shot, at the sound and while the drinking motion is checked
  // (a phone pointed at a foot made a phantom pose that started a run, Sat). Around every labelled
  // start, single-person clips had face+shoulder confidence ≥ 0.67 and size ≥ 0.067. ("Mouth above
  // shoulders" was measured too and rejected: it goes negative as the head tips back to drink.)
  personMinVis: 0.5, // lowest model confidence among nose, both mouth corners, both shoulders (0–1)
  personMinSize: 0.04, // shoulder width ÷ frame height
  // Start needs ALL of: a sound (loud crack or click) with the can at the mouth, THEN within
  // drinkConfirmMs the drinking motion — head tips back AND forearm swings toward vertical — with
  // the can still at the mouth. The clock starts at the sound. Holding the can at the mouth alone
  // never starts a run (live test, Sat). Measured over the 1.5 s after each labelled start vs the
  // 0.5 s before: head rose ≥ 0.22 and forearm dropped ≥ 29° in every single-person clip; at other
  // at-mouth moments the median was ~0.05 and 10–30°.
  // Re-tuned Sat ~15:00 on BOTH the old and a fresh analysis of the clips (a fresh model run reads
  // clips differently): 2.5 s / 0.1 / 0.5 s starts all 8 single clips on both with no early false
  // start; the old 1.5 s / 0.15 / 0.3 s missed clip 18 (slow drinker, head barely tips back in
  // 1.5 s). The longer hold is what keeps jittery frames out with the looser rise and window.
  drinkConfirmMs: 2500,
  drinkBaseMs: 500, // baseline = median over this long, ending at the last reading before the sound
  drinkHoldMs: 500, // ...vs the median over the last this-long (≥ 3 frames): the motion must last
  headBackRise: 0.1, // head tilt rise, in shoulder widths
  armSwingDeg: 25, // forearm angle drop toward vertical, in degrees...
  armUpDeg: 45, // ...or the forearm already within this of vertical
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
  // A crack while the can hides the face (pose lost): it still counts if the can had been at the
  // mouth ≥ crackMouthHoldMs, with a real person, when the pose was lost, nothing was seen since,
  // and the sound is within this long of that moment. Clip 03 (fresh analysis): face hidden ~1 s.
  hiddenCrackMs: 1200,
  // Clicks = loudest ~6 ms above 6 kHz (src/detect/cracks.ts clicksFromProfile): catch cracks the
  // 46 ms detector misses in noisy rooms. Of several clicks before drinking, the strongest wins (the
  // crack was the strongest click in 7/8 single-person clips).
  clickHighFreqHz: 6000,
  clickDb: 15, // dB above the median click of the previous crackLookS (15 and 20 scored the same)
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

type Sample = { t: number; headTilt: number | null; armAngle?: number | null } // t in ms
type Sound = { t: number; db: number } // t in ms; a loud crack has db = Infinity
type EndRules = Pick<Rules, 'endSearchBeforeMs' | 'endSearchAfterMs' | 'headStepMs' | 'headStepZ'>
type DrinkRules = Pick<Rules, 'drinkConfirmMs' | 'drinkBaseMs' | 'drinkHoldMs' | 'headBackRise' | 'armSwingDeg' | 'armUpDeg' | 'hiddenCrackMs'>

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

/** Shared with the live tracker. Is the drinking motion under way `now`, after a sound at `tc`?
 *  Over the last drinkHoldMs (all after the sound), the median head tilt must be ≥ headBackRise
 *  above, AND the median forearm angle ≥ armSwingDeg below, their medians over drinkBaseMs just
 *  before the sound. Medians, so one jittery frame can't pass (clips 13 and 18 did). */
export function drankAfter(samples: Sample[], tc: number, now: number, R: DrinkRules): boolean {
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]
  if (now - tc < R.drinkHoldMs) return false // need a full window after the sound
  const from = now - R.drinkHoldMs
  // [baseline median, recent median] for a signal, or null if too few readings. The baseline is the
  // drinkBaseMs of readings ending at the last one before the sound — normally right at the sound,
  // but up to hiddenCrackMs earlier when the can hid the face as it was cracked (clip 03).
  const medians = (key: 'headTilt' | 'armAngle'): [number, number] | null => {
    let lastBefore = -Infinity
    const look = Math.max(R.drinkBaseMs, R.hiddenCrackMs)
    for (const s of samples) if (s[key] != null && s.t <= tc && s.t >= tc - look) lastBefore = Math.max(lastBefore, s.t)
    const before: number[] = [], recent: number[] = []
    for (const s of samples) {
      const v = s[key]
      if (v == null) continue
      if (s.t >= lastBefore - R.drinkBaseMs && s.t <= lastBefore) before.push(v)
      else if (s.t > from && s.t <= now) recent.push(v)
    }
    return before.length >= 2 && recent.length >= 3 ? [median(before), median(recent)] : null
  }
  const head = medians('headTilt')
  const arm = medians('armAngle')
  const headBack = !!head && head[1] - head[0] >= R.headBackRise
  // Forearm swung toward vertical — or was already up there (can held high before the crack: clip 03).
  const armUp = !!arm && (arm[0] - arm[1] >= R.armSwingDeg || arm[1] <= R.armUpDeg)
  return headBack && armUp
}

/** Shared with the live tracker. Once the drinking motion has followed any sound heard with the can
 *  at the mouth in the last drinkConfirmMs, the start is the strongest of those sounds (a loud crack
 *  beats any click) — its time; else null. */
export function confirmedStart(sounds: Sound[], samples: Sample[], now: number, R: DrinkRules): number | null {
  const recent = sounds.filter((s) => s.t <= now && now - s.t <= R.drinkConfirmMs)
  if (!recent.some((s) => drankAfter(samples, s.t, now, R))) return null
  return recent.reduce((a, b) => (b.db > a.db ? b : a)).t
}

export function detect(rows: FrameSignals[], cracks: Crack[], R: Rules = RULES, clickList: Click[] = []): Detection {
  const ms = (s: number) => s * 1000
  const head = rows.map((r) => ({ t: ms(r.t), headTilt: r.headTilt, armAngle: r.armAngle }))
  // Real person? Older saved analyses lack the fields (undefined) and count as unknown = not real.
  const personOk = (r: FrameSignals) => (r.faceVis ?? 0) >= R.personMinVis && (r.personSize ?? 0) >= R.personMinSize
  // The start only looks at frames with a real person (the end uses every frame, `head`).
  const headStart = rows.map((r) => (personOk(r) ? { t: ms(r.t), headTilt: r.headTilt, armAngle: r.armAngle } : { t: ms(r.t), headTilt: null, armAngle: null }))
  let lastPersonOkAt = -Infinity
  let lastPoseAt = -Infinity // last frame with any pose at all
  let heldAtLastMouth = 0 // how long the can had been at the mouth at its last at-mouth frame
  const clicks = clickList.map((c) => ({ t: ms(c.t), db: c.db }))
  let mouthFrames = 0 // consecutive frames with the wrist seen at the mouth
  let lastSeenAtMouth = -Infinity
  let mouthSince: number | null = null
  let lastMouthAt = -Infinity
  let start: number | null = null
  let startBy = 'not detected'
  let ignored = 0
  let ci = 0
  let ki = 0
  const sounds: Sound[] = [] // cracks and clicks heard with the can at the mouth long enough

  const stretch = (isTrue: boolean, t: number, since: number | null, last: number): [number | null, number] => {
    if (isTrue) return [since === null || t - last > R.gapMs ? t : since, t]
    return [t - last > R.gapMs ? null : since, last]
  }
  const atMouthAt = (t: number) => mouthSince !== null && t - lastMouthAt <= R.gapMs
  // A crack counts only with the can already at the mouth for crackMouthHoldMs, and a real person
  // seen within hiddenHoldMs before it — the same allowance as "face hidden by the can" (the arm and
  // can often cover the face right as it's cracked).
  // Or: the face is hidden by the can — the pose was lost while the can was at the mouth (held long
  // enough, real person), nothing has been seen since, and it's within hiddenCrackMs.
  const hiddenAtCrack = (t: number) =>
    lastPoseAt <= lastMouthAt && t - lastMouthAt <= R.hiddenCrackMs && heldAtLastMouth >= R.crackMouthHoldMs &&
    lastPersonOkAt >= lastPoseAt - R.gapMs // the last pose seen was a real person
  const heldLongEnough = (t: number) =>
    (atMouthAt(t) && t - mouthSince! >= R.crackMouthHoldMs && t - lastPersonOkAt <= R.hiddenHoldMs) || hiddenAtCrack(t)

  for (const row of rows) {
    const t = ms(row.t)

    // Sounds that happened up to this frame (audio is checked between frames).
    while (start === null && ci < cracks.length && ms(cracks[ci].t) <= t) {
      const tc = ms(cracks[ci].t)
      if (heldLongEnough(tc)) sounds.push({ t: tc, db: Infinity })
      else ignored++
      ci++
    }
    while (start === null && ki < clicks.length && clicks[ki].t <= t) {
      if (heldLongEnough(clicks[ki].t)) sounds.push(clicks[ki])
      ki++
    }

    const seenAtMouth = row.liveMouthDist !== null && row.liveMouthDist < R.mouthDist
    if (row.liveMouthDist !== null) {
      mouthFrames = seenAtMouth ? mouthFrames + 1 : 0
      if (mouthFrames >= 2) lastSeenAtMouth = t
    }
    const hidden = row.liveMouthDist === null && t - lastSeenAtMouth <= R.hiddenHoldMs
    const atMouth = seenAtMouth || hidden
    ;[mouthSince, lastMouthAt] = stretch(atMouth, t, mouthSince, lastMouthAt)
    const realPerson = personOk(row)
    if (realPerson) lastPersonOkAt = t
    if (row.liveMouthDist !== null) lastPoseAt = t
    if (atMouth && mouthSince !== null) heldAtLastMouth = t - mouthSince

    if (start === null) {
      // Sound at the mouth, then the drinking motion, can still at the mouth, real person in this
      // frame → start at the sound. The motion is judged on real-person frames only.
      if (atMouth && realPerson) {
        const s = confirmedStart(sounds, headStart, t, R)
        if (s !== null) {
          start = s
          startBy = sounds.find((x) => x.t === s)!.db === Infinity ? 'crack, then drinking' : 'click (crack), then drinking'
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
