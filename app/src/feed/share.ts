// Feed add-on for the tracker page. Builds its own UI so the tracker's files stay
// untouched: adds the tabs, and when a run finishes, saves it as a draft and opens the
// results page. Hook-up: docs/feed-integration.md.
import './share.css'
import { saveDraft } from './store'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

const tabs = document.createElement('nav')
tabs.className = 'tabs'
tabs.innerHTML =
  '<a href="/" class="active">Tracker</a><a href="/feed.html">Feed</a><a href="/leaderboard.html">Leaderboard</a>'
document.querySelector('main')?.prepend(tabs)

window.addEventListener('run:finished', async (e) => {
  const run = (e as CustomEvent<RunFinished>).detail
  const id = crypto.randomUUID()
  await saveDraft({ id, createdAt: Date.now(), ...run })
  location.href = `/results.html?run=${id}`
})
