export function Chip({ active, count, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`fh-chip ${className}`.trim()}
      aria-pressed={active ? 'true' : 'false'}
      {...rest}
    >
      {children}
      {typeof count === 'number' && <span className="fh-chip__count">{count}</span>}
    </button>
  )
}

export function ChipRow({ children }) {
  return <div className="fh-chiprow">{children}</div>
}
