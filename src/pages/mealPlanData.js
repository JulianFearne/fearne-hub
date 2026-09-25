import { supabase } from '../supabaseClient'

export const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
]

// ---------- date helpers ----------

export function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

export function startOfWeek(date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

// ---------- meal plan entries ----------

export async function fetchMealPlanEntries(startDate, endDate) {
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select('*, recipes(id, title, emoji, category, ingredients)')
    .gte('entry_date', toISODate(startDate))
    .lte('entry_date', toISODate(endDate))
  if (error) throw error
  return data
}

export async function addMealPlanEntry({ entry_date, meal_type, recipe_id }) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .insert([{ entry_date, meal_type, recipe_id, created_by: userData.user.id }])
    .select('*, recipes(id, title, emoji, category, ingredients)')
    .single()
  if (error) throw error
  return data
}

export async function deleteMealPlanEntry(id) {
  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id)
  if (error) throw error
}

// Pulls every non-header ingredient out of the recipes attached to a set of
// meal plan entries, tagging each with which recipe it came from.
export function ingredientsFromEntries(entries) {
  const items = []
  for (const entry of entries) {
    const recipe = entry.recipes
    if (!recipe?.ingredients) continue
    for (const ing of recipe.ingredients) {
      if (ing.group) continue
      items.push({
        name: ing.name,
        amount: ing.amount || null,
        source: 'meal',
        recipe_title: recipe.title,
      })
    }
  }
  return items
}
