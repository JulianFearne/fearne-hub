import Icon from './Icon.jsx'

// One `primary` per view. `size="thumb"` is the one screen-level action —
// keep it in the lower half of the screen, sticky above the tab bar.
export default function Button({
  variant = 'primary',
  size,
  icon,
  block,
  loading,
  disabled,
  as: As = 'button',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'fh-btn',
    `fh-btn--${variant}`,
    size ? `fh-btn--${size}` : '',
    block ? 'fh-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <As className={classes} disabled={As === 'button' ? disabled || loading : undefined} {...rest}>
      {loading ? <span className="fh-btn__spin" aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </As>
  )
}
