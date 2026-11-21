// Feed add-on for the tracker page. Builds its own UI so the tracker's files stay
// untouched: sends new visitors to the feed, adds the tabs, moves/renames the Arm button,
// adds "upload a video", and when a run finishes saves it as a draft and opens the results
// page. Hook-up: docs/feed-integration.md.
import './share.css'
import { saveDraft } from './store'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

// Entering the site (typed address, bookmark, shared link) opens the feed first. Coming from
// one of our own pages, e.g. the Record Chug tab or "Go again", stays here.
if (!document.referrer.startsWith(location.origin)) location.replace('/feed.html')

const tabs = document.createElement('nav')
tabs.className = 'tabs'
tabs.innerHTML =
  '<a href="/feed.html">Feed</a><a href="/" class="active">Record Chug</a><a href="/leaderboard.html">Leaderboard</a><a href="/profile.html">Profile</a>'
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

async function openResults(run: RunFinished) {
  const id = crypto.randomUUID()
  await saveDraft({ id, createdAt: Date.now(), ...run })
  location.href = `/results.html?run=${id}`
}

window.addEventListener('run:finished', (e) => openResults((e as CustomEvent<RunFinished>).detail))

// "Upload a video of your chug", under the signal lights: timed with the tracker's rules.
const upload = document.createElement('section')
upload.id = 'upload-chug'
upload.innerHTML = `
  <label class="upload-btn">Upload a video of your chug<input type="file" accept="video/*" hidden></label>
  <video playsinline muted hidden></video>
  <p class="upload-status" hidden></p>`
document.getElementById('signals')?.after(upload)

const fileInput = upload.querySelector('input')!
const preview = upload.querySelector('video')!
const status = upload.querySelector('p')!
const setStatus = (text: string) => {
  status.hidden = false
  status.textContent = text
}

fileInput.onchange = async () => {
  const file = fileInput.files?.[0]
  fileInput.value = '' // so picking the same file again still triggers
  if (!file) return
  upload.classList.add('busy')
  preview.hidden = false
  try {
    // Loaded only when needed: the analysis pulls in the lab's body tracker.
    const { analyseUpload } = await import('./upload')
    const result = await analyseUpload(file, preview, setStatus)
    setStatus(`Got it: ${(result.timeMs / 1000).toFixed(2)} s. Opening your results…`)
    await openResults({ ...result, clip: file })
  } catch (e) {
    setStatus(`Couldn't time that video: ${(e as Error).message}. Try another clip.`)
    preview.hidden = true
    upload.classList.remove('busy')
  }
}
