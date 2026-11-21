// Feed add-on for the tracker page. Builds its own UI so the tracker's files stay
// untouched: adds the tabs, renames the Arm button, and when a run finishes, saves it as a draft and opens the
// results page. Hook-up: docs/feed-integration.md.
import './share.css'
import { saveDraft } from './store'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

const tabs = document.createElement('nav')
tabs.className = 'tabs'
tabs.innerHTML =
  '<a href="/" class="active">Record Chug</a><a href="/feed.html">Feed</a><a href="/leaderboard.html">Leaderboard</a>'
document.querySelector('main')?.prepend(tabs)

// Our wording for the tracker's start button and its hint.
const arm = document.getElementById('arm')
if (arm) arm.textContent = 'GET SENDY!'
const hint = document.getElementById('state')
if (hint?.textContent === 'Tap Arm to start') hint.textContent = 'Tap GET SENDY! to start'

window.addEventListener('run:finished', async (e) => {
  const run = (e as CustomEvent<RunFinished>).detail
  const id = crypto.randomUUID()
  await saveDraft({ id, createdAt: Date.now(), ...run })
  location.href = `/results.html?run=${id}`
})
