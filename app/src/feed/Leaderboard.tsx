import { useEffect, useState } from 'react'
import type { Post } from './posts'
import { Avatar } from './Avatar'
import { getName } from './me'
import { Profile } from './Profile'
import { isMine, loadPosts, samplePosts } from './store'
import { Tabs } from './Tabs'

type Row = { user: string; avatarUrl?: string | null; best: number; runs: number }

// Each person's fastest run, fastest first.
function rank(posts: Post[]): Row[] {
  const byUser = new Map<string, Row>()
  for (const p of posts) {
    const row = byUser.get(p.user) ?? { user: p.user, avatarUrl: p.avatarUrl, best: Infinity, runs: 0 }
    row.best = Math.min(row.best, p.timeMs)
    row.runs++
    byUser.set(p.user, row)
  }
  return [...byUser.values()].sort((a, b) => a.best - b.best)
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const [posts, setPosts] = useState<Post[]>([])
  const rows = rank([...posts, ...samplePosts])
  const me = getName()

  useEffect(() => {
    loadPosts().then(setPosts).catch(console.error)
  }, [])

  return (
    <main className="feed">
      <Tabs active="/leaderboard.html" />
      <Profile mine={posts.filter(isMine)} />

      <ol className="board">
        {rows.map((r, i) => (
          <li key={r.user} className={r.user === me ? 'me' : undefined}>
            <span className="place">{MEDALS[i] ?? i + 1}</span>
            <Avatar name={r.user} url={r.avatarUrl} />
            <span className="who">{r.user}</span>
            <span className="runs">{r.runs} {r.runs === 1 ? 'run' : 'runs'}</span>
            <b className="best">{(r.best / 1000).toFixed(2)} s</b>
          </li>
        ))}
      </ol>
    </main>
  )
}
