import { supabase } from '../supabaseClient'

// Best-effort: notifying someone is never allowed to block whatever
// triggered it (chore creation, etc). The `notify` Edge Function is a
// separate deploy (see docs/push-notifications.md) — until that exists,
// or for a user with no push subscription / notifications turned off,
// this just quietly does nothing.
export async function notify({ userId, title, body, url }) {
  try {
    await supabase.functions.invoke('notify', { body: { userId, title, body, url } })
  } catch {
    // ignore — see comment above
  }
}
