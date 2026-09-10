import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import {
  RECURRENCES,
  fetchEvents,
  createEvent,
  deleteEvent,
  nextOccurrence,
  toISODate,
  formatEventDate,
  formatEventTime,
  downloadICS,
} from './calendarData'
import Button from '../components/ds/Button.jsx'
import IconButton from '../components/ds/IconButton.jsx'
import Icon from '../components/ds/Icon.jsx'
import Sheet from '../components/ds/Sheet.jsx'
import { Field, Input, Select } from '../components/ds/Field.jsx'

export default function Calendar() {
  const { user, isAdmin } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    load()
  }, [])

  function load() {
    setLoading(true)
    fetchEvents()
      .then(setEvents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  async function handleDelete(id) {
    try {
      await deleteEvent(id)
      setEvents((prev) => prev.filter((e) => e.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  const todayISO = toISODate(new Date())

  const groups = useMemo(() => {
    const upcoming = events
      .map((e) => ({ ...e, nextDate: nextOccurrence(e, todayISO) }))
      .filter((e) => e.nextDate)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate) || (a.event_time || '').localeCompare(b.event_time || ''))

    const map = new Map()
    for (const e of upcoming) {
      if (!map.has(e.nextDate)) map.set(e.nextDate, [])
      map.get(e.nextDate).push(e)
    }
    return Array.from(map.entries())
  }, [events, todayISO])

  return (
    <div>
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="fh-cal__toolbar">
        <Button variant="quiet" icon="share-2" onClick={() => downloadICS(events)} disabled={events.length === 0}>
          Export .ics
        </Button>
        <Button icon="plus" onClick={() => setShowForm(true)}>
          Add event
        </Button>
      </div>

      {loading && <p className="fh-loading">Loading…</p>}

      {!loading && groups.length === 0 && (
        <div className="fh-empty">
          <span className="fh-empty__mark">
            <Icon name="calendar-days" size={22} />
          </span>
          <p className="fh-empty__title">Nothing on the calendar</p>
          <p className="fh-empty__body">Add an event above — birthdays repeat every year automatically.</p>
        </div>
      )}

      {!loading &&
        groups.map(([date, dayEvents]) => (
          <div key={date} className="fh-cal__group">
            <p className="fh-cal__date">{formatEventDate(date)}</p>
            <div className="fh-rows">
              {dayEvents.map((ev) => (
                <div key={ev.id} className="fh-row fh-row--static">
                  <span className="fh-row__lead">
                    <Icon name={ev.recurrence === 'yearly' ? 'sparkles' : 'calendar-days'} size={18} />
                  </span>
                  <span className="fh-row__body">
                    <span className="fh-row__label">{ev.title}</span>
                    {ev.event_time && <span className="fh-row__meta">{formatEventTime(ev.event_time)}</span>}
                  </span>
                  {(isAdmin || ev.created_by === user?.id) && (
                    <span className="fh-row__trail">
                      <IconButton icon="trash-2" label={`Delete ${ev.title}`} onClick={() => handleDelete(ev.id)} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

      {showForm && (
        <AddEventSheet
          onClose={() => setShowForm(false)}
          onCreated={(created) => setEvents((prev) => [...prev, created])}
        />
      )}
    </div>
  )
}

function AddEventSheet({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(toISODate(new Date()))
  const [time, setTime] = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSubmitting(true)
    try {
      const created = await createEvent({
        title: title.trim(),
        event_date: date,
        event_time: time || null,
        recurrence,
      })
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      title="Add event"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="fh-cal-form" loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      {error && (
        <div className="fh-notice fh-notice--danger">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <form id="fh-cal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
        <Field label="Title" htmlFor="cal-title">
          <Input id="cal-title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </Field>

        <Field label="Date" htmlFor="cal-date">
          <Input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <Field label="Time (optional)" htmlFor="cal-time">
          <Input id="cal-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>

        <Field label="Repeats" htmlFor="cal-recurrence">
          <Select id="cal-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
            {RECURRENCES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Sheet>
  )
}
