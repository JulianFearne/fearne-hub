import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'

const shortcuts = [
  { to: '/recipes', title: 'Recipes', blurb: 'Browse, cook, add your own', icon: 'soup' },
  { to: '/planner', title: "This week's meals", blurb: '7 days, planned out', icon: 'calendar-days' },
  { to: '/shopping', title: 'Shopping lists', blurb: 'Tick off, or combine a shop', icon: 'shopping-basket' },
  { to: '/chores', title: 'Chores', blurb: "Who's doing what, and by when", icon: 'list-checks' },
  { to: '/workouts', title: 'Workouts', blurb: 'Log a session, see your progress', icon: 'dumbbell' },
  { to: '/games', title: 'Games', blurb: 'Connect Four, Sudoku, Hangman, and more', icon: 'gamepad-2' },
]

export default function Home() {
  const { user } = useAuth()
  const firstName = user?.email ? user.email.split('@')[0] : 'there'

  return (
    <div>
      <p className="fh-home__greet">Hey {firstName}.</p>
      <p className="fh-home__sub">Everything the family's building lives here.</p>

      <Card variant="feature" className="fh-home__feature">
        <p className="fh-home__eyebrow">This week</p>
        <p className="fh-home__dish">What's for dinner tonight?</p>
        <div className="fh-home__actions">
          <Button as={Link} to="/planner" variant="onFeature" icon="calendar-days">
            Open this week's meals
          </Button>
        </div>
      </Card>

      <div className="fh-home__grid">
        {shortcuts.map((s) => (
          <Card key={s.to} as={Link} to={s.to} tile>
            <span className="fh-home__mark">
              <Icon name={s.icon} size={20} />
            </span>
            <div>
              <CardTitle>{s.title}</CardTitle>
              <CardMeta>{s.blurb}</CardMeta>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
