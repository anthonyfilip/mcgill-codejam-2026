import { DrawingUtils, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState } from 'react'
import { attachMeter } from '../audio/meter'
import { type Crack, findCracks, soundProfile } from '../audio/offline'
import { clicksFromProfile, cracksByContrast, type SoundProfile } from '../detect/cracks'
import { type ClipLabel, type EditableField, loadLabels, saveLabel } from '../data/labels'
import { detect, RULES } from '../detect/rules'
import { computeSignals, type FrameSignals, pickContestant, signalsToCsv } from '../detect/signals'
import { type Landmarkers, loadLandmarkers } from '../vision/landmarkers'
import { type ClipScore, Scoreboard } from './Scoreboard'
import { SignalChart } from './SignalChart'

interface SavedSignals {
  clip: string
  rows: FrameSignals[]
  cracks: Crack[]
  analysedAt: string
}

const signalsUrl = (clip: string) => `/clips/signals/${encodeURIComponent(clip.replace(/\.\w+$/, ''))}.json`
const soundUrl = (clip: string) => `/clips/signals/${encodeURIComponent(clip.replace(/\.\w+$/, ''))}.audio.json`

/** Resolve when `event` fires on `el` (or reject after timeoutMs). */
const waitFor = (el: HTMLElement, event: string, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs)
    el.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true })
  })

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
  const analysingRef = useRef(false) // true only during an Analyse pass
  const analyseStartedRef = useRef(0)
  const [scores, setScores] = useState<ClipScore[]>([])
  const [batch, setBatch] = useState(false)

  // Score every clip from its saved signals (fast — no video needed).
  const rescore = async (clipList: string[], labelMap: Map<string, ClipLabel>) => {
    const out: ClipScore[] = []
    for (const c of clipList) {
      const res = await fetch(signalsUrl(c))
      const saved = res.ok ? ((await res.json()) as SavedSignals) : null
      // With a saved sound profile, re-detect cracks with the current rules (so crack tuning
      // applies without re-analysing video); otherwise use the cracks saved at analysis time.
      const snd = await fetch(soundUrl(c))
      const profile = snd.ok ? ((await snd.json()) as SoundProfile) : null
      const cracks = profile ? cracksByContrast(profile, RULES) : (saved?.cracks ?? [])
      // Clicks (~6 ms, above 6 kHz), only used in a small window before a visual start.
      // Profiles saved before clicks existed have none: re-run "save sound profiles".
      const clicks = profile ? clicksFromProfile(profile, RULES) : []
      out.push({ clip: c, label: labelMap.get(c), det: saved ? detect(saved.rows, cracks, RULES, clicks) : null })
    }
    setScores(out)
  }

  useEffect(() => {
    void Promise.all([fetch('/clips/index.json').then((r) => r.json() as Promise<string[]>), loadLabels()]).then(
      ([list, labelMap]) => {
        setClips(list)
        setClip((c) => c || list[0] || '')
        setLabels(labelMap)
        void rescore(list, labelMap)
      },
    )
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
    // MediaPipe's VIDEO mode needs strictly increasing timestamps, but the clip's own time
    // goes backwards when you seek, step back or switch clips. So MediaPipe gets its own
    // ever-increasing clock, and we redraw whenever the shown frame changes.
    let mpClock = 0
    let lastVideoTime = -1
    let handle = 0

    const processFrame = () => {
      if (!video.videoWidth || video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime
      mpClock = Math.max(mpClock + 1, Math.round(performance.now()))
      {
        overlay.width = video.videoWidth
        overlay.height = video.videoHeight
        const aspect = video.videoWidth / video.videoHeight
        const pose = models.pose.detectForVideo(video, mpClock)
        const hands = models.hands.detectForVideo(video, mpClock)
        // Only record graph data during an Analyse pass, not while scrubbing/labelling.
        if (analysingRef.current) {
          rowsRef.current.push(computeSignals(video.currentTime, pose, hands, aspect, meter.read(), meter.brightness()))
        }

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
        if (analysingRef.current && rowsRef.current.length % 5 === 0) setRows([...rowsRef.current])
      }
    }

    const onFrame = () => {
      processFrame()
      if (!video.paused && !video.ended) handle = video.requestVideoFrameCallback(onFrame)
    }
    const onPlay = () => {
      meter.resume() // otherwise Chrome freezes the video until the audio engine is woken
      handle = video.requestVideoFrameCallback(onFrame)
    }
    // Any click/key on the page counts as a user action that's allowed to wake audio.
    const wake = () => meter.resume()
    document.addEventListener('pointerdown', wake)
    document.addEventListener('keydown', wake)
    // Paused + seek/step, or a new clip loaded: redraw for the frame now on screen.
    const onStill = () => {
      // The decoded frame isn't always ready the instant 'seeked' fires; draw on the next one.
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(processFrame)
      processFrame()
    }
    const onLoaded = () => {
      lastVideoTime = -1
      ctxClear()
      onStill()
    }
    const ctxClear = () => ctx.clearRect(0, 0, overlay.width, overlay.height)
    const onEnded = () => {
      if (!analysingRef.current) return
      analysingRef.current = false
      setRows([...rowsRef.current])
      setStatus(`Done — ${rowsRef.current.length} frames analysed`)
    }
    const onPause = () => {
      // Pause events are delivered late: ignore one left over from just before Analyse was pressed.
      if (performance.now() - analyseStartedRef.current < 500) return
      if (analysingRef.current && !video.ended) {
        analysingRef.current = false
        setRows([...rowsRef.current])
        setStatus(`Paused — ${rowsRef.current.length} frames analysed (press Analyse to start over)`)
      }
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('seeked', onStill)
    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    onLoaded() // models may finish loading after the first clip is already showing
    return () => {
      video.cancelVideoFrameCallback(handle)
      document.removeEventListener('pointerdown', wake)
      document.removeEventListener('keydown', wake)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('seeked', onStill)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
    }
  }, [models])

  const analyse = async () => {
    const video = videoRef.current
    if (!video) return
    rowsRef.current = []
    setRows([])
    video.currentTime = 0
    analysingRef.current = true
    analyseStartedRef.current = performance.now()
    setStatus('Analysing… (plays the clip once at normal speed)')
    await video.play()
  }

  // Analyse one clip end-to-end (vision while it plays + cracks from its audio track) and save to disk.
  const analyseAndSave = async (name: string) => {
    const video = videoRef.current!
    if (decodeURIComponent(video.currentSrc.split('/').pop() ?? '') !== name) {
      const loaded = waitFor(video, 'loadeddata', 20000)
      setClip(name)
      rowsRef.current = []
      setRows([])
      await loaded
    }
    const cracks = await findCracks(`/clips/${encodeURIComponent(name)}`, RULES)
    const ended = waitFor(video, 'ended', (video.duration + 60) * 1000)
    await analyse()
    await ended
    const data: SavedSignals = { clip: name, rows: rowsRef.current, cracks, analysedAt: new Date().toISOString() }
    await fetch(signalsUrl(name), { method: 'POST', body: JSON.stringify(data) })
  }

  // Sound profile of every clip (no playback needed — a few seconds in total).
  const saveSoundProfiles = async () => {
    setBatch(true)
    try {
      for (let i = 0; i < clips.length; i++) {
        setStatus(`Measuring sound: ${clips[i]} (${i + 1}/${clips.length})`)
        const p = await soundProfile(`/clips/${encodeURIComponent(clips[i])}`, RULES.crackHighFreqHz, RULES.clickHighFreqHz)
        await fetch(soundUrl(clips[i]), { method: 'POST', body: JSON.stringify(p) })
      }
      await rescore(clips, labels)
      setStatus(`Saved sound profiles for ${clips.length} clips`)
    } finally {
      setBatch(false)
    }
  }

  // Chrome stops delivering video frames to hidden tabs, so a clip analysed while the tab was
  // in the background ends up with almost no rows. Wait until visible, and redo thin results.
  const waitVisible = async () => {
    while (document.visibilityState !== 'visible') {
      setStatus('Paused — switch back to this tab to continue analysing')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  const enoughRows = (n: number, dur: number) => n >= Math.max(20, dur * 3) // ≥ 3 frames per second

  const analyseAll = async () => {
    const video = videoRef.current!
    setBatch(true)
    // 8 minutes of party audio is a lot: silence the speakers only, so the loudness and
    // brightness graphs still measure the real sound.
    const meter = attachMeter(video)
    meter.setSpeakerVolume(0)
    try {
      for (let i = 0; i < clips.length; i++) {
        // Skip clips already analysed properly.
        const prev = await fetch(signalsUrl(clips[i]))
        if (prev.ok) {
          const saved = (await prev.json()) as SavedSignals
          const lastT = saved.rows.at(-1)?.t ?? 0
          if (enoughRows(saved.rows.length, lastT)) continue
        }
        for (let attempt = 1; attempt <= 3; attempt++) {
          await waitVisible()
          setStatus(`Analysing all: ${clips[i]} (${i + 1}/${clips.length}) — keep this tab visible`)
          await analyseAndSave(clips[i])
          if (enoughRows(rowsRef.current.length, video.duration)) break
          setStatus(`${clips[i]}: too few frames (tab hidden?) — retrying`)
        }
        await rescore(clips, labels)
      }
      setStatus(`Analysed all ${clips.length} clips — scores below`)
    } catch (e) {
      setStatus(`Analyse all stopped: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      meter.setSpeakerVolume(1)
      setBatch(false)
    }
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
        <button onClick={analyse} disabled={!models || !clip || batch}>
          Analyse
        </button>
        <button onClick={() => void analyseAll()} disabled={!models || clips.length === 0 || batch}>
          Analyse all clips &amp; score (~8 min)
        </button>
        <button onClick={() => void saveSoundProfiles()} disabled={clips.length === 0 || batch}>
          Measure sound of all clips
        </button>
        <button onClick={() => void rescore(clips, labels)} disabled={batch}>
          Re-score
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

      <h2>Accuracy against labels.csv</h2>
      <p className="hint">
        "Analyse all clips" plays every clip once and saves what the tracker saw to Chug_Examples/signals/. After
        that, "Re-score" re-runs the start/end rules (src/detect/rules.ts) instantly.
      </p>
      <Scoreboard scores={scores} />
    </div>
  )
}
