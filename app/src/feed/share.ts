// Feed add-on for the tracker page. Builds its own UI so the tracker's files stay
// untouched: sends new visitors to the feed, adds the tabs, moves/renames the Arm button,
// adds "upload a video", and when a run finishes saves it as a draft and opens the results
// page. Hook-up: docs/feed-integration.md.
import './share.css'
import { saveDraft } from './store'
import { installSwipeNav } from './swipeNav'

type RunFinished = { timeMs: number; maxAngle: number | null; startedBy: string[]; clip: Blob }

// Entering the site (typed address, bookmark, shared link) opens the feed first. Coming from
// one of our own pages, e.g. the Record Chug tab or "Go again", stays here.
if (!document.referrer.startsWith(location.origin)) location.replace('/feed.html')

// Same bottom tab bar as our React pages (src/feed/Tabs.tsx), styled in share.css.
const tabs = document.createElement('nav')
tabs.className = 'tabbar'
tabs.innerHTML = [
  ['/feed.html', 'Chugs'],
  ['/leaderboard.html', 'Leaderboard'],
  ['/profile.html', 'Profile'],
]
  .map(([href, label]) => `<a href="${href}">${label}</a>`)
  .join('')
document.body.append(tabs)

// Swipe back to the feed (finger moving left), but never once GET SENDY! has been tapped
// (it stays disabled while armed and during the run), so a run can't be left by accident.
installSwipeNav('/', () => !(document.getElementById('arm') as HTMLButtonElement | null)?.disabled)

// Our start button: renamed, and moved onto the camera view (styled in share.css).
// The "Tap Arm to start" hint goes; the tracker's later status messages still show.
const arm = document.getElementById('arm')
if (arm) {
  arm.textContent = 'GET SENDY!'
  document.getElementById('stage')?.append(arm)
}
// Plain white icons instead of the 🔄 / 🔦 emojis on the tracker's camera buttons.
// (app.js only toggles these buttons' disabled/"on" state, never their contents.)
const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const flip = document.getElementById('flip')
if (flip) flip.innerHTML = icon('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/>')
const light = document.getElementById('light')
// The line through the bolt means "flash off"; it disappears when the light is on (share.css).
if (light) light.innerHTML = icon('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor"/><g class="slash"><path d="M3 3l18 18" stroke="#000" stroke-width="5"/><path d="M3 3l18 18" stroke-width="2"/></g>')

const hint = document.getElementById('state')
if (hint?.textContent === 'Tap Arm to start') hint.textContent = ''

async function openResults(run: RunFinished) {
  const id = crypto.randomUUID()
  await saveDraft({ id, createdAt: Date.now(), ...run })
  location.href = `/results.html?run=${id}`
}

window.addEventListener('run:finished', (e) => {
  // If the hand-off fails (e.g. storage blocked in a private tab), say so instead of
  // leaving the person on the tracker's own results with only "Download".
  openResults((e as CustomEvent<RunFinished>).detail).catch((err) => {
    alert(`Couldn't open your results to post: ${(err as Error).message}. You can still download the clip below.`)
  })
})

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
