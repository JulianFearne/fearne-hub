import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../supabaseClient'
import { displayName } from './accountData'
import { fetchEvents, nextOccurrence, toISODate, formatEventDate, formatEventTime } from './calendarData'
import Card, { CardTitle, CardMeta } from '../components/ds/Card.jsx'
import Button from '../components/ds/Button.jsx'
import Icon from '../components/ds/Icon.jsx'

const shortcuts = [
  { to: '/recipes', title: 'Recipes', blurb: 'Browse, cook, add your own', icon: 'soup' },
  { to: '/planner', title: "This week's meals", blurb: '7 days, planned out', icon: 'calendar-days' },
  { to: '/lists', title: 'Lists', blurb: 'Shopping, to-dos, checklists and chores', icon: 'clipboard-list' },
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

// The wardrobe (public/wardrobe/, a standalone build) is private per user, so
// its tile only shows for someone who has opened it before. RLS means this
// query can only ever see the viewer's own row.
function useHasWardrobe() {
  const [has, setHas] = useState(false)
  useEffect(() => {
    supabase
      .from('wardrobe_state')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => setHas(!!data))
  }, [])
  return has
}

export default function Home() {
  const { user, profile } = useAuth()
  const name = profile ? displayName(profile, user?.email) : 'there'
  const upcoming = useUpcomingEvents()
  const hasWardrobe = useHasWardrobe()

  return (
    <div>
      <p className="fh-home__greet">Hey {name}.</p>
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
        {hasWardrobe && (
          <Card href="/wardrobe/" tile>
            <span className="fh-home__mark">
              <Icon name="shirt" size={20} />
            </span>
            <div>
              <CardTitle>Wardrobe</CardTitle>
              <CardMeta>Outfits, week plan, buy list</CardMeta>
            </div>
          </Card>
        )}
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
