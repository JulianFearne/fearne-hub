import { NavLink } from 'react-router-dom'
import Icon from './Icon.jsx'

// Sticky bottom bar. NavLink sets aria-current="page" on the active item,
// which .fh-tabbar__item[aria-current="page"] picks up for the plum tint.
export default function TabBar({ items }) {
  return (
    <nav className="fh-tabbar" aria-label="Main">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="fh-tabbar__item">
          <Icon name={item.icon} size={22} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
