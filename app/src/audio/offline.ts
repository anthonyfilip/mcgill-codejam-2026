// Reads a whole clip's audio track at once and measures it every 20 ms, the same way the
// live tracker listens to the microphone. Reading the full track means short pops are
// never missed between video frames.

import { type ContrastRules, type Crack, cracksByContrast, type SoundProfile } from '../detect/cracks'

export type { Crack } from '../detect/cracks'

const WINDOW = 2048 // samples per measurement, like the live AnalyserNode (fftSize 2048)
const HOP_S = 0.02 // live checks every 20 ms

/** Loudness + brightness every 20 ms for the whole clip. */
export async function soundProfile(url: string, highHz = 3000): Promise<SoundProfile> {
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
    hp.frequency.value = highHz
  }
  src.connect(hp1).connect(hp2).connect(off.destination)
  src.start()
  const high = (await off.startRendering()).getChannelData(0)

  const hop = Math.round(HOP_S * sr)
  const rmsOut: number[] = []
  const highOut: number[] = []
  for (let start = 0; start + WINDOW <= mono.length; start += hop) {
    let e = 0
    let eh = 0
    for (let i = start; i < start + WINDOW; i++) {
      e += mono[i] * mono[i]
      eh += high[i] * high[i]
    }
    rmsOut.push(+Math.sqrt(e / WINDOW).toFixed(5))
    highOut.push(+(e > 0 ? eh / e : 0).toFixed(4))
  }
  return { hopS: hop / sr, rms: rmsOut, high: highOut, highHz }
}

export async function findCracks(url: string, cfg: ContrastRules & { crackHighFreqHz: number }): Promise<Crack[]> {
  return cracksByContrast(await soundProfile(url, cfg.crackHighFreqHz), cfg)
}
