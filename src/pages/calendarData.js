import { supabase } from '../supabaseClient'

export const RECURRENCES = [
  { id: 'none', label: "Doesn't repeat" },
  { id: 'yearly', label: 'Repeats yearly (e.g. birthday)' },
]

export function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

export async function fetchEvents() {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .order('event_date', { ascending: true })
  if (error) throw error
  return data
}

export async function createEvent({ title, event_date, event_time, recurrence }) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('calendar_events')
    .insert([{ title, event_date, event_time: event_time || null, recurrence, created_by: userData.user.id }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}

// Date of this event's next occurrence on or after `from` (both YYYY-MM-DD),
// or null if it has none. A "yearly" event repeats on the same month/day
// every year — its stored `event_date` only fixes which month/day, the year
// is irrelevant, so a birthday added in any past year still recurs.
export function nextOccurrence(event, from) {
  if (event.recurrence !== 'yearly') {
    return event.event_date >= from ? event.event_date : null
  }
  const [, month, day] = event.event_date.split('-')
  const fromYear = from.slice(0, 4)
  let candidate = `${fromYear}-${month}-${day}`
  if (candidate < from) candidate = `${Number(fromYear) + 1}-${month}-${day}`
  return candidate
}

export function formatEventDate(isoDate) {
  const today = toISODate(new Date())
  const tomorrow = toISODate(new Date(Date.now() + 86400000))
  if (isoDate === today) return 'Today'
  if (isoDate === tomorrow) return 'Tomorrow'
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatEventTime(time) {
  if (!time) return null
  const [h, m] = time.split(':')
  const d = new Date()
  d.setHours(Number(h), Number(m))
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// ---------- .ics export ----------
// A one-time snapshot download, not a live-syncing subscription — good
// enough to import once into Outlook/Google/Apple Calendar. Recurrence is
// encoded as a native RRULE so the destination calendar keeps it repeating.

function icsEscape(text) {
  return String(text)
    .replace(/[\\;,]/g, (c) => `\\${c}`)
    .replace(/\n/g, '\\n')
}

function pad(n) {
  return String(n).padStart(2, '0')
}

export function buildICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fearne Hub//Calendar//EN', 'CALSCALE:GREGORIAN']
  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours()
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

  for (const ev of events) {
    const [y, m, d] = ev.event_date.split('-')
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.id}@fearne.org`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`SUMMARY:${icsEscape(ev.title)}`)
    if (ev.event_time) {
      const [h, min] = ev.event_time.split(':')
      lines.push(`DTSTART:${y}${m}${d}T${pad(h)}${pad(min)}00`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${y}${m}${d}`)
    }
    if (ev.recurrence === 'yearly') lines.push('RRULE:FREQ=YEARLY')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadICS(events, filename = 'fearne-hub-calendar.ics') {
  const blob = new Blob([buildICS(events)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
