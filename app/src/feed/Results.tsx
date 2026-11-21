import { useEffect, useMemo, useState } from 'react'
import type { Post } from './posts'
import { getName } from './me'
import { Profile } from './Profile'
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
  const [desc, setDesc] = useState('')
  const [posted, setPosted] = useState(false)
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
    setPosting(true)
    try {
      await savePost({
        id: draft.id === 'demo' ? crypto.randomUUID() : draft.id,
        user: getName(),
        postedAt: Date.now(),
        timeMs: draft.timeMs,
        maxAngle: draft.maxAngle,
        startedBy: draft.startedBy,
        description: desc.trim().slice(0, MAX_DESC),
        clip: draft.clip,
        cheers: 0,
      })
      if (draft.id !== 'demo') await deleteDraft(draft.id)
      setPosted(true)
    } catch (e) {
      alert(`Couldn't post: ${(e as Error).message}`)
    } finally {
      setPosting(false)
    }
  }

  // Throw this run away and go back to the tracker.
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

        {posted ? (
          <a className="btn primary" href="/feed.html">Posted ✔ View feed</a>
        ) : (
          <>
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
              {posting ? 'Posting…' : 'Post to feed'}
            </button>
          </>
        )}

        <div className="row">
          {posted ? (
            <a className="btn" href="/">Go again</a>
          ) : (
            <button className="btn" onClick={retake}>Retake</button>
          )}
          {videoUrl && <a className="btn" href={videoUrl} download="shotgun.webm">Download</a>}
        </div>
      </section>
    </main>
  )
}
