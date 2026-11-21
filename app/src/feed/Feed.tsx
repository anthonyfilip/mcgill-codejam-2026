import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './Avatar'
import { FeedVideo } from './FeedVideo'
import { getName, getProfile, hasCheered, setCheered as rememberCheer } from './me'
import { MAX_COMMENT, type Comment, type Post, type PostRating } from './posts'
import { Popup } from './Popup'
import { ProfileGate } from './Profile'
import { AvgRating, Rating } from './Rating'
import { addComment, cheer, deletePost, isMine, loadComments, loadPosts, isShared, loadRatings, ratePost, samplePosts } from './store'
import { Tabs } from './Tabs'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

// Instagram-style comments: a panel that slides up from the bottom. The comments scroll;
// the "Add a comment…" box stays pinned at the bottom. Drawn straight into <body>: inside the
// feed it sat under the tab bar, which covered the comment box.
function CommentSheet({
  comments,
  onAdd,
  onClose,
}: {
  comments: Comment[]
  onAdd: (body: string) => Promise<void>
  onClose: () => void
}) {
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

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Comments" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <b>Comments</b>
          <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-list">
          {comments.length ? (
            comments.map((c) => (
              <div key={c.id} className="comment">
                <Avatar name={c.user} />
                <p>
                  <b>{c.user}</b> <span className="when">{timeAgo(c.createdAt)}</span>
                  <br />
                  {c.body}
                </p>
              </div>
            ))
          ) : (
            <p className="sheet-empty">No comments yet. Start the conversation.</p>
          )}
        </div>
        <form className="sheet-form" onSubmit={send}>
          <input value={text} maxLength={MAX_COMMENT} placeholder="Add a comment…" onChange={(e) => setText(e.target.value)} />
          <button disabled={sending || !text.trim()}>Post</button>
        </form>
      </div>
    </div>,
    document.body,
  )
}

