// Finds "crack" sounds in a whole clip's audio track at once, using the same test as the
// live tracker's checkCrack() (src/live/app.js): loud, much louder than the running
// background, and mostly high-frequency energy. Reading the full track means short pops
// are never missed between video frames.

export interface CrackConfig {
  crackRatio: number // rms must be this many times the background
  crackMinRms: number // ...and at least this loud
  crackHighFreqShare: number // share of energy above crackHighFreqHz
  crackHighFreqHz: number
}

export interface Crack {
  t: number // seconds into the clip
  rms: number
  ratio: number // rms / background at that moment
  high: number // share of energy above crackHighFreqHz
}

const WINDOW = 2048 // samples per measurement, like the live AnalyserNode (fftSize 2048)
const HOP_S = 0.02 // live checks every 20 ms

export async function findCracks(url: string, cfg: CrackConfig): Promise<Crack[]> {
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

  // High-passed copy (two cascaded filters ≈ steep cut) to measure the "bright" share.
  const off = new OfflineAudioContext(1, audio.length, sr)
  const src = off.createBufferSource()
  const monoBuf = off.createBuffer(1, audio.length, sr)
  monoBuf.copyToChannel(mono, 0)
  src.buffer = monoBuf
  const hp1 = off.createBiquadFilter()
  const hp2 = off.createBiquadFilter()
  for (const hp of [hp1, hp2]) {
    hp.type = 'highpass'
    hp.frequency.value = cfg.crackHighFreqHz
  }
  src.connect(hp1).connect(hp2).connect(off.destination)
  src.start()
  const high = (await off.startRendering()).getChannelData(0)

  const hop = Math.round(HOP_S * sr)
  let bg = 0.01
  let lastCrack = -Infinity
  const cracks: Crack[] = []
  for (let start = 0; start + WINDOW <= mono.length; start += hop) {
    let e = 0
    let eh = 0
    for (let i = start; i < start + WINDOW; i++) {
      e += mono[i] * mono[i]
      eh += high[i] * high[i]
    }
    const rms = Math.sqrt(e / WINDOW)
    const highShare = e > 0 ? eh / e : 0
    const t = (start + WINDOW) / sr // time the live analyser would see this window
    const isCrack = rms > cfg.crackMinRms && rms > bg * cfg.crackRatio && highShare > cfg.crackHighFreqShare
    if (isCrack && t - lastCrack > 0.15) {
      cracks.push({ t, rms, ratio: rms / bg, high: highShare })
      lastCrack = t
    }
    if (rms < bg * 2) bg = bg * 0.98 + rms * 0.02 // learn the background from non-spikes, like live
  }
  return cracks
}
