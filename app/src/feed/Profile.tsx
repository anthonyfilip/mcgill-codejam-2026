import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { getProfile } from './me'
import type { Post } from './posts'
import { ProfileModal } from './ProfileModal'
import { ensureProfileSaved } from './store'

const secs = (ms: number) => (ms / 1000).toFixed(2)

// "Your profile" strip at the top of the feed, results and leaderboard pages; tap it to
// open the profile page. `mine` = your posted runs, so the stats update on post/delete.
// With no profile yet (or your name taken), the must-do pop-up opens instead.
export function Profile({ mine }: { mine: Post[] }) {
  const profile = getProfile()
  const [nameTaken, setNameTaken] = useState(false)

  // Make sure a profile made before the shared database existed gets uploaded to it.
  useEffect(() => {
    ensureProfileSaved()
      .then((ok) => setNameTaken(!ok))
      .catch(console.error)
  }, [])

  const best = mine.length ? Math.min(...mine.map((p) => p.timeMs)) : null
  const cheers = mine.reduce((sum, p) => sum + p.cheers, 0)
  const name = profile?.username ?? 'you'

  return (
    <section className="profile">
      <a className="avatar-btn" href="/profile.html" title="Your profile">
        <Avatar name={name} url={profile?.avatarUrl} big />
      </a>
      <div className="who">
        <a className="name" href="/profile.html" title="Your profile">
          {name} ✎
        </a>
        <div className="profile-stats">
          <span><b>{mine.length}</b> runs</span>
          <span><b>{best !== null ? `${secs(best)} s` : '–'}</b> best</span>
          <span><b>{cheers}</b> 🍻</span>
        </div>
      </div>
      {(!profile || nameTaken) && <ProfileModal nameTaken={nameTaken} />}
    </section>
  )
}
