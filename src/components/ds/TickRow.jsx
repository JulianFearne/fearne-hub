export default function TickRow({ checked, onToggle, qty, trail, className = '', children }) {
  return (
    <div className={`fh-tick-row${trail ? ' fh-tick-row--trail' : ''} ${className}`.trim()}>
      <button type="button" className="fh-tick" role="checkbox" aria-checked={checked} onClick={onToggle}>
        <span className="fh-tick__box">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="fh-tick__label">{children}</span>
        {qty && <span className="fh-tick__qty">{qty}</span>}
      </button>
      {trail && <span className="fh-tick__trail">{trail}</span>}
    </div>
  )
}
