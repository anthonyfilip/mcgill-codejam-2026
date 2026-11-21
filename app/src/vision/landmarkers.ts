import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'

// Pinned to the installed package version so the WASM matches the JS.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export interface Landmarkers {
  pose: PoseLandmarker
  hands: HandLandmarker
}

let cached: Promise<Landmarkers> | null = null

export function loadLandmarkers(): Promise<Landmarkers> {
  cached ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
    const [pose, hands] = await Promise.all([
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 3, // several people can be in frame; we pick the contestant ourselves
      }),
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 4,
      }),
    ])
    return { pose, hands }
  })()
  return cached
}
