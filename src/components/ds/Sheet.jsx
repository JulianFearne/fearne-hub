import { useEffect } from 'react'
import IconButton from './IconButton.jsx'

// One component: renders as a bottom sheet on phones, a centred modal
// from 720px. Never fork this into two components (see design brief).
export default function Sheet({ title, onClose, footer, wide, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fh-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`fh-sheet${wide ? ' fh-sheet--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="fh-sheet__grip" />
        <div className="fh-sheet__head">
          <p className="fh-sheet__title">{title}</p>
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>
        <div className="fh-sheet__body">{children}</div>
        {footer && <div className="fh-sheet__foot">{footer}</div>}
      </div>
    </div>
  )
}
