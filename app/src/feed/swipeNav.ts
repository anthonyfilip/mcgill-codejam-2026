// Sideways swipes as shortcuts: on the feed, swipe left to record a chug; on the record
// page, swipe right to go back to the feed. Vertical swipes (scrolling the feed) are ignored.

// `left` / `right`: where a swipe in that direction goes (finger moving left / right).
// `allowed` lets a page switch it off, e.g. the tracker while a run is armed or going.
export function installSwipeNav(to: { left?: string; right?: string }, allowed: () => boolean = () => true) {
  let x0 = 0
  let y0 = 0
  let t0 = 0
  let tracking = false

  addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as Element
      // Not while typing, inside a pop-up/panel, or scrubbing a video's own controls.
      tracking =
        e.touches.length === 1 &&
        allowed() &&
        !target.closest('input, textarea, .sheet-backdrop, .popup-backdrop, .modal-backdrop, video[controls]')
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      t0 = Date.now()
    },
    { passive: true },
  )

  addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return
      tracking = false
      const dx = e.changedTouches[0].clientX - x0
      const dy = e.changedTouches[0].clientY - y0
      // A quick, clearly sideways swipe of at least 70 px.
      if (Date.now() - t0 > 700 || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return
      const next = dx < 0 ? to.left : to.right
      if (next) location.href = next
    },
    { passive: true },
  )
}
