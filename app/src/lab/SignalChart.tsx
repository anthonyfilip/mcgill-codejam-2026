import { useEffect, useRef } from 'react'
import type { FrameSignals } from '../detect/signals'

interface Lane {
  key: keyof FrameSignals
  label: string
  min: number
  max: number
  color: string
}

// One horizontal lane per signal. Ranges are rough guesses; adjust once we've seen real data.
const LANES: Lane[] = [
  { key: 'handToMouth', label: 'hand→mouth (shoulder widths, low = at mouth)', min: 0, max: 3, color: '#e8590c' },
  { key: 'handsNearMouth', label: 'hands near mouth', min: 0, max: 2, color: '#d6336c' },
  { key: 'headTilt', label: 'head tilt (high = tipped back)', min: -0.6, max: 0.6, color: '#1c7ed6' },
  { key: 'handAboveShoulder', label: 'hand above shoulder', min: -1.5, max: 1.5, color: '#2f9e44' },
  { key: 'loudnessDb', label: 'loudness dB', min: -80, max: 0, color: '#7048e8' },
  { key: 'brightness', label: 'audio brightness (pops/clicks)', min: 0, max: 1, color: '#868e96' },
]

interface Props {
  rows: FrameSignals[]
  duration: number
  currentTime: number
  start: number | null
  end: number | null
}

export function SignalChart({ rows, duration, currentTime, start, end }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth
    const laneH = 56
    const H = laneH * LANES.length
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    const dur = duration || 1
    const x = (t: number) => (t / dur) * W

    LANES.forEach((lane, i) => {
      const top = i * laneH
      ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)'
      ctx.fillRect(0, top, W, laneH)
      ctx.fillStyle = '#495057'
      ctx.font = '11px system-ui'
      ctx.fillText(lane.label, 6, top + 13)

      ctx.strokeStyle = lane.color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      let drawing = false
      for (const r of rows) {
        const v = r[lane.key]
        if (v === null) {
          drawing = false
          continue
        }
        const n = Math.min(1, Math.max(0, (v - lane.min) / (lane.max - lane.min)))
        const y = top + laneH - 4 - n * (laneH - 20)
        if (drawing) ctx.lineTo(x(r.t), y)
        else ctx.moveTo(x(r.t), y)
        drawing = true
      }
      ctx.stroke()
    })

    const vline = (t: number | null, color: string, label: string) => {
      if (t === null) return
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x(t), 0)
      ctx.lineTo(x(t), H)
      ctx.stroke()
      ctx.fillStyle = color
      ctx.font = 'bold 11px system-ui'
      ctx.fillText(label, x(t) + 3, H - 4)
    }
    vline(start, '#2b8a3e', 'labelled start')
    vline(end, '#c92a2a', 'labelled end')
    vline(currentTime, '#212529', '')
  }, [rows, duration, currentTime, start, end])

  return <canvas ref={ref} style={{ width: '100%', display: 'block', borderRadius: 6 }} />
}
