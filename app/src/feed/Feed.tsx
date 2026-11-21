import { useEffect, useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { getName, getProfile, hasCheered, setCheered as rememberCheer } from './me'
import { MAX_COMMENT, type Comment, type Post } from './posts'
import { Profile } from './Profile'
import { addComment, cheer, deletePost, isMine, loadComments, loadPosts, samplePosts } from './store'
import { Tabs } from './Tabs'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

function Comments({ comments, onAdd }: { comments: Comment[]; onAdd: (body: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim().slice(0, MAX_COMMENT)
    if (!body) return
    setSending(true)
    try {
      await onAdd(body)
      setText('')
    } catch (err) {
      alert(`Couldn't comment: ${(err as Error).message}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="comments">
      {comments.map((c) => (
        <p key={c.id} className="comment">
          <b>{c.user}</b> {c.body} <span className="when">{timeAgo(c.createdAt)}</span>
        </p>
      ))}
      <form onSubmit={send}>
        <input
          value={text}
          maxLength={MAX_COMMENT}
          placeholder="Add a comment…"
          onChange={(e) => setText(e.target.value)}
        />
        <button disabled={sending || !text.trim()}>Send</button>
      </form>
    </div>
  )
}

// onDelete is only passed for your own posts.
function PostCard({
  post,
  comments,
  onComment,
  onDelete,
}: {
  post: Post
  comments: Comment[]
  onComment: (body: string) => Promise<void>
  onDelete?: () => void
}) {
  const [showComments, setShowComments] = useState(false)
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
        <Avatar name={post.user} url={post.avatarUrl} />
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

      <div className="actions">
        <button className={cheered ? 'cheer on' : 'cheer'} onClick={toggleCheer}>
          🍻 {count}
        </button>
        <button className={showComments ? 'cheer on' : 'cheer'} onClick={() => setShowComments(!showComments)}>
          💬 {comments.length}
        </button>
      </div>

      {showComments && <Comments comments={comments} onAdd={onComment} />}
    </article>
  )
}

export function Feed() {
  // Everyone's posts, newest first (in the local feed: yours, then the samples).
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadPosts()
      .then(setPosts)
      .catch((e) => setError(`Couldn't load the feed: ${e.message}`))
    loadComments().then(setComments).catch(console.error)
  }, [])

  async function comment(post: Post, body: string) {
    if (!getProfile()) throw new Error('make your profile first (tap your name at the top)')
    const c: Comment = { id: crypto.randomUUID(), postId: post.id, user: getName(), body, createdAt: Date.now() }
    await addComment(c)
    setComments((all) => [...all, c])
  }

  const card = (p: Post, canDelete: boolean) => (
    <PostCard
      key={p.id}
      post={p}
      comments={comments.filter((c) => c.postId === p.id)}
      onComment={(body) => comment(p, body)}
      onDelete={canDelete ? () => remove(p) : undefined}
    />
  )

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

      {posts.map((p) => card(p, isMine(p)))}
      {samplePosts.map((p) => card(p, false))}
    </main>
  )
}
