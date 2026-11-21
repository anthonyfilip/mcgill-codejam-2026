import { useEffect, useRef, useState } from 'react'

// A feed clip: plays (with sound unless muted) while mostly on screen, pauses when you
// scroll away. Tap the video to pause/play; the corner button mutes every clip.
export function FeedVideo({ src, muted, onToggleMute }: { src: string; muted: boolean; onToggleMute: () => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  // Browsers refuse sound until the page has been tapped once; until then we play silently.
  const [blocked, setBlocked] = useState(false)
  const silent = muted || blocked

  useEffect(() => {
    if (ref.current) ref.current.muted = silent
  }, [silent])

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio < 0.6) return v.pause()
        v.play().catch(() => {
          setBlocked(true)
          v.muted = true
          v.play().catch(() => {})
        })
      },
      { threshold: [0, 0.6] },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  function toggleSound() {
    // This tap counts as the page interaction the browser wanted, so sound can start now.
    if (blocked) {
      setBlocked(false)
      if (muted) onToggleMute()
      return
    }
    onToggleMute()
  }

  return (
    <div className="video-wrap">
      <video
        ref={ref}
        src={src}
        loop
        playsInline
        preload="metadata"
        onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
      />
      <button className="mute" onClick={toggleSound} aria-label={silent ? 'Turn sound on' : 'Mute'}>
        {silent ? '🔇' : '🔊'}
      </button>
    </div>
  )
}
