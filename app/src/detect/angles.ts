// Arm, hand, wrist and can angles from MediaPipe landmarks. Shared by the live
// tracker (src/live/app.js) and the detection lab (src/lab/).
//
// All points are in PIXELS (x right, y down) so x and y are comparable.
// Angles are in degrees "from straight up": 0° = pointing up, 90° = horizontal, 180° = down.

export interface Pt {
  x: number
  y: number
}

/** Hand landmark indices (MediaPipe, 21 points). */
const H_WRIST = 0
const H_INDEX_MCP = 5
const H_MIDDLE_MCP = 9
const H_PINKY_MCP = 17

const deg = (rad: number) => (rad * 180) / Math.PI

/** Direction a→b measured from straight up (0–180°). */
export function fromVertical(a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const n = Math.hypot(dx, dy) || 1e-9
  return deg(Math.acos(Math.min(1, Math.max(-1, -dy / n))))
}

/** Angle between two directions a1→b1 and a2→b2 (0° = same direction). */
export function between(a1: Pt, b1: Pt, a2: Pt, b2: Pt): number {
  const v1 = { x: b1.x - a1.x, y: b1.y - a1.y }
  const v2 = { x: b2.x - a2.x, y: b2.y - a2.y }
  const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1e-9)
  return deg(Math.acos(Math.min(1, Math.max(-1, cos))))
}

export interface HandAngles {
  /** Forearm elbow→wrist from vertical (0° = forearm pointing up). */
  arm: number | null
  /** Hand wrist→middle knuckle from vertical. */
  hand: number
  /** How bent the wrist is: angle between forearm and hand (0° = straight). Needs the elbow. */
  wristFlex: number | null
  /** Estimated can tilt from upright (0° = upright, 90° = on its side). A gripped can's axis
   *  runs along the knuckle line (index knuckle → pinky knuckle), which has no direction,
   *  so this is folded into 0–90°. */
  can: number
  /** Knuckle-line end points, for drawing the estimated can axis. */
  canAxis: [Pt, Pt]
}

/**
 * @param hand  21 hand landmarks in pixels
 * @param elbow pose elbow in pixels for the same arm (null if not visible)
 * @param wrist pose wrist in pixels for the same arm (null if not visible)
 */
export function handAngles(hand: Pt[], elbow: Pt | null, wrist: Pt | null): HandAngles {
  const w = hand[H_WRIST]
  const mid = hand[H_MIDDLE_MCP]
  const can = fromVertical(hand[H_INDEX_MCP], hand[H_PINKY_MCP])
  return {
    arm: elbow && wrist ? fromVertical(elbow, wrist) : null,
    hand: fromVertical(w, mid),
    wristFlex: elbow && wrist ? between(elbow, wrist, w, mid) : null,
    can: can > 90 ? 180 - can : can,
    canAxis: [hand[H_INDEX_MCP], hand[H_PINKY_MCP]],
  }
}

/** Index of the hand whose wrist is nearest `target` (within maxDist px), or -1. */
export function nearestHand(hands: Pt[][], target: Pt, maxDist: number): number {
  let best = -1
  let bestD = maxDist
  hands.forEach((h, i) => {
    const d = Math.hypot(h[H_WRIST].x - target.x, h[H_WRIST].y - target.y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Normalised (0–1) landmarks → pixels. */
export const toPx = (pts: { x: number; y: number }[], w: number, h: number): Pt[] =>
  pts.map((p) => ({ x: p.x * w, y: p.y * h }))
