import Icon from './Icon.jsx'

export default function IconButton({
  icon,
  label,
  variant,
  size,
  as: As = 'button',
  className = '',
  ...rest
}) {
  const classes = [
    'fh-iconbtn',
    variant ? `fh-iconbtn--${variant}` : '',
    size ? `fh-iconbtn--${size}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <As className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={20} />
    </As>
  )
}
