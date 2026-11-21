import { useEffect, useMemo, useState } from 'react'
import { hasCheered, setCheered as rememberCheer } from './me'
import type { Post } from './posts'
import { Profile } from './Profile'
import { cheer, deletePost, isMine, loadPosts, samplePosts } from './store'
import { Tabs } from './Tabs'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

// onDelete is only passed for your own posts.
function PostCard({ post, onDelete }: { post: Post; onDelete?: () => void }) {
  const [cheered, setCheered] = useState(() => hasCheered(post.id))
  const [count, setCount] = useState(post.cheers)
  const videoUrl = useMemo(() => post.videoUrl ?? (post.clip ? URL.createObjectURL(post.clip) : null), [post])

  function toggleCheer() {
    const on = !cheered
    setCheered(on)
    setCount(count + (on ? 1 : -1))
    rememberCheer(post.id, on)
    cheer(post, on ? 1 : -1).catch(console.error)
  }
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

      <button className={cheered ? 'cheer on' : 'cheer'} onClick={toggleCheer}>
        🍻 {count}
      </button>
    </article>
  )
}

export function Feed() {
  // Everyone's posts, newest first (in the local feed: yours, then the samples).
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadPosts()
      .then(setPosts)
      .catch((e) => setError(`Couldn't load the feed: ${e.message}`))
  }, [])

  async function remove(post: Post) {
    if (!confirm('Delete this post?')) return
    try {
      await deletePost(post)
      setPosts(posts.filter((p) => p.id !== post.id))
    } catch (e) {
      alert(`Couldn't delete: ${(e as Error).message}`)
    }
  }

  return (
    <main className="feed">
      <Tabs active="/feed.html" />
      <Profile mine={posts.filter(isMine)} />
      {error && <p className="error">{error}</p>}

      {posts.map((p) => (
        <PostCard key={p.id} post={p} onDelete={isMine(p) ? () => remove(p) : undefined} />
      ))}
      {samplePosts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </main>
  )
}
