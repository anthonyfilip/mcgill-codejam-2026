import { useEffect, useMemo, useState } from 'react'
import { Avatar } from './Avatar'
import { getProfile, setProfile } from './me'
import { isUsernameTaken, saveProfile, USERNAME_RE } from './store'

const PHOTO_SIZE = 256 // px, square

// Center-crop and shrink a photo to a small square JPEG before uploading.
async function shrinkPhoto(file: File): Promise<Blob> {
  const img = new Image()
  img.src = URL.createObjectURL(file)
  await img.decode()
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PHOTO_SIZE
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
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
export function ProfileForm({ nameTaken = false }: { nameTaken?: boolean }) {
  const current = getProfile()
  const [username, setUsername] = useState(nameTaken ? '' : (current?.username ?? ''))
  const [photo, setPhoto] = useState<Blob | null>(null)
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
      isUsernameTaken(username, current?.id).then(setTaken).catch(() => setTaken(null))
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
    if (problem || !USERNAME_RE.test(username)) return
    setSaving(true)
    setError('')
    try {
      const saved = await saveProfile(
        current ? { ...current, username } : { id: crypto.randomUUID(), secret: crypto.randomUUID(), username, avatarUrl: null },
        photo,
      )
      setProfile(saved)
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

  return (
    <>
        <h2>{current ? 'Edit profile' : 'Make your profile'}</h2>
        {nameTaken && <p className="hint bad">Someone else took “{current?.username}”. Pick a new name.</p>}

        <label className="photo-pick">
          <Avatar name={username || '?'} url={photoUrl} big />
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
            spellCheck={false}
            placeholder="e.g. lana_99"
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase())
              setTaken(null)
            }}
          />
        </label>
        <div className={bad && username ? 'hint bad' : taken === false && !unchanged ? 'hint good' : 'hint'}>{hint}</div>

        {error && <p className="error">{error}</p>}

        <button
          className="btn primary"
          onClick={save}
          disabled={saving || bad || !username || (unchanged && !photo)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
    </>
  )
}

// Pop-up in the middle of the screen for when you must act before using the site:
// first visit (no profile yet) or your name was taken. It can't be closed.
export function ProfileModal({ nameTaken = false }: { nameTaken?: boolean }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <ProfileForm nameTaken={nameTaken} />
      </div>
    </div>
  )
}