// One full-screen post. onDelete is only passed for your own posts.
function Reel({
  post,
  comments,
  ratings,
  canRate,
  onRate,
  onComment,
  onDelete,
  muted,
  onToggleMute,
  onBlocked,
}: {
  post: Post
  comments: Comment[]
  ratings: PostRating[]
  canRate: boolean
  onRate: (stars: number) => Promise<void>
  onComment: (body: string) => Promise<void>
  onDelete?: () => void
  muted: boolean
  onToggleMute: () => void
  onBlocked: () => void
}) {
  const [rating, setRating] = useState(false) // stars pop-up
  const [commenting, setCommenting] = useState(false) // comments panel
  const [cheered, setCheered] = useState(() => hasCheered(post.id))
  const [count, setCount] = useState(post.cheers)
  const videoUrl = useMemo(() => post.videoUrl ?? (post.clip ? URL.createObjectURL(post.clip) : null), [post])
  const myStars = ratings.find((r) => r.profileId === getProfile()?.id)?.stars ?? null

  function toggleCheer() {
    const on = !cheered
    setCheered(on)
    setCount(count + (on ? 1 : -1))
    rememberCheer(post.id, on)
    cheer(post, on ? 1 : -1).catch(console.error)
  }

  // Save the rating, show "You rated: Epic" for a moment, then close.
  async function rate(stars: number) {
    try {
      await onRate(stars)
      setTimeout(() => setRating(false), 900)
    } catch (e) {
      alert(`Couldn't rate: ${(e as Error).message}`)
    }
  }

  return (
    <article className="reel">
      {videoUrl ? (
        <FeedVideo src={videoUrl} muted={muted} onToggleMute={onToggleMute} onBlocked={onBlocked} />
      ) : (
        <div className="no-video">🍺</div>
      )}

      <div className="reel-info">
        <a className="reel-user" href={`/profile.html?user=${encodeURIComponent(post.user)}`}>
          <Avatar name={post.user} url={post.avatarUrl} />
          <b>{post.user}</b>
          <span className="when">{timeAgo(post.postedAt)}</span>
        </a>
        {post.title && <h3 className="reel-title">{post.title}</h3>}
        <div className="reel-stats">
          <span className="time">{(post.timeMs / 1000).toFixed(2)} s</span>
          <AvgRating stars={ratings.map((r) => r.stars)} />
        </div>
        {post.description && <p className="reel-desc">{post.description}</p>}
      </div>

      <div className="reel-actions">
        <button className={cheered ? 'action on' : 'action'} onClick={toggleCheer} aria-label="Cheers">
          <span className="action-icon">🍻</span>
          {count}
        </button>
        <button className={myStars ? 'action on' : 'action'} onClick={() => setRating(true)} aria-label="Rate">
          <span className="action-icon">⭐</span>
          Rate
        </button>
        <button className="action" onClick={() => setCommenting(true)} aria-label="Comments">
          <span className="action-icon">💬</span>
          {comments.length}
        </button>
        {onDelete && (
          <button className="action delete" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>

      {rating && (
        <Popup title="Rate this run" onClose={() => setRating(false)}>
          <Rating myStars={myStars} canRate={canRate} onRate={rate} />
        </Popup>
      )}
      {commenting && <CommentSheet comments={comments} onAdd={onComment} onClose={() => setCommenting(false)} />}
    </article>
  )
}

export function Feed() {
  // Everyone's posts, newest first (in the local feed: yours, then the samples).
  const [posts, setPosts] = useState<Post[] | null>(null) // null = loading
  const [comments, setComments] = useState<Comment[]>([])
  const [ratings, setRatings] = useState<PostRating[]>([])
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const onBlocked = useCallback(() => setMuted(true), [])

  useEffect(() => {
    loadPosts()
      .then(setPosts)
      .catch((e) => {
        setPosts([])
        setError(`Couldn't load the feed: ${e.message}`)
      })
    loadComments().then(setComments).catch(console.error)
    loadRatings().then(setRatings).catch(console.error)
  }, [])

  // Shared feed: pick up everyone else's new ratings so the averages stay live.
  useEffect(() => {
    if (!isShared) return
    const t = setInterval(() => loadRatings().then(setRatings).catch(console.error), 10_000)
    return () => clearInterval(t)
  }, [])

  async function comment(post: Post, body: string) {
    if (!getProfile()) throw new Error('make your profile first (Profile tab)')
    const c: Comment = { id: crypto.randomUUID(), postId: post.id, user: getName(), body, createdAt: Date.now() }
    await addComment(c)
    setComments((all) => [...all, c])
  }

  async function rate(post: Post, stars: number) {
    const r = await ratePost(post.id, stars)
    setRatings((all) => [...all.filter((x) => x.id !== r.id), r])
  }

  async function remove(post: Post) {
    if (!confirm('Delete this post?')) return
    try {
      await deletePost(post)
      setPosts((all) => (all ?? []).filter((p) => p.id !== post.id))
    } catch (e) {
      alert(`Couldn't delete: ${(e as Error).message}`)
    }
  }

  // Your own posts: you can delete them but not rate them.
  const reel = (p: Post, mine: boolean) => (
    <Reel
      key={p.id}
      post={p}
      comments={comments.filter((c) => c.postId === p.id)}
      ratings={ratings.filter((r) => r.postId === p.id)}
      canRate={!mine}
      onRate={(stars) => rate(p, stars)}
      onComment={(body) => comment(p, body)}
      onDelete={mine ? () => remove(p) : undefined}
      muted={muted}
      onToggleMute={() => setMuted(!muted)}
      onBlocked={onBlocked}
    />
  )

  const all = [...(posts ?? []), ...samplePosts]

  return (
    <>
      <main className="reels">
        {error && <p className="error reel-message">{error}</p>}
        {posts === null && <p className="reel-message">Loading…</p>}
        {posts !== null && !all.length && (
          <div className="reel-message">
            <p>No runs yet. Be the first!</p>
            <a className="btn primary" href="/">Record a chug</a>
          </div>
        )}
        {(posts ?? []).map((p) => reel(p, isMine(p)))}
        {samplePosts.map((p) => reel(p, false))}
      </main>
      <ProfileGate />
      <Tabs active="/feed.html" />
    </>
  )
}
