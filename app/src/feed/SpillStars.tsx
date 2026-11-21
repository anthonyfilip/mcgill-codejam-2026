import { useState } from 'react'
import type { SpillRating } from './posts'

const LABELS = ['', 'Clean', 'A few drops', 'Some spill', 'Messy', 'Soaked']

// Spill rating for a post: the average, plus 5 tappable stars (1 = clean, 5 = soaked).
export function SpillStars({
  ratings,
  myStars,
  canRate,
  onRate,
}: {
  ratings: SpillRating[]
  myStars: number | null
  canRate: boolean
  onRate: (stars: number) => void
}) {
  const [hover, setHover] = useState(0)
  const avg = ratings.length ? ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length : null
  const shown = hover || myStars || 0

  return (
    <div className="spill">
      <div className="spill-head">
        <b>💧 Spill</b>
        <span className="spill-avg">
          {avg !== null
            ? `${avg.toFixed(1)} / 5 · ${LABELS[Math.round(avg)]} · ${ratings.length} ${ratings.length === 1 ? 'rating' : 'ratings'}`
            : 'No ratings yet'}
        </span>
      </div>
      {canRate ? (
        <div className="stars" role="radiogroup" aria-label="Rate the spill, 1 clean to 5 soaked" onMouseLeave={() => setHover(0)}>
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
          <span className="stars-label">{shown ? LABELS[shown] : 'Rate the spill: 1 clean, 5 soaked'}</span>
        </div>
      ) : (
        <div className="stars-label">Your friends rate your spill</div>
      )}
    </div>
  )
}
