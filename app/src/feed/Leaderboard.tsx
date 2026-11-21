import { useEffect, useState } from 'react'
import { FACULTIES, type Post, type PostRating } from './posts'
import { Avatar } from './Avatar'
import { getName } from './me'
import { Profile } from './Profile'
import { isMine, loadPosts, loadRatings, samplePosts } from './store'
import { Tabs } from './Tabs'

// Runs averaging at least this many stars rank above every run that doesn't.
const MIN_RATING = 3.5

type Run = { timeMs: number; avg: number | null; title: string; postedAt: number }
type Row = { user: string; avatarUrl?: string | null; faculty?: string | null; best: Run; runs: number }

const qualifies = (r: Run) => r.avg !== null && r.avg >= MIN_RATING

// Rated 3.5+ beats below 3.5 (or unrated); within each group the faster time wins.
const better = (a: Run, b: Run) => Number(qualifies(b)) - Number(qualifies(a)) || a.timeMs - b.timeMs

// Each person's best run by that rule, best first.
function rank(posts: Post[], ratings: PostRating[]): Row[] {
  const byUser = new Map<string, Row>()
  for (const p of posts) {
    const stars = ratings.filter((r) => r.postId === p.id).map((r) => r.stars)
    const run: Run = {
      timeMs: p.timeMs,
      avg: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null,
      title: p.title ?? '',
      postedAt: p.postedAt,
    }
    const row = byUser.get(p.user)
    if (!row) byUser.set(p.user, { user: p.user, avatarUrl: p.avatarUrl, faculty: p.faculty, best: run, runs: 1 })
    else {
      row.runs++
      if (better(run, row.best) < 0) row.best = run
    }
  }
  return [...byUser.values()].sort((a, b) => better(a.best, b.best))
}

const MEDALS = ['🥇', '🥈', '🥉']

type FacultyRow = { faculty: string; avgMs: number | null; avgStars: number | null; runs: number; people: number }

// Every faculty's runs averaged: mean time over all its members' runs, mean stars over the
// ratings those runs got. Same rule as people: ★ 3.5+ first, then the faster average time.
// Faculties with no runs yet go last.
function rankFaculties(posts: Post[], ratings: PostRating[]): FacultyRow[] {
  return FACULTIES.map((faculty) => {
    const runs = posts.filter((p) => p.faculty === faculty)
    const ids = new Set(runs.map((p) => p.id))
    const stars = ratings.filter((r) => ids.has(r.postId)).map((r) => r.stars)
    return {
      faculty,
      avgMs: runs.length ? runs.reduce((a, p) => a + p.timeMs, 0) / runs.length : null,
      avgStars: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null,
      runs: runs.length,
      people: new Set(runs.map((p) => p.user)).size,
    }
  }).sort((a, b) => {
    if (a.avgMs === null || b.avgMs === null) return Number(a.avgMs === null) - Number(b.avgMs === null)
    const qa = a.avgStars !== null && a.avgStars >= MIN_RATING
    const qb = b.avgStars !== null && b.avgStars >= MIN_RATING
    return Number(qb) - Number(qa) || a.avgMs - b.avgMs
  })
}

function FacultyBoard({ posts, ratings }: { posts: Post[]; ratings: PostRating[] }) {
  const rows = rankFaculties(posts, ratings)
  const ranked = rows.filter((r) => r.avgMs !== null)
  return (
    <>
      <p className="board-rule">
        Each faculty's runs averaged. <b>★ {MIN_RATING}+</b> on average ranks first, then the fastest average time.
      </p>
      <ol className="board">
        {rows.map((r, i) => (
          <li key={r.faculty} className={r.avgMs === null ? 'empty-row' : undefined}>
            <span className="place">{r.avgMs === null ? '–' : (MEDALS[i] ?? i + 1)}</span>
            <span className="who">
              <span>{r.faculty}</span>
              <small>
                {r.avgMs === null
                  ? 'No runs yet'
                  : `${r.avgStars !== null ? `★ ${r.avgStars.toFixed(1)}` : '★ –'} · ${r.people} ${r.people === 1 ? 'person' : 'people'} · ${r.runs} ${r.runs === 1 ? 'run' : 'runs'}`}
              </small>
            </span>
            <span className="score">
              <b className="best">{r.avgMs !== null ? `${(r.avgMs / 1000).toFixed(2)} s` : ''}</b>
              {r.avgMs !== null && <span className="run-title">average</span>}
            </span>
          </li>
        ))}
      </ol>
      {!ranked.length && <p className="empty">No faculty has a run yet. Pick yours on your Profile and post one!</p>}
    </>
  )
}

// "Today", "Yesterday", or e.g. "Nov 19".
function day(ms: number) {
  const d = new Date(ms)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function Leaderboard() {
  const facultyView = new URLSearchParams(location.search).get('view') === 'faculty'
  const [posts, setPosts] = useState<Post[]>([])
  const [ratings, setRatings] = useState<PostRating[]>([])
  const rows = rank([...posts, ...samplePosts], ratings)
  const me = getName()
  // Where the 3.5+ group ends, to draw a divider.
  const firstBelow = rows.findIndex((r) => !qualifies(r.best))

  useEffect(() => {
    loadPosts().then(setPosts).catch(console.error)
    loadRatings().then(setRatings).catch(console.error)
  }, [])

  return (
    <main className="feed">
      <Tabs active="/leaderboard.html" />
      <Profile mine={posts.filter(isMine)} />

      <a className="btn board-switch" href={facultyView ? '/leaderboard.html' : '/leaderboard.html?view=faculty'}>
        {facultyView ? '← People leaderboard' : 'Faculty leaderboard →'}
      </a>

      {facultyView ? (
        <FacultyBoard posts={[...posts, ...samplePosts]} ratings={ratings} />
      ) : (
        <>
          <p className="board-rule">
            Runs rated <b>★ {MIN_RATING}+</b> rank first, then the fastest time wins.
          </p>

          <ol className="board">
            {rows.map((r, i) => (
              <li
                key={r.user}
                className={
                  [r.user === me && 'me', i === firstBelow && i > 0 && 'below'].filter(Boolean).join(' ') || undefined
                }
              >
                {i === firstBelow && <span className="divider">Below ★ {MIN_RATING} or not rated yet</span>}
                <span className="place">{MEDALS[i] ?? i + 1}</span>
                <a className="board-user" href={`/profile.html?user=${encodeURIComponent(r.user)}`}>
                  <Avatar name={r.user} url={r.avatarUrl} />
                </a>
                <a className="who" href={`/profile.html?user=${encodeURIComponent(r.user)}`}>
                  <span>
                    {r.user} {r.faculty && <span className="faculty-tag">{r.faculty}</span>}
                  </span>
                  <small>
                    {r.best.avg !== null ? `★ ${r.best.avg.toFixed(1)}` : '★ –'} · {day(r.best.postedAt)} · {r.runs}{' '}
                    {r.runs === 1 ? 'run' : 'runs'}
                  </small>
                </a>
                <span className="score">
                  <b className="best">{(r.best.timeMs / 1000).toFixed(2)} s</b>
                  {r.best.title && <span className="run-title">{r.best.title}</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}
