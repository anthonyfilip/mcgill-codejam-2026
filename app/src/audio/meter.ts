// Measures loudness of a <video>'s soundtrack without playing it out loud.
// A tab pop shows up as a sharp spike; steady pouring/gulping as a raised floor.

export interface AudioMeter {
  /** Loudness of the most recent audio, in dBFS (about -100 = silence, 0 = max). */
  read(): number
  /** Share of energy above ~2 kHz (0..1). Clicks/pops are bright; voices are not. */
  brightness(): number
}

const meters = new WeakMap<HTMLMediaElement, AudioMeter>()

export function attachMeter(media: HTMLMediaElement): AudioMeter {
  const existing = meters.get(media)
  if (existing) return existing

  const ctx = new AudioContext()
  const source = ctx.createMediaElementSource(media)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0
  source.connect(analyser) // not connected to ctx.destination → silent but measured

  const time = new Float32Array(analyser.fftSize)
  const freq = new Float32Array(analyser.frequencyBinCount)
  const brightBin = Math.floor((2000 / (ctx.sampleRate / 2)) * analyser.frequencyBinCount)

  const meter: AudioMeter = {
    read() {
      if (ctx.state === 'suspended') void ctx.resume()
      analyser.getFloatTimeDomainData(time)
      let sum = 0
      for (const v of time) sum += v * v
      const rms = Math.sqrt(sum / time.length)
      return Math.max(-100, 20 * Math.log10(rms + 1e-10))
    },
    brightness() {
      analyser.getFloatFrequencyData(freq)
      let total = 0
      let bright = 0
      freq.forEach((db, i) => {
        const p = Math.pow(10, db / 10)
        total += p
        if (i >= brightBin) bright += p
      })
      return total > 0 ? bright / total : 0
    },
  }
  meters.set(media, meter)
  return meter
}
