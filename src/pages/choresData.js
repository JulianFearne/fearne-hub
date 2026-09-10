import { supabase } from '../supabaseClient'

export const FREQUENCIES = [
  { id: 'once', label: 'One-off' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
]

// The "period" a chore's completion is tracked against — today's date for a
// daily chore, this week's Monday for a weekly one, a fixed constant for a
// one-off. Comparing period keys (rather than storing a "done" boolean) is
// what makes recurring chores reset themselves with no cron job: yesterday's
// completion just doesn't match today's key any more.
export function currentPeriodKey(frequency, now = new Date()) {
  if (frequency === 'daily') return now.toISOString().slice(0, 10)
  if (frequency === 'weekly') {
    const d = new Date(now)
    const day = (d.getDay() + 6) % 7 // Monday = 0
    d.setDate(d.getDate() - day)
    return d.toISOString().slice(0, 10)
  }
  return 'once'
}

export async function fetchChores() {
  const { data, error } = await supabase
    .from('chores')
    .select('*, chore_completions(id, completed_by, period_key, completed_at)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createChore({ title, assigned_to, frequency }) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('chores')
    .insert([{ title, assigned_to: assigned_to || null, frequency, created_by: userData.user.id }])
    .select('*, chore_completions(id, completed_by, period_key, completed_at)')
    .single()
  if (error) throw error
  return data
}

export async function deleteChore(id) {
  const { error } = await supabase.from('chores').delete().eq('id', id)
  if (error) throw error
}

export async function completeChore(choreId, frequency) {
  const { data: userData } = await supabase.auth.getUser()
  const period_key = currentPeriodKey(frequency)
  const { data, error } = await supabase
    .from('chore_completions')
    .upsert([{ chore_id: choreId, completed_by: userData.user.id, period_key }], {
      onConflict: 'chore_id,period_key',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function uncompleteChore(choreId, frequency) {
  const period_key = currentPeriodKey(frequency)
  const { error } = await supabase
    .from('chore_completions')
    .delete()
    .eq('chore_id', choreId)
    .eq('period_key', period_key)
  if (error) throw error
}

export async function fetchFamilyMembers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('approved', true)
    .order('email', { ascending: true })
  if (error) throw error
  return data
}
