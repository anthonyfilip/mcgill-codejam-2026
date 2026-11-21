import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { getProfile } from './me'
import type { Post } from './posts'
import { ProfileModal } from './ProfileModal'
import { ensureProfileSaved } from './store'

const secs = (ms: number) => (ms / 1000).toFixed(2)

// Uploads a profile made before the shared database existed, and shows the must-do pop-up
// when there's no profile yet or its name was taken. Used on every page (the feed has no strip).
export function ProfileGate() {
  const profile = getProfile()
  const [nameTaken, setNameTaken] = useState(false)

  useEffect(() => {
    ensureProfileSaved()
      .then((ok) => setNameTaken(!ok))
      .catch(console.error)
  }, [])

  return !profile || nameTaken ? <ProfileModal nameTaken={nameTaken} /> : null
}

// "Your profile" strip at the top of the results and leaderboard pages; tap it to open the
// profile page. `mine` = your posted runs, so the stats update on post/delete.
export function Profile({ mine }: { mine: Post[] }) {
  const profile = getProfile()

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
      <ProfileGate />
    </section>
  )
}
