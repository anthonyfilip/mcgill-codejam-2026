// Crack ("tab pop") detection from a sound profile: one loudness + brightness reading every
// 20 ms. Pure functions, so the same code scores recorded clips (lab, node) and can be
// mirrored by the live tracker.

export interface SoundProfile {
  hopS: number // seconds between readings (0.02)
  rms: number[] // loudness of each ~46 ms window (2048 samples)
  high: number[] // share of that window's energy above highHz (0–1)
  highHz: number
  click?: number[] // energy of the loudest ~6 ms above clickHz in the newest 20 ms (older profiles: missing)
  clickHz?: number
}

export interface Click {
  t: number // seconds into the clip
  db: number // how far above the median click of the previous crackLookS
}

/**
 * Clicks = moments when the loudest ~6 ms of high-pitched sound (above 6 kHz) jumps clickDb above
 * the half-second before. A can crack is a click a few ms long: averaged over 46 ms (rms/high
 * above) it drowns in a noisy room, but at 6 ms it was the strongest click in 7/8 single-person clips.
 */
export function clicksFromProfile(p: SoundProfile, R: { clickDb: number; crackLookS: number }, windowS = 2048 / 44100): Click[] {
  if (!p.click) return []
  const look = Math.max(1, Math.round(R.crackLookS / p.hopS))
  const out: Click[] = []
  for (let i = look; i < p.click.length; i++) {
    const db = 10 * Math.log10((p.click[i] + 1e-12) / (median(p.click.slice(i - look, i)) + 1e-12))
    if (db >= R.clickDb) out.push({ t: i * p.hopS + windowS, db })
  }
  return out
}

export interface CrackRules {
  crackRatio: number // rms must be this many times the running background
  crackMinRms: number // ...and at least this loud
  crackHighFreqShare: number // ...and this bright
}

export interface Crack {
  t: number // seconds into the clip
  rms: number
  ratio: number
  high: number
}

export interface ContrastRules {
  crackScore: number // how big a sudden bright jump must be (jump × brightness)
  crackMinRms: number // ignore anything quieter than this
  crackLookS: number // compare against the median of this many seconds just before
}

/**
 * Crack = a sudden, bright jump compared with the half-second just before it.
 * jump = loudness ÷ median loudness of the previous crackLookS; it must also get clearly
 * brighter than before (+0.3). Score = jump × brightness. Comparing with the moment just
 * before (instead of a slow running background) is what makes it work in noisy parties:
 * tuned on the 18 labelled clips + a live laptop-mic recording.
 */
export function cracksByContrast(p: SoundProfile, R: ContrastRules, windowS = 2048 / 44100): Crack[] {
  const look = Math.max(1, Math.round(R.crackLookS / p.hopS))
  const out: Crack[] = []
  let last = -Infinity
  for (let i = look; i < p.rms.length; i++) {
    const r = p.rms[i]
    if (r < R.crackMinRms) continue
    const prevR = median(p.rms.slice(i - look, i))
    const prevH = median(p.high.slice(i - look, i))
    const jump = r / Math.max(prevR, 1e-4)
    const bright = p.high[i]
    const score = bright > prevH + 0.3 ? jump * Math.min(bright, 1.5) : 0
    const t = i * p.hopS + windowS
    if (score >= R.crackScore && t - last > 0.3) {
      out.push({ t, rms: r, ratio: jump, high: bright })
      last = t
    }
  }
  return out
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y)
  return s[s.length >> 1] ?? 0
}

/** The original detector (slow running background — misses cracks in noisy rooms). */
export function cracksFromProfile(p: SoundProfile, R: CrackRules, windowS = 2048 / 44100): Crack[] {
  let bg = 0.01
  let last = -Infinity
  const out: Crack[] = []
  for (let i = 0; i < p.rms.length; i++) {
    const rms = p.rms[i]
    const t = i * p.hopS + windowS
    if (rms > R.crackMinRms && rms > bg * R.crackRatio && p.high[i] > R.crackHighFreqShare && t - last > 0.15) {
      out.push({ t, rms, ratio: rms / bg, high: p.high[i] })
      last = t
    }
    if (rms < bg * 2) bg = bg * 0.98 + rms * 0.02
  }
  return out
}
