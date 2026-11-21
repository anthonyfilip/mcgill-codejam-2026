import { useState } from 'react'
import type { Post } from './posts'
import { getName, setName } from './me'

const secs = (ms: number) => (ms / 1000).toFixed(2)

// "Your profile" strip at the top of the feed, results and leaderboard pages.
// `mine` = your posted runs; the page passes them in so the stats update on post/delete.
export function Profile({ mine }: { mine: Post[] }) {
  const [name, setLocalName] = useState(getName)

  function rename() {
    const next = prompt('Your name', name)?.trim().slice(0, 24)
    if (!next) return
    setName(next)
    setLocalName(next)
  }

  const best = mine.length ? Math.min(...mine.map((p) => p.timeMs)) : null
  const cheers = mine.reduce((sum, p) => sum + p.cheers, 0)

  return (
    <section className="profile">
      <span className="avatar big">{name[0].toUpperCase()}</span>
      <div className="who">
        <button className="name" onClick={rename} title="Change your name">
          {name} ✎
        </button>
        <div className="profile-stats">
          <span><b>{mine.length}</b> runs</span>
          <span><b>{best !== null ? `${secs(best)} s` : '–'}</b> best</span>
          <span><b>{cheers}</b> 🍻</span>
        </div>
      </div>
    </section>
  )
}
