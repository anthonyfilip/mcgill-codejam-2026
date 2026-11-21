import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from './Avatar'
import { FeedVideo } from './FeedVideo'
import { CommentIcon, ShareIcon, StarIcon } from './Icons'
import { getName, getProfile, hasCheered, setCheered as rememberCheer } from './me'
import { MAX_COMMENT, RATING_LABELS, type Comment, type Post, type PostRating } from './posts'
import { DeletePopup, Popup } from './Popup'
import { ProfileGate } from './Profile'
import { AvgRating, Rating } from './Rating'
import { addComment, cheer, cheerComment, deleteComment, deletePost, isMine, loadComments, loadPosts, isShared, loadRatings, ratePost, samplePosts } from './store'
import { sharePost } from './share-video'
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
// 🍻 on a comment: one per person (remembered in this browser), tap again to take it back.
function CommentCheer({ comment }: { comment: Comment }) {
  const key = `comment:${comment.id}`
  const [on, setOn] = useState(() => hasCheered(key))
  const [count, setCount] = useState(comment.cheers ?? 0)
  function toggle() {
    setOn(!on)
    setCount(count + (on ? -1 : 1))
    rememberCheer(key, !on)
    cheerComment(comment, on ? -1 : 1).catch(console.error)
  }
  return (
    <button className={on ? 'comment-cheer on' : 'comment-cheer'} onClick={toggle} aria-label="Cheers">
      🍻 {count > 0 && count}
    </button>
  )
}

