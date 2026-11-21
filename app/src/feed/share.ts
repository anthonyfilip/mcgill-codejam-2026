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

// Our start button: renamed, and moved onto the camera view (styled in share.css).
// The "Tap Arm to start" hint goes; the tracker's later status messages still show.
const arm = document.getElementById('arm')
if (arm) {
  arm.textContent = 'GET SENDY!'
  document.getElementById('stage')?.append(arm)
}
const hint = document.getElementById('state')
if (hint?.textContent === 'Tap Arm to start') hint.textContent = ''

window.addEventListener('run:finished', async (e) => {
  const run = (e as CustomEvent<RunFinished>).detail
  const id = crypto.randomUUID()
  await saveDraft({ id, createdAt: Date.now(), ...run })
  location.href = `/results.html?run=${id}`
})
