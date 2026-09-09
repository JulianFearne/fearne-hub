import IconButton from './IconButton.jsx'
import Wordmark from './Wordmark.jsx'

export default function HubHeader({ wordmark, title, onBack, backLabel = 'Back', actions }) {
  return (
    <header className="fh-header">
      {onBack && (
        <IconButton
          icon="chevron-left"
          label={backLabel}
          onClick={onBack}
          className="fh-header__back"
        />
      )}
      {wordmark ? <Wordmark /> : <h1 className="fh-header__title">{title}</h1>}
      {actions && <div className="fh-header__actions">{actions}</div>}
    </header>
  )
}