// Beside each commenter's name: "Author" for the person who posted, otherwise how they rated
// this post, e.g. "Legendary ★" (nothing if they haven't rated it). Your own comments can be deleted.
function CommentSheet({
  post,
  comments,
  ratings,
  onAdd,
  onDelete,
  onClose,
}: {
  post: Post
  comments: Comment[]
  ratings: PostRating[]
  onAdd: (body: string) => Promise<void>
  onDelete: (c: Comment) => void
  onClose: () => void
}) {
  const me = getProfile()?.id
  const [deleting, setDeleting] = useState<Comment | null>(null)
  const isAuthor = (c: Comment) => (c.profileId && post.profileId ? c.profileId === post.profileId : c.user === post.user)
  const starsBy = (c: Comment) => ratings.find((r) => r.profileId === c.profileId)?.stars
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  // Swipe the panel down to close it: from the handle/title, or from the list when it's
  // scrolled to the top. It follows your finger; let go past 100 px and it closes.
  function dragStart(e: React.TouchEvent, fromList: boolean) {
    if (fromList && (listRef.current?.scrollTop ?? 0) > 0) return
    drag.current = { y: e.touches[0].clientY, dy: 0 }
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  function dragMove(e: React.TouchEvent) {
    if (!drag.current || !sheetRef.current) return
    const dy = e.touches[0].clientY - drag.current.y
    if (dy < 0) {
      // Moving up = scrolling the list, not closing.
      drag.current = null
      sheetRef.current.style.transform = ''
      return
    }
    drag.current.dy = dy
    sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  function dragEnd() {
    const el = sheetRef.current
    const dy = drag.current?.dy ?? 0
    drag.current = null
    if (!el) return
    el.style.transition = 'transform 0.2s ease-out'
    if (dy > 100) {
      el.style.transform = 'translateY(100%)'
      setTimeout(onClose, 200)
    } else el.style.transform = ''
  }

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
      <div ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label="Comments" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-drag" onTouchStart={(e) => dragStart(e, false)} onTouchMove={dragMove} onTouchEnd={dragEnd}>
          <div className="sheet-grip" />
          <div className="sheet-head">
            <b>Comments</b>
            <button className="sheet-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div ref={listRef} className="sheet-list" onTouchStart={(e) => dragStart(e, true)} onTouchMove={dragMove} onTouchEnd={dragEnd}>
          {comments.length ? (
            comments.map((c) => (
              <div key={c.id} className="comment">
                <Avatar name={c.user} />
                <p>
                  <b>{c.user}</b>{' '}
                  {isAuthor(c) ? (
                    <span className="author-tag">Author</span>
                  ) : (
                    starsBy(c) && <span className="comment-stars">{RATING_LABELS[starsBy(c)!]} ★</span>
                  )}{' '}
                  <span className="when">{timeAgo(c.createdAt)}</span>
                  <br />
                  {c.body}
                  {me && c.profileId === me && (
                    <>
                      <br />
                      <button className="comment-delete" onClick={() => setDeleting(c)}>
                        Delete
                      </button>
                    </>
                  )}
                </p>
                <CommentCheer comment={c} />
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
        {deleting && (
          <DeletePopup
            title="Delete this comment?"
            onConfirm={() => {
              onDelete(deleting)
              setDeleting(null)
            }}
            onClose={() => setDeleting(null)}
          />
        )}
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
  onDeleteComment,
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
  onDeleteComment: (c: Comment) => void
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
    <article className="reel" id={`reel-${post.id}`}>
      {videoUrl ? (
        <FeedVideo src={videoUrl} muted={muted} onToggleMute={onToggleMute} onBlocked={onBlocked} />
      ) : (
        <div className="no-video">🍺</div>
      )}

      <div className="reel-info">
        <a className="reel-user" href={`/profile.html?user=${encodeURIComponent(post.user)}`}>
          <Avatar name={post.user} url={post.avatarUrl} />
          <b>{post.user}</b>
          {post.faculty && <span className="faculty-tag">{post.faculty}</span>}
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
        <button className="action" onClick={() => setRating(true)} aria-label={myStars ? `You rated ${myStars} of 5` : 'Rate'}>
          <span className="action-icon">
            <StarIcon filled={!!myStars} />
          </span>
          Rate
        </button>
        <button className="action" onClick={() => setCommenting(true)} aria-label={`Comments (${comments.length})`}>
          <span className="action-icon">
            <CommentIcon />
            {comments.length > 0 && <span className="action-badge">{comments.length}</span>}
          </span>
          Comment
        </button>
        <button className="action" onClick={() => sharePost(post)} aria-label="Share">
          <span className="action-icon">
            <ShareIcon />
          </span>
          Share
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
      {commenting && (
        <CommentSheet
          post={post}
          comments={comments}
          ratings={ratings}
          onAdd={onComment}
          onDelete={onDeleteComment}
          onClose={() => setCommenting(false)}
        />
      )}
    </article>
  )
}

// /feed.html?user=<name>&post=<id>: just that person's shotguns (opened from their profile),
// starting at the one tapped. /feed.html?post=<id> (a shared link): that post first.
const params = new URLSearchParams(location.search)
const onlyUser = params.get('user')
const startPost = params.get('post')

export function Feed() {
  // Everyone's posts, newest first (in the local feed: yours, then the samples).
  const [posts, setPosts] = useState<Post[] | null>(null) // null = loading
  const [comments, setComments] = useState<Comment[]>([])
  const [ratings, setRatings] = useState<PostRating[]>([])
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [deleting, setDeleting] = useState<Post | null>(null) // asking "Delete this chug?"
  const onBlocked = useCallback(() => setMuted(true), [])

  useEffect(() => {
    loadPosts()
      .then((all) => {
        if (onlyUser) return setPosts(all.filter((p) => p.user === onlyUser))
        const i = all.findIndex((p) => p.id === startPost)
        setPosts(i > 0 ? [all[i], ...all.slice(0, i), ...all.slice(i + 1)] : all)
      })
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
    const c: Comment = {
      id: crypto.randomUUID(),
      postId: post.id,
      user: getName(),
      profileId: getProfile()?.id ?? null,
      body,
      createdAt: Date.now(),
    }
    await addComment(c)
    setComments((all) => [...all, c])
  }

  async function removeComment(c: Comment) {
    try {
      await deleteComment(c)
      setComments((all) => all.filter((x) => x.id !== c.id))
    } catch (e) {
      alert(`Couldn't delete: ${(e as Error).message}`)
    }
  }

  async function rate(post: Post, stars: number) {
    const r = await ratePost(post.id, stars)
    setRatings((all) => [...all.filter((x) => x.id !== r.id), r])
  }

  async function remove(post: Post) {
    setDeleting(null)
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
      onDeleteComment={removeComment}
      onDelete={mine ? () => setDeleting(p) : undefined}
      muted={muted}
      onToggleMute={() => setMuted(!muted)}
      onBlocked={onBlocked}
    />
  )

  // From someone's profile: jump to the shotgun they tapped (scroll up/down for the rest).
  useEffect(() => {
    if (onlyUser && startPost && posts) document.getElementById(`reel-${startPost}`)?.scrollIntoView({ block: 'start' })
  }, [posts])

  const samples = onlyUser ? samplePosts.filter((p) => p.user === onlyUser) : samplePosts
  const all = [...(posts ?? []), ...samples]

  return (
    <>
      {onlyUser ? (
        <a className="record-btn back-btn" href={`/profile.html?user=${encodeURIComponent(onlyUser)}`}>
          ← {onlyUser}
        </a>
      ) : (
        <a className="record-btn" href="/">
          Record a chug
        </a>
      )}
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
        {samples.map((p) => reel(p, false))}
      </main>
      {deleting && <DeletePopup title="Delete this chug?" onConfirm={() => remove(deleting)} onClose={() => setDeleting(null)} />}
      <ProfileGate />
      <Tabs active="/feed.html" />
    </>
  )
}
