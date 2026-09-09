export default function Card({
  variant,
  tile,
  interactive,
  as,
  className = '',
  children,
  ...rest
}) {
  const As = as || (rest.href ? 'a' : rest.onClick ? 'button' : 'div')
  const classes = [
    'fh-card',
    variant ? `fh-card--${variant}` : '',
    tile ? 'fh-card--tile' : '',
    interactive || rest.onClick || rest.href || rest.to ? 'fh-card--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <As className={classes} {...rest}>
      {children}
    </As>
  )
}

export function CardTitle({ className = '', children, ...rest }) {
  return (
    <p className={`fh-card__title ${className}`.trim()} {...rest}>
      {children}
    </p>
  )
}

export function CardMeta({ className = '', children, ...rest }) {
  return (
    <p className={`fh-card__meta ${className}`.trim()} {...rest}>
      {children}
    </p>
  )
}
