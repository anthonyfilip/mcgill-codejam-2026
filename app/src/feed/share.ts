// Loaded on the tracker page. When a run finishes, shows "Post to feed" on the results.
import { savePost } from './store'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

const button = document.getElementById('post-feed') as HTMLButtonElement
let run: RunFinished | null = null

window.addEventListener('run:finished', (e) => {
  run = (e as CustomEvent<RunFinished>).detail
  button.hidden = false
  button.disabled = false
  button.textContent = 'Post to feed'
})

button.onclick = async () => {
  // After posting, the same button links to the feed.
  if (!run) return void (location.href = '/feed.html')
  button.disabled = true
  await savePost({
    id: crypto.randomUUID(),
    user: 'you',
    postedAt: Date.now(),
    timeMs: run.timeMs,
    maxAngle: run.maxAngle,
    startedBy: run.startedBy,
    clip: run.clip,
    cheers: 0,
  })
  run = null
  button.textContent = 'Posted ✔ View feed'
  button.disabled = false
}
