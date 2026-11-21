import { useEffect, useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { getName, getProfile, hasCheered, setCheered as rememberCheer } from './me'
import { MAX_COMMENT, type Comment, type Post, type PostRating } from './posts'
import { Profile } from './Profile'
import { AvgRating, Rating } from './Rating'
import { addComment, cheer, deletePost, isMine, loadComments, loadPosts, isShared, loadRatings, ratePost, samplePosts } from './store'
import { Tabs } from './Tabs'

function timeAgo(ms: number) {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  return `${Math.round(min / 60)}h ago`
}

function Comments({
  comments,
  onAdd,
  justRated,
}: {
  comments: Comment[]
  onAdd: (body: string) => Promise<void>
  justRated: boolean // opened by a rating: focus the box and ask why
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
          placeholder={justRated ? 'Rated! Say why…' : 'Add a comment…'}
          autoFocus={justRated}
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
  ratings,
  canRate,
  onRate,
  onComment,
  onDelete,
}: {
  post: Post
  comments: Comment[]
  ratings: PostRating[]
  canRate: boolean
  onRate: (stars: number) => Promise<void>
  onComment: (body: string) => Promise<void>
  onDelete?: () => void
}) {
  const [showComments, setShowComments] = useState(false)
  const [justRated, setJustRated] = useState(false)
  const myStars = ratings.find((r) => r.profileId === getProfile()?.id)?.stars ?? null

  // Rating opens the comments so you can add why.
  async function rate(stars: number) {
    try {
      await onRate(stars)
      setJustRated(true)
      setShowComments(true)
    } catch (e) {
      alert(`Couldn't rate: ${(e as Error).message}`)
    }
  }
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
        <AvgRating stars={ratings.map((r) => r.stars)} />
      </div>

      {post.description && <p className="desc">{post.description}</p>}

      <Rating myStars={myStars} canRate={canRate} onRate={rate} />

      <div className="actions">
        <button className={cheered ? 'cheer on' : 'cheer'} onClick={toggleCheer}>
          🍻 {count}
        </button>
        <button
          className={showComments ? 'cheer on' : 'cheer'}
          onClick={() => {
            setShowComments(!showComments)
            setJustRated(false)
          }}
        >
          💬 {comments.length}
        </button>
      </div>

      {showComments && <Comments comments={comments} onAdd={onComment} justRated={justRated} />}
    </article>
  )
}

export function Feed() {
  // Everyone's posts, newest first (in the local feed: yours, then the samples).
  const [posts, setPosts] = useState<Post[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [ratings, setRatings] = useState<PostRating[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    loadPosts()
      .then(setPosts)
      .catch((e) => setError(`Couldn't load the feed: ${e.message}`))
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
    if (!getProfile()) throw new Error('make your profile first (tap your name at the top)')
    const c: Comment = { id: crypto.randomUUID(), postId: post.id, user: getName(), body, createdAt: Date.now() }
    await addComment(c)
    setComments((all) => [...all, c])
  }

  async function rate(post: Post, stars: number) {
    const r = await ratePost(post.id, stars)
    setRatings((all) => [...all.filter((x) => x.id !== r.id), r])
  }

  // Your own posts: you can delete them but not rate them.
  const card = (p: Post, mine: boolean) => (
    <PostCard
      key={p.id}
      post={p}
      comments={comments.filter((c) => c.postId === p.id)}
      ratings={ratings.filter((r) => r.postId === p.id)}
      canRate={!mine}
      onRate={(stars) => rate(p, stars)}
      onComment={(body) => comment(p, body)}
      onDelete={mine ? () => remove(p) : undefined}
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
