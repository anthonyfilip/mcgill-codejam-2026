// Feed add-on for the tracker page. Builds all of its own UI so the tracker's files stay
// untouched: the Tracker | Feed tabs, hides the stats we don't show, and adds a
// description box + "Post to feed" to the results. Hook-up: docs/feed-integration.md.
import './share.css'
import { savePost } from './store'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

const MAX_DESC = 300

// Tracker | Feed tabs at the top of the page.
const tabs = document.createElement('nav')
tabs.className = 'tabs'
tabs.innerHTML = '<a href="/" class="active">Tracker</a><a href="/feed.html">Feed</a>'
document.querySelector('main')?.prepend(tabs)

// Results: keep the time and the video, hide angle and started-by.
for (const id of ['r-max', 'r-by']) {
  const line = document.getElementById(id)?.closest('p')
  if (line) line.hidden = true
}

// Description box + post button, shown once a run finishes.
const area = document.createElement('div')
area.id = 'post-area'
area.hidden = true
area.innerHTML = `
  <textarea id="post-desc" maxlength="${MAX_DESC}" rows="3" placeholder="Say something about this one…"></textarea>
  <div id="post-count">0 / ${MAX_DESC}</div>
  <button id="post-feed">Post to feed</button>`
document.getElementById('results')?.append(area)

const desc = area.querySelector('textarea')!
const count = area.querySelector<HTMLDivElement>('#post-count')!
const button = area.querySelector('button')!
let run: RunFinished | null = null

const updateCount = () => (count.textContent = `${desc.value.length} / ${MAX_DESC}`)
desc.oninput = updateCount

window.addEventListener('run:finished', (e) => {
  run = (e as CustomEvent<RunFinished>).detail
  area.hidden = false
  desc.disabled = false
  desc.value = ''
  updateCount()
  button.disabled = false
  button.textContent = 'Post to feed'
})

button.onclick = async () => {
  // After posting, the same button links to the feed.
  if (!run) return void (location.href = '/feed.html')
  button.disabled = true
  desc.disabled = true
  await savePost({
    id: crypto.randomUUID(),
    user: 'you',
    postedAt: Date.now(),
    timeMs: run.timeMs,
    maxAngle: run.maxAngle,
    startedBy: run.startedBy,
    description: desc.value.trim().slice(0, MAX_DESC),
    clip: run.clip,
    cheers: 0,
  })
  run = null
  button.textContent = 'Posted ✔ View feed'
  button.disabled = false
}
