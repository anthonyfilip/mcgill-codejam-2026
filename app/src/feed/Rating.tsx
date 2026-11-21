import { useState } from 'react'
import { RATING_LABELS as LABELS } from './posts'

// 5 tappable stars to rate a post (5 = best). Once you've rated, it's locked.
// The average lives next to the time (see AvgRating).
export function Rating({
  myStars,
  canRate,
  onRate,
}: {
  myStars: number | null
  canRate: boolean
  onRate: (stars: number) => void
}) {
  const [hover, setHover] = useState(0)

  if (!canRate) return <div className="rating stars-label">Your friends rate your run</div>

  if (myStars) {
    return (
      <div className="rating stars" aria-label={`You rated ${myStars} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= myStars ? 'star on' : 'star'}>★</span>
        ))}
        <span className="stars-label">You rated: {LABELS[myStars]}</span>
      </div>
    )
  }

  const shown = hover
  return (
    <div className="rating stars" role="radiogroup" aria-label="Rate this run out of 5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={false}
          aria-label={`${n}: ${LABELS[n]}`}
          className={n <= shown ? 'star on' : 'star'}
          onMouseEnter={() => setHover(n)}
          onClick={() => onRate(n)}
        >
          ★
        </button>
      ))}
      <span className="stars-label">{shown ? LABELS[shown] : 'Rate this run (you only get one go)'}</span>
    </div>
  )
}

// "★ 4.2 (6)" shown beside the time; updates as ratings come in.
export function AvgRating({ stars }: { stars: number[] }) {
  if (!stars.length) return <span className="avg-rating none">★ –</span>
  const avg = stars.reduce((a, b) => a + b, 0) / stars.length
  return (
    <span className="avg-rating" title={`${LABELS[Math.round(avg)]} · ${stars.length} ${stars.length === 1 ? 'rating' : 'ratings'}`}>
      ★ {avg.toFixed(1)} <small>({stars.length})</small>
    </span>
  )
}
