import { useEffect, useMemo, useState } from 'react'
import { SAMPLE_POSTS, type Post } from './posts'
import { Profile } from './Profile'
import { deletePost, loadPosts } from './store'
import { Tabs } from './Tabs'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

// onDelete is only passed for your own posts.
function PostCard({ post, onDelete }: { post: Post; onDelete?: () => void }) {
  const [cheered, setCheered] = useState(false)
  const videoUrl = useMemo(() => (post.clip ? URL.createObjectURL(post.clip) : null), [post.clip])
  return (
    <article className="post">
      <header>
        <span className="avatar">{post.user[0].toUpperCase()}</span>
        <b>{post.user}</b>
        <span className="when">{timeAgo(post.postedAt)}</span>
        {onDelete && (
          <button className="delete" onClick={onDelete} title="Delete post">
            🗑
          </button>
        )}
      </header>

      {videoUrl ? (
        <video src={videoUrl} controls playsInline loop muted autoPlay />
      ) : (
        <div className="no-video">🍺</div>
      )}

      <div className="stats">
        <span className="time">{(post.timeMs / 1000).toFixed(2)} s</span>
      </div>

      {post.description && <p className="desc">{post.description}</p>}

      <button className={cheered ? 'cheer on' : 'cheer'} onClick={() => setCheered(!cheered)}>
        🍻 {post.cheers + (cheered ? 1 : 0)}
      </button>
    </article>
  )
}

export function Feed() {
  // Your posts (saved in this browser), newest first, shown above the samples.
  const [mine, setMine] = useState<Post[]>([])

  useEffect(() => {
    loadPosts().then(setMine)
  }, [])

  async function remove(post: Post) {
    if (!confirm('Delete this post?')) return
    await deletePost(post.id)
    setMine(mine.filter((p) => p.id !== post.id))
  }

  return (
    <main className="feed">
      <Tabs active="/feed.html" />
      <Profile mine={mine} />

      {mine.map((p) => (
        <PostCard key={p.id} post={p} onDelete={() => remove(p)} />
      ))}
      {SAMPLE_POSTS.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </main>
  )
}
