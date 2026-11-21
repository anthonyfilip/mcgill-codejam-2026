// Loaded on the tracker page. When a run finishes, shows a description box and
// "Post to feed" on the results.
import { savePost } from './store'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

const area = document.getElementById('post-area') as HTMLDivElement
const desc = document.getElementById('post-desc') as HTMLTextAreaElement
const count = document.getElementById('post-count') as HTMLDivElement
const button = document.getElementById('post-feed') as HTMLButtonElement
let run: RunFinished | null = null

const updateCount = () => (count.textContent = `${desc.value.length} / ${desc.maxLength}`)
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
    description: desc.value.trim().slice(0, 300),
    clip: run.clip,
    cheers: 0,
  })
  run = null
  button.textContent = 'Posted ✔ View feed'
  button.disabled = false
}
