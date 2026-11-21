import { useEffect, useMemo, useState } from 'react'
import { MAX_CLIP_BYTES, MAX_RUN_MS, MAX_TITLE, MIN_RUN_MS, type Post } from './posts'
import { getName, getProfile } from './me'
import { DeletePopup, Popup } from './Popup'
import { Profile } from './Profile'
import { saveClip } from './share-video'
import { deleteDraft, isMine, loadDraft, loadPosts, samplePosts, savePost, type Draft } from './store'
import { Tabs } from './Tabs'

const MAX_DESC = 300
const secs = (ms: number) => (ms / 1000).toFixed(2)

// /results.html?demo shows a fake run, for designing this page without a real shotgun.
const DEMO: Draft = { id: 'demo', createdAt: Date.now(), timeMs: 4210, maxAngle: 104, startedBy: ['crack', 'mouth'], clip: null }

const params = new URLSearchParams(location.search)
const isDemo = params.has('demo')

export function Results() {
  const [draft, setDraft] = useState<Draft | null | undefined>(isDemo ? DEMO : undefined) // undefined = loading
  const [all, setAll] = useState<Post[]>([])
  const [title, setTitle] = useState('')
  const [notice, setNotice] = useState<string | null>(null) // why it can't post, in a pop-up
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [desc, setDesc] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    loadPosts().then(setAll).catch(console.error)
    if (!isDemo) loadDraft(params.get('run') ?? '').then((d) => setDraft(d ?? null))
  }, [])

  const videoUrl = useMemo(() => (draft?.clip ? URL.createObjectURL(draft.clip) : null), [draft])

  if (draft === undefined) return null
  if (draft === null) {
    return (
      <main className="feed">
        <Tabs />
        <p>That run wasn't found. <a href="/">Do a run</a></p>
      </main>
    )
  }

  // Personal best: compare with runs you've posted before (not counting this one).
  const others = all.filter((p) => p.id !== draft.id)
  const earlier = others.filter(isMine)
  const best = earlier.length ? Math.min(...earlier.map((p) => p.timeMs)) : null
  const isPB = best === null || draft.timeMs < best
  // Rank among every run we know about (yours + everyone else's).
  const everyone = [...others, ...samplePosts]
  const rank = everyone.filter((p) => p.timeMs < draft.timeMs).length + 1

  async function post() {
    if (!draft) return
    if (!getProfile()) return alert('Make your profile first: tap your name at the top.')
    if (!title.trim()) return setNotice('Must title chug before post')
    // The same limits the database enforces, explained instead of a raw error.
    if (draft.timeMs < MIN_RUN_MS || draft.timeMs > MAX_RUN_MS) return setNotice('Runs must be between 1 and 120 seconds')
    if (draft.clip && draft.clip.size > MAX_CLIP_BYTES) return setNotice('This video is over 50 MB, too big to post')
    setPosting(true)
    try {
      await savePost({
        id: draft.id === 'demo' ? crypto.randomUUID() : draft.id,
        user: getName(),
        profileId: getProfile()?.id ?? null,
        avatarUrl: getProfile()?.avatarUrl ?? null,
        faculty: getProfile()?.faculty ?? null,
        postedAt: Date.now(),
        timeMs: draft.timeMs,
        maxAngle: draft.maxAngle,
        startedBy: draft.startedBy,
        title: title.trim().slice(0, MAX_TITLE),
        description: desc.trim().slice(0, MAX_DESC),
        clip: draft.clip,
        cheers: 0,
      })
      if (draft.id !== 'demo') await deleteDraft(draft.id)
      // Straight to the feed; "replace" so Back doesn't return to this posted run.
      location.replace('/feed.html')
    } catch (e) {
      alert(`Couldn't post: ${(e as Error).message}`)
      setPosting(false)
    }
  }

  // Delete: throw this run away and go back to Record a chug.
  async function retake() {
    if (!draft) return
    if (draft.id !== 'demo') await deleteDraft(draft.id)
    location.href = '/'
  }

  return (
    <main className="feed">
      <Tabs />
      <Profile mine={all.filter(isMine)} />

      <section className="result">
        <div className="big-time">{secs(draft.timeMs)} s</div>
        <div className="pb">
          {isPB ? '🏆 New personal best!' : `+${secs(draft.timeMs - best!)} s off your best (${secs(best!)} s)`}
        </div>
        <div className="rank">#{rank} of {everyone.length + 1} runs</div>

        {videoUrl ? <video src={videoUrl} controls playsInline loop autoPlay muted /> : <div className="no-video">🍺</div>}

        <label className="field title-field">
          Name your shotgun
          <input
            value={title}
            maxLength={MAX_TITLE}
            placeholder="e.g. The Tuesday Torpedo"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="count">{title.length} / {MAX_TITLE}</div>
        <textarea
          className="desc-input"
          maxLength={MAX_DESC}
          rows={3}
          placeholder="Say something about this one…"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="count">{desc.length} / {MAX_DESC}</div>
        <button className="btn primary" onClick={post} disabled={posting}>
          {posting ? 'Posting…' : 'Post'}
        </button>

        {/* Small and quiet on purpose: Post is the one main action. */}
        <div className="result-foot">
          {draft.clip ? (
            <button className="small-link" onClick={() => saveClip(draft.clip!, title)}>
              Save
            </button>
          ) : (
            <span />
          )}
          <button className="small-link" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        </div>

        {notice && (
          <Popup title={notice} onClose={() => setNotice(null)}>
            {null}
          </Popup>
        )}
        {confirmDelete && <DeletePopup title="Delete this chug?" onConfirm={retake} onClose={() => setConfirmDelete(false)} />}
      </section>
    </main>
  )
}
