import { DrawingUtils, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { attachMeter } from '../audio/meter'
import { type ClipLabel, type EditableField, loadLabels, saveLabel } from '../data/labels'
import { computeSignals, type FrameSignals, pickContestant, signalsToCsv } from '../detect/signals'
import { type Landmarkers, loadLandmarkers } from '../vision/landmarkers'
import { SignalChart } from './SignalChart'

// Detection lab: play a labelled test clip, draw what MediaPipe sees, and graph the
// signals against the hand-labelled start/end so we can design the start/stop rules.
export function Lab() {
  const [clips, setClips] = useState<string[]>([])
  const [labels, setLabels] = useState<Map<string, ClipLabel>>(new Map())
  const [clip, setClip] = useState('')
  const [models, setModels] = useState<Landmarkers | null>(null)
  const [status, setStatus] = useState('Loading models…')
  const [rows, setRows] = useState<FrameSignals[]>([])
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const rowsRef = useRef<FrameSignals[]>([])

  useEffect(() => {
    void fetch('/clips/index.json')
      .then((r) => r.json() as Promise<string[]>)
      .then((list) => {
        setClips(list)
        setClip((c) => c || list[0] || '')
      })
    void loadLabels().then(setLabels)
    loadLandmarkers()
      .then((m) => {
        setModels(m)
        setStatus('Ready — press Analyse')
      })
      .catch((e: unknown) => setStatus(`Model load failed: ${String(e)}`))
  }, [])

  // Run detection on every decoded video frame while the clip plays.
  useEffect(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay || !models) return
    const meter = attachMeter(video)
    const ctx = overlay.getContext('2d')!
    const draw = new DrawingUtils(ctx)
    let lastTs = -1
    let handle = 0

    const onFrame = () => {
      const ts = Math.round(video.currentTime * 1000)
      if (ts > lastTs && video.videoWidth) {
        lastTs = ts
        overlay.width = video.videoWidth
        overlay.height = video.videoHeight
        const aspect = video.videoWidth / video.videoHeight
        const pose = models.pose.detectForVideo(video, ts)
        const hands = models.hands.detectForVideo(video, ts)
        const row = computeSignals(video.currentTime, pose, hands, aspect, meter.read(), meter.brightness())
        rowsRef.current.push(row)

        ctx.clearRect(0, 0, overlay.width, overlay.height)
        const contestant = pickContestant(pose, aspect)
        for (const lm of pose.landmarks) {
          const main = lm === contestant
          draw.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
            color: main ? '#ffd43b' : 'rgba(255,255,255,0.35)',
            lineWidth: main ? 4 : 2,
          })
          if (main) draw.drawLandmarks(lm, { color: '#e8590c', radius: 3 })
        }
        for (const hand of hands.landmarks) {
          draw.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, { color: '#63e6be', lineWidth: 2 })
        }
        setTime(video.currentTime)
        if (rowsRef.current.length % 5 === 0) setRows([...rowsRef.current])
      }
      if (!video.paused && !video.ended) handle = video.requestVideoFrameCallback(onFrame)
    }

    const onPlay = () => {
      handle = video.requestVideoFrameCallback(onFrame)
    }
    const onEnded = () => {
      setRows([...rowsRef.current])
      setStatus(`Done — ${rowsRef.current.length} frames analysed`)
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('ended', onEnded)
    return () => {
      video.cancelVideoFrameCallback(handle)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ended', onEnded)
    }
  }, [models])

  const analyse = async () => {
    const video = videoRef.current
    if (!video) return
    rowsRef.current = []
    setRows([])
    video.currentTime = 0
    setStatus('Analysing… (plays the clip once at normal speed)')
    await video.play()
  }

  const setLabel = async (field: EditableField, value: string) => {
    try {
      await saveLabel(clip, field, value)
      setLabels(await loadLabels())
      setStatus(`Saved ${field} = ${value || '(blank)'} for ${clip}`)
    } catch (e) {
      setStatus(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const step = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = Math.min(Math.max(0, video.currentTime + seconds), video.duration || 0)
  }

  const downloadCsv = () => {
    const blob = new Blob([signalsToCsv(rows)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = clip.replace(/\.\w+$/, '') + '_signals.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const label = labels.get(clip)

  return (
    <div className="lab">
      <header>
        <h1>Detection lab</h1>
        <span className="status">{status}</span>
      </header>

      <div className="controls">
        <select
          value={clip}
          onChange={(e) => {
            setClip(e.target.value)
            rowsRef.current = []
            setRows([])
          }}
        >
          {clips.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button onClick={analyse} disabled={!models || !clip}>
          Analyse
        </button>
        <button onClick={downloadCsv} disabled={rows.length === 0}>
          Download signals CSV
        </button>
        <span className="label-info">
          {label
            ? `labelled start ${label.start_s ?? '—'} s · end ${label.end_s ?? '—'} s · people ${label.people_in_frame || '—'}${label.contestant ? ` · contestant ${label.contestant}` : ''}`
            : 'no label row'}
        </span>
      </div>

      {clips.length === 0 && <p>No clips found in Chug_Examples/.</p>}

      <div className="stage">
        <video
          ref={videoRef}
          src={clip ? `/clips/${encodeURIComponent(clip)}` : undefined}
          controls
          playsInline
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
        />
        <canvas ref={overlayRef} className="overlay" />
      </div>

      {/* Labelling helper: pause, step to the exact frame, read the time into labels.csv */}
      <div className="controls timecode">
        <button onClick={() => step(-1)}>−1 s</button>
        <button onClick={() => step(-0.1)}>−0.1 s</button>
        <strong>{time.toFixed(2)} s</strong>
        <button onClick={() => step(0.1)}>+0.1 s</button>
        <button onClick={() => step(1)}>+1 s</button>
      </div>

      <div className="controls timecode">
        <button className="set-start" onClick={() => void setLabel('start_s', time.toFixed(1))} disabled={!clip}>
          Set start = {time.toFixed(1)} s
        </button>
        <button className="set-end" onClick={() => void setLabel('end_s', time.toFixed(1))} disabled={!clip}>
          Set end = {time.toFixed(1)} s
        </button>
        <label>
          People shotgunning{' '}
          <select
            value={label?.people_in_frame ?? ''}
            onChange={(e) => void setLabel('people_in_frame', e.target.value)}
            disabled={!clip}
          >
            <option value="">—</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3+</option>
          </select>
        </label>
        <input
          key={clip + (label?.notes ?? '')}
          placeholder="notes (e.g. not a shotgun, starts mid-chug)"
          defaultValue={label?.notes ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (label?.notes ?? '')) void setLabel('notes', e.target.value)
          }}
          disabled={!clip}
        />
      </div>

      <SignalChart
        rows={rows}
        duration={duration}
        currentTime={time}
        start={label?.start_s ?? null}
        end={label?.end_s ?? null}
      />
    </div>
  )
}
