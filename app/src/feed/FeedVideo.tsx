import { useEffect, useRef } from 'react'

// A feed clip with the browser's own controls: plays with sound while mostly on screen
// and pauses when you scroll away.
export function FeedVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio < 0.6) return v.pause()
        // Browsers refuse sound until the page has been tapped once: then play silently,
        // and the speaker in the controls turns it on.
        v.play().catch(() => {
          v.muted = true
          v.play().catch(() => {})
        })
      },
      { threshold: [0, 0.6] },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  return <video ref={ref} src={src} controls loop playsInline preload="metadata" />
}
