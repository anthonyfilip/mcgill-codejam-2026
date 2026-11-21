// Reads a whole clip's audio track at once and measures it every 20 ms, the same way the
// live tracker listens to the microphone. Reading the full track means short pops are
// never missed between video frames.

import { type ContrastRules, type Crack, cracksByContrast, type SoundProfile } from '../detect/cracks'

export type { Crack } from '../detect/cracks'

const WINDOW = 2048 // samples per measurement, like the live AnalyserNode (fftSize 2048)
const HOP_S = 0.02 // live checks every 20 ms

const CLICK_FRAME_S = 256 / 44100 // ~6 ms: a can crack is a click this short

async function highPassed(mono: Float32Array<ArrayBuffer>, sr: number, hz: number): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, mono.length, sr)
  const src = off.createBufferSource()
  const buf = off.createBuffer(1, mono.length, sr)
  buf.copyToChannel(mono, 0)
  src.buffer = buf
  const hp1 = off.createBiquadFilter()
  const hp2 = off.createBiquadFilter()
  for (const hp of [hp1, hp2]) {
    hp.type = 'highpass'
    hp.frequency.value = hz
  }
  src.connect(hp1).connect(hp2).connect(off.destination)
  src.start()
  return (await off.startRendering()).getChannelData(0)
}

/** Loudness + brightness every 20 ms for the whole clip, plus "click": the loudest ~6 ms of
 *  sound above clickHz among the newest 20 ms of each window (what a live poll sees as new). */
export async function soundProfile(url: string, highHz = 3000, clickHz = 6000): Promise<SoundProfile> {
  const bytes = await (await fetch(url)).arrayBuffer()
  const decoder = new OfflineAudioContext(1, 1, 44100)
  const audio = await decoder.decodeAudioData(bytes)
  const sr = audio.sampleRate

  // Mono mix.
  const mono = new Float32Array(audio.length)
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c)
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / audio.numberOfChannels
  }

  // High-passed copies (two cascaded filters ≈ steep cut): "bright" share, and the click band.
  const high = await highPassed(mono, sr, highHz)
  const clickBand = await highPassed(mono, sr, clickHz)

  const hop = Math.round(HOP_S * sr)
  const frame = Math.round(CLICK_FRAME_S * sr)
  const rmsOut: number[] = []
  const highOut: number[] = []
  const clickOut: number[] = []
  for (let start = 0; start + WINDOW <= mono.length; start += hop) {
    let e = 0
    let eh = 0
    for (let i = start; i < start + WINDOW; i++) {
      e += mono[i] * mono[i]
      eh += high[i] * high[i]
    }
    rmsOut.push(+Math.sqrt(e / WINDOW).toFixed(5))
    highOut.push(+(e > 0 ? eh / e : 0).toFixed(4))
    clickOut.push(+loudestFrame(clickBand, start + WINDOW - hop, start + WINDOW, frame).e.toPrecision(4))
  }
  return { hopS: hop / sr, rms: rmsOut, high: highOut, highHz, click: clickOut, clickHz }
}

/** The loudest `frame`-sample stretch (half-frame steps) ending in (from, to]: its mean-square
 *  energy `e` and the sample index where it ends. Shared with the live tracker. */
export function loudestFrame(x: ArrayLike<number>, from: number, to: number, frame: number): { e: number; end: number } {
  let best = { e: 0, end: to }
  const step = Math.max(1, frame >> 1)
  for (let end = to; end > from && end - frame >= 0; end -= step) {
    let e = 0
    for (let i = end - frame; i < end; i++) e += x[i] * x[i]
    if (e / frame > best.e) best = { e: e / frame, end }
  }
  return best
}

export async function findCracks(url: string, cfg: ContrastRules & { crackHighFreqHz: number }): Promise<Crack[]> {
  return cracksByContrast(await soundProfile(url, cfg.crackHighFreqHz), cfg)
}
