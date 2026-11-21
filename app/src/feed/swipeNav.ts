// Swipe left/right anywhere on a page to move along: Feed ⇄ Record ⇄ Leaderboard ⇄ Profile.
// So a swipe left on the feed records a chug. Record isn't in the bottom bar but sits here
// between Feed and Leaderboard. The page slides with your finger (like Instagram); let go past
// 60 px and it moves on, otherwise it springs back. Vertical swipes (scrolling) are ignored.
const ORDER = ['/feed.html', '/', '/leaderboard.html', '/profile.html']
const GO_PX = 60

// `allowed` lets a page switch it off, e.g. the tracker while a run is armed or going.
export function installSwipeNav(current: string, allowed: () => boolean = () => true) {
  const body = document.body
  let x0 = 0
  let y0 = 0
  let dx = 0
  let tracking = false
  let sideways: boolean | null = null // decided after the first ~10 px of movement

  const target = (dir: number) => ORDER[ORDER.indexOf(current) + (dir < 0 ? 1 : -1)]
  const slide = (px: number, animate: boolean) => {
    body.style.transition = animate ? 'transform 0.18s ease-out' : 'none'
    body.style.transform = px ? `translateX(${px}px)` : ''
  }

  // Coming back with the browser's Back button can restore the page mid-slide.
  addEventListener('pageshow', () => slide(0, false))

  addEventListener(
    'touchstart',
    (e) => {
      const t = e.target as Element
      // Not while typing, inside a pop-up/panel, or scrubbing a video's own controls.
      tracking =
        e.touches.length === 1 &&
        allowed() &&
        !t.closest('input, textarea, .sheet-backdrop, .popup-backdrop, .modal-backdrop, video[controls]')
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
      dx = 0
      sideways = null
    },
    { passive: true },
  )

  addEventListener(
    'touchmove',
    (e) => {
      if (!tracking) return
      dx = e.touches[0].clientX - x0
      const dy = e.touches[0].clientY - y0
      if (sideways === null && Math.hypot(dx, dy) > 10) sideways = Math.abs(dx) > Math.abs(dy) * 1.2
      if (sideways && target(dx)) slide(dx * 0.8, false)
    },
    { passive: true },
  )

  // touchcancel too: browsers sometimes cancel instead of ending a touch inside a scroll area.
  const finish = () => {
    if (!tracking) return
    tracking = false
    const next = sideways ? target(dx) : undefined
    if (next && Math.abs(dx) >= GO_PX) {
      slide(dx < 0 ? -innerWidth : innerWidth, true)
      setTimeout(() => (location.href = next), 150)
    } else if (sideways) slide(0, true)
  }
  addEventListener('touchend', finish, { passive: true })
  addEventListener('touchcancel', finish, { passive: true })
}
