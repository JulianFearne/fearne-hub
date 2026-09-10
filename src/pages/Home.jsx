import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { fetchEvents, nextOccurrence, toISODate, formatEventDate, formatEventTime } from './calendarData'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'

const shortcuts = [
  { to: '/recipes', title: 'Recipes', blurb: 'Browse, cook, add your own', icon: 'soup' },
  { to: '/planner', title: "This week's meals", blurb: '7 days, planned out', icon: 'calendar-days' },
  { to: '/shopping', title: 'Shopping lists', blurb: 'Tick off, or combine a shop', icon: 'shopping-basket' },
  { to: '/chores', title: 'Chores', blurb: "Who's doing what, and by when", icon: 'list-checks' },
  { to: '/calendar', title: 'Calendar', blurb: 'Events and birthdays', icon: 'calendar-days' },
  { to: '/workouts', title: 'Workouts', blurb: 'Log a session, see your progress', icon: 'dumbbell' },
  { to: '/games', title: 'Games', blurb: 'Connect Four, Sudoku, Hangman, and more', icon: 'gamepad-2' },
]

function useUpcomingEvents(limit = 3) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch(() => {})
  }, [])

  return useMemo(() => {
    const todayISO = toISODate(new Date())
    return events
      .map((e) => ({ ...e, nextDate: nextOccurrence(e, todayISO) }))
      .filter((e) => e.nextDate)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate) || (a.event_time || '').localeCompare(b.event_time || ''))
      .slice(0, limit)
  }, [events, limit])
}

export default function Home() {
  const { user } = useAuth()
  const firstName = user?.email ? user.email.split('@')[0] : 'there'
  const upcoming = useUpcomingEvents()

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

      {upcoming.length > 0 && (
        <>
          <p className="fh-home__section">Coming up</p>
          <div className="fh-rows">
            {upcoming.map((ev) => (
              <Link key={ev.id} to="/calendar" className="fh-row">
                <span className="fh-row__lead">
                  <Icon name={ev.recurrence === 'yearly' ? 'sparkles' : 'calendar-days'} size={18} />
                </span>
                <span className="fh-row__body">
                  <span className="fh-row__label">{ev.title}</span>
                  <span className="fh-row__meta">
                    {formatEventDate(ev.nextDate)}
                    {ev.event_time && ` · ${formatEventTime(ev.event_time)}`}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
