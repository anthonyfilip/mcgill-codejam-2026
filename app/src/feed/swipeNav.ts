// Swipe left/right anywhere on a page to move along: Feed ⇄ Record ⇄ Leaderboard ⇄ Profile.
// So a swipe left on the feed records a chug. Record isn't in the bottom bar but sits here
// between Feed and Leaderboard. Vertical swipes (scrolling the feed) are ignored.
const ORDER = ['/feed.html', '/', '/leaderboard.html', '/profile.html']

// `allowed` lets a page switch it off, e.g. the tracker while a run is armed or going.
export function installSwipeNav(current: string, allowed: () => boolean = () => true) {
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
      const next = ORDER[ORDER.indexOf(current) + (dx < 0 ? 1 : -1)]
      if (next !== undefined) location.href = next
    },
    { passive: true },
  )
}
