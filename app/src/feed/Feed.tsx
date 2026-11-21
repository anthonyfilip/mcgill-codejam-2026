import { useState } from 'react'
import { SAMPLE_POSTS, type Post } from './posts'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

function PostCard({ post }: { post: Post }) {
  const [cheered, setCheered] = useState(false)
  return (
    <article className="post">
      <header>
        <span className="avatar">{post.user[0].toUpperCase()}</span>
        <b>{post.user}</b>
        <span className="when">{timeAgo(post.postedAt)}</span>
      </header>

      {post.videoUrl ? (
        <video src={post.videoUrl} controls playsInline loop muted autoPlay />
      ) : (
        <div className="no-video">🍺</div>
      )}

      <div className="stats">
        <span className="time">{(post.timeMs / 1000).toFixed(2)} s</span>
        {post.maxAngle !== null && <span>{post.maxAngle}° max</span>}
        <span className="by">started by {post.startedBy.join(' + ')}</span>
      </div>

      <button className={cheered ? 'cheer on' : 'cheer'} onClick={() => setCheered(!cheered)}>
        🍻 {post.cheers + (cheered ? 1 : 0)}
      </button>
    </article>
  )
}

export function Feed() {
  const [posts, setPosts] = useState<Post[]>(SAMPLE_POSTS)

  // Until there's a backend: post a clip downloaded from the tracker. Lives only in this tab.
  function addClip(file: File) {
    const post: Post = {
      id: crypto.randomUUID(),
      user: 'you',
      postedAt: Date.now(),
      timeMs: 0,
      maxAngle: null,
      startedBy: [],
      videoUrl: URL.createObjectURL(file),
      cheers: 0,
    }
    setPosts([post, ...posts])
  }

  return (
    <main className="feed">
      <nav className="tabs">
        <a href="/">Tracker</a>
        <a href="/feed.html" className="active">Feed</a>
      </nav>

      <label className="upload">
        + Post a clip
        <input type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && addClip(e.target.files[0])} />
      </label>

      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </main>
  )
}
