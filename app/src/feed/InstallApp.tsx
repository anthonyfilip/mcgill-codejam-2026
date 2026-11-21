import { useEffect, useState } from 'react'
import { canPromptInstall, isInstalled, isIOS, isIOSSafari, onInstallChange, promptInstall } from './install'
import { Popup } from './Popup'

// The iPhone Share icon (square with an arrow up) and "Add to Home Screen" icon, as drawn in Safari.
const ShareGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
)
const AddGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)

// Small "getSendy! the app" button, top-left of the profile → installs on Android, explains the
// steps on iPhone. Hidden once you're using the installed app.
export function InstallApp() {
  const [, rerender] = useState(0)
  const [help, setHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), [])

  if (isInstalled()) return null

  async function add() {
    if (canPromptInstall()) await promptInstall()
    else setHelp(true)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(location.origin)
    setCopied(true)
  }

  return (
    <>
      <button className="install-pill" onClick={add} title="Add getSendy! to your home screen">
        <img src="/icon-192.png" alt="" />
        getSendy! the app
      </button>

      {help && (
        <Popup title="Add to Home Screen" onClose={() => setHelp(false)}>
          {isIOS && !isIOSSafari ? (
            <div className="install-steps">
              <p>
                On iPhone, only <b>Safari</b> can add apps to your home screen.
              </p>
              <ol>
                <li>Copy the link below.</li>
                <li>
                  Open <b>Safari</b> and paste it in the address bar.
                </li>
                <li>
                  Come back to your Profile and tap <b>Add to Home Screen</b> again.
                </li>
              </ol>
              <button className="btn primary" onClick={copyLink}>
                {copied ? 'Copied ✓' : 'Copy link'}
              </button>
            </div>
          ) : isIOS ? (
            <ol className="install-steps">
              <li>
                Tap the <b>Share</b> button{' '}
                <span className="glyph">
                  <ShareGlyph />
                </span>{' '}
                in Safari's bottom bar (tap the bottom of the screen if you can't see it).
              </li>
              <li>
                Scroll down and tap <b>Add to Home Screen</b>{' '}
                <span className="glyph">
                  <AddGlyph />
                </span>
                .
              </li>
              <li>
                Tap <b>Add</b> (top right). getSendy! is now on your home screen.
              </li>
            </ol>
          ) : (
            <ol className="install-steps">
              <li>
                Open the browser menu (<b>⋮</b> top right in Chrome).
              </li>
              <li>
                Tap <b>Install app</b> or <b>Add to Home screen</b>.
              </li>
              <li>
                Tap <b>Install</b>. getSendy! is now on your home screen.
              </li>
            </ol>
          )}
        </Popup>
      )}
    </>
  )
}
