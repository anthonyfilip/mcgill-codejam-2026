import { useEffect, useState } from 'react'
import { forgetMe } from './me'
import { DeletePopup } from './Popup'
import { hasPassword, isShared, MIN_PASSWORD, setPassword } from './store'

// Profile: set/change your password (to log back in on another phone) and log out.
export function AccountSection() {
  const [has, setHas] = useState<boolean | null>(null) // null = checking
  const [changing, setChanging] = useState(false)
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    hasPassword()
      .then(setHas)
      .catch(() => setHas(false))
  }, [])

  if (!isShared) return null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await setPassword(pw)
      setHas(true)
      setChanging(false)
      setPw('')
      setMessage('Password saved ✓')
    } catch (err) {
      setMessage(`Couldn't save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="account">
      {has === false && (
        <p className="account-warn">
          Set a password so you can log back in on another phone or after deleting the app.
        </p>
      )}
      {has && !changing && (
        <button className="account-change" onClick={() => setChanging(true)}>
          Change password
        </button>
      )}
      {(has === false || changing) && (
        <form className="account-form" onSubmit={save}>
          <input
            type="password"
            value={pw}
            autoComplete="off" data-1p-ignore data-lpignore="true"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            onChange={(e) => setPw(e.target.value)}
          />
          <button className="btn primary" disabled={saving || pw.length < MIN_PASSWORD}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}
      {message && <p className="account-msg">{message}</p>}

      <button className="link-btn account-logout" onClick={() => setLoggingOut(true)}>
        Log out
      </button>
      {loggingOut && (
        <DeletePopup
          title="Log out?"
          confirmLabel="Log out"
          message={
            has
              ? 'Log back in any time with your username and password.'
              : "You haven't set a password, so you won't be able to get this profile back. Set one first!"
          }
          onConfirm={() => {
            forgetMe()
            location.replace('/feed.html')
          }}
          onClose={() => setLoggingOut(false)}
        />
      )}
    </section>
  )
}
