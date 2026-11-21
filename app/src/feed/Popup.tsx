import { createPortal } from 'react-dom'

// Pop-up in the middle of the screen with a title bar and a close button.
// Used for rating a post and for playing a video from someone's page.
// Drawn straight into <body> so nothing on the page (like the tab bar) can sit on top of it.
export function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="popup-head">
          <b>{title}</b>
          <button className="popup-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="popup-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// "Delete this …?" in the same pop-up: ✕ cancels, the small Delete button confirms.
export function DeletePopup({
  title,
  message,
  onConfirm,
  onClose,
}: {
  title: string
  message?: string // optional extra warning under the question
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Popup title={title} onClose={onClose}>
      {message && <p className="popup-meta">{message}</p>}
      <button className="popup-delete" onClick={onConfirm}>
        Delete
      </button>
    </Popup>
  )
}

