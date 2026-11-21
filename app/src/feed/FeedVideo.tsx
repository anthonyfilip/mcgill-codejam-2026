import { useEffect, useRef, useState } from 'react'

// Speaker icon (on / off) for the corner sound toggle.
function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
      {off ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  )
}

// A full-screen feed clip, Reels-style: plays while it's the post on screen and pauses when
// you swipe away. Tap to pause/play; the corner speaker mutes every clip.
// `onBlocked`: the browser refused sound before the page was tapped, so the feed goes muted.
export function FeedVideo({
  src,
  muted,
  onToggleMute,
  onBlocked,
}: {
  src: string
  muted: boolean
  onToggleMute: () => void
  onBlocked: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [paused, setPaused] = useState(false)
  const [portrait, setPortrait] = useState(true)

  useEffect(() => {
    if (ref.current) ref.current.muted = muted
  }, [muted])

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio < 0.6) return v.pause()
        v.play().catch(() => {
          onBlocked()
          v.muted = true
          v.play().catch(() => {})
        })
      },
      { threshold: [0, 0.6] },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [onBlocked])

  return (
    <>
      <video
        ref={ref}
        src={src}
        loop
        playsInline
        preload="metadata"
        // Fill the screen with upright (phone) clips; show sideways clips whole.
        className={portrait ? 'fill' : 'fit'}
        onLoadedMetadata={(e) => setPortrait(e.currentTarget.videoHeight >= e.currentTarget.videoWidth)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
      />
      {paused && <div className="paused-icon" aria-hidden="true">▶</div>}
      <button className="sound" onClick={onToggleMute} aria-label={muted ? 'Turn sound on' : 'Mute'}>
        <SpeakerIcon off={muted} />
      </button>
    </>
  )
}
