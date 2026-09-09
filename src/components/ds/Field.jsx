import Icon from './Icon.jsx'

export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="fh-field">
      {label && (
        <label className="fh-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span className="fh-field__error">
          <Icon name="alert-circle" size={14} />
          {error}
        </span>
      ) : hint ? (
        <span className="fh-field__hint">{hint}</span>
      ) : null}
    </div>
  )
}

export function Input({ error, className = '', as: As = 'input', ...rest }) {
  return <As className={`fh-input ${className}`.trim()} aria-invalid={error ? 'true' : undefined} {...rest} />
}

export function Select({ className = '', children, ...rest }) {
  return (
    <span className={`fh-select ${className}`.trim()}>
      <select {...rest}>{children}</select>
      <Icon name="chevron-down" size={16} className="fh-select__caret" />
    </span>
  )
}
