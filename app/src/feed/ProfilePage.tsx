import { useEffect, useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { getProfile } from './me'
import type { Post } from './posts'
import { Popup } from './Popup'
import { ProfileGate } from './Profile'
import { ProfileForm } from './ProfileModal'
import { ensureProfileSaved, isMine, loadPosts, samplePosts } from './store'
import { Tabs } from './Tabs'

const secs = (ms: number) => (ms / 1000).toFixed(2)
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const videoOf = (p: Post) => p.videoUrl ?? (p.clip ? URL.createObjectURL(p.clip) : null)

// One square in the video grid: a still from the clip with the time on top.
function Tile({ post, onOpen }: { post: Post; onOpen: () => void }) {
  const url = useMemo(() => videoOf(post), [post])
  return (
    <button className="tile" onClick={onOpen} aria-label={`${post.title || 'Run'}, ${secs(post.timeMs)} seconds`}>
      {/* #t=0.1 makes iPhones show a frame instead of a black square */}
      {url ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" /> : <span className="tile-empty">🍺</span>}
      <span className="tile-time">{secs(post.timeMs)} s</span>
    </button>
  )
}

// /profile.html: your own page (edit name + photo, your runs), or with ?user=<name> someone
// else's page: their photo, stats and every shotgun they've posted.
export function ProfilePage() {
  const viewing = new URLSearchParams(location.search).get('user')
  const me = getProfile()
  const isMe = !viewing || viewing === me?.username
  const [posts, setPosts] = useState<Post[] | null>(null) // null = loading
  const [nameTaken, setNameTaken] = useState(false)
  const [playing, setPlaying] = useState<Post | null>(null)

  useEffect(() => {
    if (isMe)
      ensureProfileSaved()
        .then((ok) => setNameTaken(!ok))
        .catch(console.error)
    loadPosts()
      .then((all) => setPosts([...all, ...samplePosts].filter((p) => (isMe ? isMine(p) : p.user === viewing))))
      .catch(() => setPosts([]))
  }, [isMe, viewing])

  const runs = posts ?? []
  const best = runs.length ? Math.min(...runs.map((p) => p.timeMs)) : null
  const cheers = runs.reduce((sum, p) => sum + p.cheers, 0)
  const playUrl = useMemo(() => (playing ? videoOf(playing) : null), [playing])

  return (
    <main className="feed">
      <Tabs active={isMe ? '/profile.html' : undefined} />

      {isMe ? (
        <section className="profile-page">
          <ProfileForm nameTaken={nameTaken} />
          <a className="btn record-cta" href="/">
            Record a chug
          </a>
        </section>
      ) : (
        <section className="person">
          <Avatar name={viewing!} url={runs[0]?.avatarUrl} big />
          <h2>{viewing}</h2>
          {runs[0]?.faculty && <span className="faculty-tag">{runs[0].faculty}</span>}
        </section>
      )}

      {(!isMe || me) && (
        <>
          <div className="profile-page-stats">
            <div><b>{runs.length}</b>runs</div>
            <div><b>{best !== null ? `${secs(best)} s` : '–'}</b>best</div>
            <div><b>{cheers}</b>🍻 cheers</div>
          </div>

          <h3 className="section-title">{isMe ? 'Your shotguns' : 'Shotguns'}</h3>
          {posts === null ? (
            <p className="empty">Loading…</p>
          ) : runs.length ? (
            <div className="grid">
              {runs.map((p) => (
                <Tile key={p.id} post={p} onOpen={() => setPlaying(p)} />
              ))}
            </div>
          ) : (
            <p className="empty">
              No shotguns yet.{isMe && <> <a href="/">Record your first chug</a></>}
            </p>
          )}
        </>
      )}

      {playing && (
        <Popup title={`${playing.title || 'Run'} · ${secs(playing.timeMs)} s`} onClose={() => setPlaying(null)}>
          {playUrl ? <video className="popup-video" src={playUrl} controls autoPlay playsInline /> : <div className="no-video">🍺</div>}
          <p className="popup-meta">
            {day(playing.postedAt)}
            {playing.description && <> · {playing.description}</>}
          </p>
        </Popup>
      )}

      {!isMe && <ProfileGate />}
    </main>
  )
}
