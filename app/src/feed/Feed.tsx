import { useEffect, useMemo, useState } from 'react'
import { SAMPLE_POSTS, type Post } from './posts'
import { loadPosts } from './store'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

function PostCard({ post }: { post: Post }) {
  const [cheered, setCheered] = useState(false)
  const videoUrl = useMemo(() => (post.clip ? URL.createObjectURL(post.clip) : null), [post.clip])
  return (
    <article className="post">
      <header>
        <span className="avatar">{post.user[0].toUpperCase()}</span>
        <b>{post.user}</b>
        <span className="when">{timeAgo(post.postedAt)}</span>
      </header>

      {videoUrl ? (
        <video src={videoUrl} controls playsInline loop muted autoPlay />
      ) : (
        <div className="no-video">🍺</div>
      )}

      <div className="stats">
        <span className="time">{(post.timeMs / 1000).toFixed(2)} s</span>
      </div>

      <button className={cheered ? 'cheer on' : 'cheer'} onClick={() => setCheered(!cheered)}>
        🍻 {post.cheers + (cheered ? 1 : 0)}
      </button>
    </article>
  )
}

export function Feed() {
  const [posts, setPosts] = useState<Post[]>(SAMPLE_POSTS)

  // Runs posted from the tracker's results card, newest first, above the samples.
  useEffect(() => {
    loadPosts().then((saved) => setPosts([...saved, ...SAMPLE_POSTS]))
  }, [])

  return (
    <main className="feed">
      <nav className="tabs">
        <a href="/">Tracker</a>
        <a href="/feed.html" className="active">Feed</a>
      </nav>

      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </main>
  )
}
