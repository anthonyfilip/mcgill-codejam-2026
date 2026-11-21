// Pop-up in the middle of the screen with a title bar and a close button.
// Used for a post's rating + comments and for playing a video from someone's page.
export function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className="popup" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="popup-head">
          <b>{title}</b>
          <button className="popup-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="popup-body">{children}</div>
      </div>
    </div>
  )
}
