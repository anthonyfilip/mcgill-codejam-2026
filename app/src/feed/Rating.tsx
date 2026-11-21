import { useState } from 'react'
import type { PostRating } from './posts'

const LABELS = ['', 'Weak', 'Okay', 'Solid', 'Great', 'Legendary']

// Rating for a post: the average, plus 5 tappable stars (5 = best).
export function Rating({
  ratings,
  myStars,
  canRate,
  onRate,
}: {
  ratings: PostRating[]
  myStars: number | null
  canRate: boolean
  onRate: (stars: number) => void
}) {
  const [hover, setHover] = useState(0)
  const avg = ratings.length ? ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length : null
  const shown = hover || myStars || 0

  return (
    <div className="rating">
      <div className="rating-head">
        <b>⭐ Rating</b>
        <span className="rating-avg">
          {avg !== null
            ? `${avg.toFixed(1)} / 5 · ${LABELS[Math.round(avg)]} · ${ratings.length} ${ratings.length === 1 ? 'rating' : 'ratings'}`
            : 'No ratings yet'}
        </span>
      </div>
      {canRate ? (
        <div className="stars" role="radiogroup" aria-label="Rate this run out of 5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={myStars === n}
              aria-label={`${n}: ${LABELS[n]}`}
              className={n <= shown ? 'star on' : 'star'}
              onMouseEnter={() => setHover(n)}
              onClick={() => onRate(n)}
            >
              ★
            </button>
          ))}
          <span className="stars-label">{shown ? LABELS[shown] : 'Rate this run'}</span>
        </div>
      ) : (
        <div className="stars-label">Your friends rate your run</div>
      )}
    </div>
  )
}
