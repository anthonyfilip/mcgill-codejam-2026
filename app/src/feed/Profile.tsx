import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { getProfile } from './me'
import type { Post } from './posts'
import { ProfileModal } from './ProfileModal'
import { ensureProfileSaved } from './store'

const secs = (ms: number) => (ms / 1000).toFixed(2)

// "Your profile" strip at the top of the feed, results and leaderboard pages.
// `mine` = your posted runs; the page passes them in so the stats update on post/delete.
// With no profile yet, the set-up pop-up opens straight away.
export function Profile({ mine }: { mine: Post[] }) {
  const profile = getProfile()
  const [editing, setEditing] = useState(!profile)
  const [nameTaken, setNameTaken] = useState(false)

  // Make sure a profile made before the shared database existed gets uploaded to it.
  useEffect(() => {
    ensureProfileSaved()
      .then((ok) => {
        if (!ok) {
          setNameTaken(true)
          setEditing(true)
        }
      })
      .catch(console.error)
  }, [])

  const best = mine.length ? Math.min(...mine.map((p) => p.timeMs)) : null
  const cheers = mine.reduce((sum, p) => sum + p.cheers, 0)
  const name = profile?.username ?? 'you'

  return (
    <section className="profile">
      <button className="avatar-btn" onClick={() => setEditing(true)} title="Edit profile">
        <Avatar name={name} url={profile?.avatarUrl} big />
      </button>
      <div className="who">
        <button className="name" onClick={() => setEditing(true)} title="Edit profile">
          {name} ✎
        </button>
        <div className="profile-stats">
          <span><b>{mine.length}</b> runs</span>
          <span><b>{best !== null ? `${secs(best)} s` : '–'}</b> best</span>
          <span><b>{cheers}</b> 🍻</span>
        </div>
      </div>
      {editing && <ProfileModal required={!profile || nameTaken} nameTaken={nameTaken} onClose={() => setEditing(false)} />}
    </section>
  )
}
