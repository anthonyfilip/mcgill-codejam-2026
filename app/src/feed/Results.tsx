import { useEffect, useMemo, useState } from 'react'
import { SAMPLE_POSTS, type Post } from './posts'
import { getName } from './name'
import { Profile } from './Profile'
import { deleteDraft, loadDraft, loadPosts, savePost, type Draft } from './store'
import { Tabs } from './Tabs'

const MAX_DESC = 300
const secs = (ms: number) => (ms / 1000).toFixed(2)

// /results.html?demo shows a fake run, for designing this page without a real shotgun.
const DEMO: Draft = { id: 'demo', createdAt: Date.now(), timeMs: 4210, maxAngle: 104, startedBy: ['crack', 'mouth'], clip: null }

const params = new URLSearchParams(location.search)
const isDemo = params.has('demo')

export function Results() {
  const [draft, setDraft] = useState<Draft | null | undefined>(isDemo ? DEMO : undefined) // undefined = loading
  const [mine, setMine] = useState<Post[]>([])
  const [desc, setDesc] = useState('')
  const [posted, setPosted] = useState(false)

  useEffect(() => {
    loadPosts().then(setMine)
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
  const earlier = mine.filter((p) => p.id !== draft.id)
  const best = earlier.length ? Math.min(...earlier.map((p) => p.timeMs)) : null
  const isPB = best === null || draft.timeMs < best
  // Rank among every run we know about (your posts + everyone else's).
  const everyone = [...earlier, ...SAMPLE_POSTS]
  const rank = everyone.filter((p) => p.timeMs < draft.timeMs).length + 1

  async function post() {
    if (!draft) return
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
  }

  return (
    <main className="feed">
      <Tabs />
      <Profile />

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
            <button className="btn primary" onClick={post}>Post to feed</button>
          </>
        )}

        <div className="row">
          <a className="btn" href="/">Go again</a>
          {videoUrl && <a className="btn" href={videoUrl} download="shotgun.webm">Download</a>}
        </div>
      </section>
    </main>
  )
}
