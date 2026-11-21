// Time an uploaded chug video with the same rules as the live tracker: the lab's pipeline
// (src/detect/rules.ts) — cracks from the audio track, pose + hands frame by frame while the
// clip plays once at normal speed, then detect() for the start and end.
import { findCracks } from '../audio/offline'
import { detect, RULES } from '../detect/rules'
import { computeSignals, type FrameSignals } from '../detect/signals'
import { loadLandmarkers } from '../vision/landmarkers'

export type UploadResult = { timeMs: number; maxAngle: number | null; startedBy: string[] }

// `video` is shown on the page so the person can watch it being analysed.
export async function analyseUpload(
  file: File,
  video: HTMLVideoElement,
  onStatus: (text: string) => void,
): Promise<UploadResult> {
  const url = URL.createObjectURL(file)

  onStatus('Listening for the crack…')
  const cracks = await findCracks(url, RULES)

  onStatus('Loading the body tracker…')
  const models = await loadLandmarkers()

  video.src = url
  video.muted = true // muted videos may play without a tap
  video.playsInline = true
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve()
    video.onerror = () => reject(new Error("couldn't open that video"))
  })

  const rows: FrameSignals[] = []
  const aspect = video.videoWidth / video.videoHeight
  let clock = 0 // MediaPipe needs strictly increasing timestamps
  let lastT = -1

  await new Promise<void>((resolve, reject) => {
    const onFrame = () => {
      if (video.currentTime !== lastT) {
        lastT = video.currentTime
        clock = Math.max(clock + 1, Math.round(performance.now()))
        const pose = models.pose.detectForVideo(video, clock)
        const hands = models.hands.detectForVideo(video, clock)
        // Loudness/brightness aren't used by detect(); cracks come from the audio track above.
        rows.push(computeSignals(video.currentTime, pose, hands, aspect, -100, 0))
        onStatus(`Watching your chug… ${Math.round((video.currentTime / video.duration) * 100)}%`)
      }
      if (!video.ended) video.requestVideoFrameCallback(onFrame)
    }
    video.onended = () => resolve()
    video.currentTime = 0
    video.requestVideoFrameCallback(onFrame)
    video.play().catch(reject)
  })
  URL.revokeObjectURL(url)

  const det = detect(rows, cracks)
  if (det.start === null) throw new Error("couldn't find the start (crack the can with it at your mouth)")
  if (det.end === null) throw new Error("couldn't find the end (the can never left your mouth)")

  const during = rows.filter((r) => r.t >= det.start! && r.t <= det.end! && r.liveAngle !== null)
  return {
    timeMs: (det.end - det.start) * 1000,
    maxAngle: during.length ? Math.round(Math.max(...during.map((r) => r.liveAngle!))) : null,
    startedBy: [det.startBy],
  }
}
