// Six member colours, cycled by a stable hash of the name so the same
// person keeps the same colour everywhere without needing a lookup table.
function memberColorIndex(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return (hash % 6) + 1
}

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function Avatar({ name, size = 'md', here, className = '', style, ...rest }) {
  const colorIndex = memberColorIndex(name)
  const classes = ['fh-avatar', `fh-avatar--${size}`, className].filter(Boolean).join(' ')
  return (
    <span
      className={classes}
      style={{ background: `var(--member-${colorIndex})`, ...style }}
      {...rest}
    >
      {initials(name)}
      {here && <span className="fh-avatar__here" aria-label="online" />}
    </span>
  )
}

export function MemberStack({ members = [], max = 4 }) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <span className="fh-stack">
      {shown.map((m) => (
        <Avatar key={m.name} name={m.name} size="sm" here={m.here} />
      ))}
      {extra > 0 && <span className="fh-stack__more">+{extra}</span>}
    </span>
  )
}
