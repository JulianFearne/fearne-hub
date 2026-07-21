import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Nav() {
  const { session, isApproved, isAdmin, signOut } = useAuth()

  return (
    <nav className="nav">
      <div className="nav-inner">
        <NavLink to="/" className="nav-brand">
          Fearne Hub
        </NavLink>
        {session && isApproved && (
          <ul className="nav-links">
            <li>
              <NavLink to="/" end>
                Home
              </NavLink>
            </li>
            <li>
              <NavLink to="/workouts">Workouts</NavLink>
            </li>
            <li>
              <NavLink to="/recipes">Recipes</NavLink>
            </li>
            <li>
              <NavLink to="/planner">Planner</NavLink>
            </li>
            <li>
              <NavLink to="/shopping">Shopping</NavLink>
            </li>
            <li>
              <NavLink to="/games">Games</NavLink>
            </li>
            {isAdmin && (
              <li>
                <NavLink to="/admin">Admin</NavLink>
              </li>
            )}
            <li>
              <button className="nav-signout" onClick={() => signOut()}>
                Sign out
              </button>
            </li>
          </ul>
        )}
        {session && !isApproved && (
          <button className="nav-signout" onClick={() => signOut()}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  )
}
