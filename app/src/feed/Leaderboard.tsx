import { useEffect, useState } from 'react'
import { SAMPLE_POSTS, type Post } from './posts'
import { getName } from './name'
import { Profile } from './Profile'
import { loadPosts } from './store'
import { Tabs } from './Tabs'

type Row = { user: string; best: number; runs: number }

// Each person's fastest run, fastest first.
function rank(posts: Post[]): Row[] {
  const byUser = new Map<string, Row>()
  for (const p of posts) {
    const row = byUser.get(p.user) ?? { user: p.user, best: Infinity, runs: 0 }
    row.best = Math.min(row.best, p.timeMs)
    row.runs++
    byUser.set(p.user, row)
  }
  return [...byUser.values()].sort((a, b) => a.best - b.best)
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const [mine, setMine] = useState<Post[]>([])
  const rows = rank([...mine, ...SAMPLE_POSTS])
  const me = getName()

  useEffect(() => {
    loadPosts().then(setMine)
  }, [])

  return (
    <main className="feed">
      <Tabs active="/leaderboard.html" />
      <Profile mine={mine} />

      <ol className="board">
        {rows.map((r, i) => (
          <li key={r.user} className={r.user === me ? 'me' : undefined}>
            <span className="place">{MEDALS[i] ?? i + 1}</span>
            <span className="avatar">{r.user[0].toUpperCase()}</span>
            <span className="who">{r.user}</span>
            <span className="runs">{r.runs} {r.runs === 1 ? 'run' : 'runs'}</span>
            <b className="best">{(r.best / 1000).toFixed(2)} s</b>
          </li>
        ))}
      </ol>
    </main>
  )
}
