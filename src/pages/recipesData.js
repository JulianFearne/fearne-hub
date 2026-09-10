import { supabase } from '../supabaseClient'

// No emoji per the design system's content rules — categories carry a
// Lucide icon name instead, rendered through the Icon component.
export const CATEGORIES = [
  { id: 'all',     label: 'All',      icon: 'utensils' },
  { id: 'starter', label: 'Starters', icon: 'soup' },
  { id: 'main',    label: 'Mains',    icon: 'chef-hat' },
  { id: 'dessert', label: 'Desserts', icon: 'sparkles' },
  { id: 'snack',   label: 'Snacks',   icon: 'cookie' },
  { id: 'drink',   label: 'Drinks',   icon: 'cup-soda' },
]

export async function fetchRecipes() {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addRecipe(recipe) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('recipes')
    // The design system dropped emoji from the add-recipe form (no emoji,
    // per its content rules), but the `emoji` column still backs the meal
    // planner's embed until that page is migrated too — keep it filled in.
    .insert([{ emoji: '🍽️', ...recipe, created_by: userData.user.id }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRecipe(id) {
  const { error } = await supabase.from('recipes').delete().eq('id', id)
  if (error) throw error
}

// Parses the friendly textarea format into ingredient objects.
// A line starting with "## " becomes a group header.
// Otherwise "Name | amount" (amount optional) becomes an ingredient.
export function parseIngredients(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('## ')) {
        return { group: line.slice(3).trim() }
      }
      const [name, amount] = line.split('|').map((s) => s?.trim())
      return { name, amount: amount || undefined }
    })
}

export function parseSteps(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function parseTags(text) {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}
