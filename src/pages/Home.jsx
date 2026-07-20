import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const sections = [
  {
    to: '/workouts',
    title: 'Workouts',
    blurb: 'Log sessions and track progress over time.',
    tag: 'Fitness',
  },
  {
    to: '/recipes',
    title: 'Recipe Book',
    blurb: "The family's shared recipes, all in one place.",
    tag: 'Kitchen',
  },
  {
    to: '/games',
    title: 'Games',
    blurb: 'A little something to play together.',
    tag: 'Fun',
  },
]

export default function Home() {
  const { user } = useAuth()
  const firstName = user?.email ? user.email.split('@')[0] : 'there'

  return (
    <div>
      <div className="hub-intro">
        <h1>Hey {firstName} 👋</h1>
        <p>Everything the family's building lives here. Pick a board to open it up.</p>
      </div>

      <div className="pin-grid">
        {sections.map((s) => (
          <Link key={s.to} to={s.to} className="pin-card">
            <span className="pin-dot" aria-hidden="true" />
            <h3>{s.title}</h3>
            <p>{s.blurb}</p>
            <span className="pin-tag">{s.tag}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
