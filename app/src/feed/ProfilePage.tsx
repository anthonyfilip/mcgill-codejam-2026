import { useEffect, useState } from 'react'
import { getProfile } from './me'
import type { Post } from './posts'
import { ProfileForm } from './ProfileModal'
import { ensureProfileSaved, isMine, loadPosts } from './store'
import { Tabs } from './Tabs'

const secs = (ms: number) => (ms / 1000).toFixed(2)

// /profile.html: change your name and photo, and see your runs.
export function ProfilePage() {
  const [mine, setMine] = useState<Post[]>([])
  const [nameTaken, setNameTaken] = useState(false)

  useEffect(() => {
    ensureProfileSaved()
      .then((ok) => setNameTaken(!ok))
      .catch(console.error)
    loadPosts()
      .then((all) => setMine(all.filter(isMine)))
      .catch(console.error)
  }, [])

  const best = mine.length ? Math.min(...mine.map((p) => p.timeMs)) : null
  const cheers = mine.reduce((sum, p) => sum + p.cheers, 0)

  return (
    <main className="feed">
      <Tabs active="/profile.html" />

      <section className="profile-page">
        <ProfileForm nameTaken={nameTaken} />
      </section>

      {getProfile() && (
        <>
          <div className="profile-page-stats">
            <div><b>{mine.length}</b>runs</div>
            <div><b>{best !== null ? `${secs(best)} s` : '–'}</b>best</div>
            <div><b>{cheers}</b>🍻 cheers</div>
          </div>

          <h3 className="section-title">Your runs</h3>
          {mine.length ? (
            <ol className="board">
              {mine.map((p) => (
                <li key={p.id}>
                  <span className="who">
                    {p.title || 'Untitled run'}
                    <small>{new Date(p.postedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                  </span>
                  <span className="score">
                    <b className="best">{secs(p.timeMs)} s</b>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty">No runs yet. <a href="/">Record your first chug</a></p>
          )}
        </>
      )}
    </main>
  )
}
