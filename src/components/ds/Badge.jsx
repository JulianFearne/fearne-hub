export default function Badge({ tone, className = '', children, ...rest }) {
  const classes = ['fh-badge', tone ? `fh-badge--${tone}` : '', className].filter(Boolean).join(' ')
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  )
}

const ROLE_LABEL = { admin: 'Admin', adult: 'Adult', kid: 'Kid' }

export function RoleBadge({ role, className, ...rest }) {
  return (
    <Badge tone={role} className={className} {...rest}>
      {ROLE_LABEL[role] ?? role}
    </Badge>
  )
}
