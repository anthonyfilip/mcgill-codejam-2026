import { useEffect, useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { getProfile, setProfile } from './me'
import { FACULTIES } from './posts'
import { isShared, isUsernameTaken, login, MIN_PASSWORD, saveProfile, setPassword, USERNAME_RE } from './store'
import { TermsLink } from './Terms'

const PHOTO_SIZE = 256 // px, square

// Center-crop and shrink a photo to a small square JPEG before uploading.
async function shrinkPhoto(file: File): Promise<Blob> {
  const img = new Image()
  img.src = URL.createObjectURL(file)
  await img.decode()
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PHOTO_SIZE
  canvas
    .getContext('2d')!
    .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo"))), 'image/jpeg', 0.85),
  )
}

function formatProblem(name: string): string | null {
  if (/[^a-z0-9_.]/.test(name)) return 'Only letters, numbers, _ and . (no spaces)'
  if (name.length < 3) return 'At least 3 characters'
  if (name.length > 24) return 'At most 24 characters'
  return null
}

// The name + photo form, used on the profile page and in the must-do pop-up.
// `nameTaken` = your saved name now belongs to someone else, so a new one is needed.
// Log back into an existing profile with its username + password.
function LoginForm({ onBack }: { onBack: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPasswordText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setProfile(await login(username, password))
      location.reload()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <h2>Log in</h2>
      <label className="field">
        Username
        <input
          value={username}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off" data-1p-ignore data-lpignore="true"
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
        />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          value={password}
          autoComplete="off" data-1p-ignore data-lpignore="true"
          onChange={(e) => setPasswordText(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !username || !password}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <button type="button" className="link-btn" onClick={onBack}>
        New here? Make a profile
      </button>
    </form>
  )
}

export function ProfileForm({ nameTaken = false, startLoggingIn = false }: { nameTaken?: boolean; startLoggingIn?: boolean }) {
  const current = getProfile()
  const creating = !current
  const [loggingIn, setLoggingIn] = useState(startLoggingIn)
  const [password, setPasswordText] = useState('')
  const needPassword = creating && isShared // new profiles get a password so they can log back in
  const [username, setUsername] = useState(nameTaken ? '' : (current?.username ?? ''))
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [faculty, setFaculty] = useState(current?.faculty ?? '')
  const [taken, setTaken] = useState<boolean | null>(null) // null = not checked yet
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const problem = formatProblem(username)
  const unchanged = username === current?.username && !nameTaken
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : current?.avatarUrl), [photo, current?.avatarUrl])

  // Check the name against everyone else's, shortly after typing stops.
  useEffect(() => {
    if (problem || unchanged) return
    const t = setTimeout(() => {
      isUsernameTaken(username, current?.id)
        .then(setTaken)
        .catch(() => setTaken(null))
    }, 400)
    return () => clearTimeout(t)
  }, [username, problem, unchanged, current?.id])

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try {
      setPhoto(await shrinkPhoto(file))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function save() {
    if (problem || !USERNAME_RE.test(username) || !faculty) return
    if (needPassword && password.length < MIN_PASSWORD) return
    setSaving(true)
    setError('')
    try {
      const saved = await saveProfile(
        current
          ? { ...current, username, faculty: faculty || null }
          : {
              id: crypto.randomUUID(),
              secret: crypto.randomUUID(),
              username,
              avatarUrl: null,
              faculty: faculty || null,
            },
        photo,
      )
      setProfile(saved)
      if (needPassword) await setPassword(password, saved)
      location.reload() // simplest way to show the new name/photo everywhere
    } catch (e) {
      if ((e as Error).message === 'taken') setTaken(true)
      else setError(`Couldn't save: ${(e as Error).message}`)
      setSaving(false)
    }
  }

  let hint = 'Letters, numbers, _ and . only'
  if (username && problem) hint = problem
  else if (username && !unchanged && taken === true) hint = '✗ Someone already has this name'
  else if (username && !unchanged && taken === false) hint = '✓ Available'
  const bad = !!problem || (!unchanged && taken === true)

  if (loggingIn) return <LoginForm onBack={() => setLoggingIn(false)} />

  return (
    <>
      <h2>{current ? 'Edit profile' : 'Make your profile'}</h2>
      {nameTaken && <p className="hint bad">Someone else took “{current?.username}”. Pick a new name.</p>}

      <label className="photo-pick">
        {/* No photo yet: a plain yellow circle (no letter, no question mark). */}
        {photoUrl ? <Avatar name={username} url={photoUrl} big /> : <span className="avatar big" />}
        <span>{photoUrl ? 'Change photo' : 'Add a photo'}</span>
        <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
      </label>

      <label className="field">
        Username
        <input
          value={username}
          maxLength={24}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
          placeholder="e.g. lana_99"
          onChange={(e) => {
            setUsername(e.target.value.toLowerCase())
            setTaken(null)
          }}
        />
      </label>
      <div className={bad && username ? 'hint bad' : taken === false && !unchanged ? 'hint good' : 'hint'}>{hint}</div>

      <label className="field">
        Faculty
        <select value={faculty} onChange={(e) => setFaculty(e.target.value)}>
          <option value="" disabled>
            Choose your faculty
          </option>
          {FACULTIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>
      {!faculty && <div className="hint">Pick your faculty to save</div>}

      {needPassword && (
        <>
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              autoComplete="off" data-1p-ignore data-lpignore="true"
              onChange={(e) => setPasswordText(e.target.value)}
            />
          </label>
          <div className="hint">At least {MIN_PASSWORD} characters. You'll use it to log back in on another phone.</div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <button
        className="btn primary"
        onClick={save}
        disabled={
          saving ||
          bad ||
          !username ||
          !faculty ||
          (needPassword && password.length < MIN_PASSWORD) ||
          (unchanged && !photo && faculty === (current?.faculty ?? ''))
        }
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {creating && isShared && (
        <button type="button" className="link-btn" onClick={() => setLoggingIn(true)}>
          Already have an account? Log in
        </button>
      )}
    </>
  )
}

// First thing a new visitor sees: what the app is for and how to use it, then sign up / log in.
function Welcome({ onPick }: { onPick: (logIn: boolean) => void }) {
  return (
    <>
      <h2>Welcome to getSendy!</h2>
      <p className="welcome-intro">
        Your phone times your shotgun automatically: the camera and mic catch the crack and the finish. Post
        your run with its replay to the feed and climb the leaderboard.
      </p>
      <ol className="welcome-steps">
        <li>Stand the phone ~2 m away with your head, shoulders and arms in frame.</li>
        <li>
          Tap <b>GET SENDY!</b>, crack the can at your mouth and drink. The clock starts at the crack.
        </li>
        <li>
          Done? Lower the can and flash a <b>🤙 shaka</b> (thumb + pinky out) to stop the clock.
        </li>
        <li>Name your run and post it.</li>
      </ol>
      <div className="welcome-actions">
        <button className="btn primary" onClick={() => onPick(false)}>
          Sign up
        </button>
        {isShared && (
          <button className="btn" onClick={() => onPick(true)}>
            Log in
          </button>
        )}
      </div>
      <TermsLink small />
    </>
  )
}

// Pop-up in the middle of the screen for when you must act before using the site:
// first visit (no profile yet: welcome first) or your name was taken. It can't be closed.
export function ProfileModal({ nameTaken = false }: { nameTaken?: boolean }) {
  const [step, setStep] = useState<'welcome' | 'signup' | 'login'>(getProfile() ? 'signup' : 'welcome')
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        {step === 'welcome' ? (
          <Welcome onPick={(logIn) => setStep(logIn ? 'login' : 'signup')} />
        ) : (
          <ProfileForm nameTaken={nameTaken} startLoggingIn={step === 'login'} />
        )}
      </div>
    </div>
  )
}
