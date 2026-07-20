import { supabase } from '../supabaseClient'

export const CATEGORIES = [
  { id: 'all', label: 'All Recipes', emoji: '📖' },
  { id: 'subs', label: 'Subs & Sandwiches', emoji: '🥖' },
  { id: 'pasta', label: 'Pasta & Noodles', emoji: '🍝' },
  { id: 'mains', label: 'Mains', emoji: '🍽️' },
  { id: 'soups', label: 'Soups & Stews', emoji: '🍲' },
  { id: 'salads', label: 'Salads', emoji: '🥗' },
  { id: 'baking', label: 'Baking', emoji: '🥐' },
  { id: 'snacks', label: 'Snacks & Sides', emoji: '🧆' },
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
    .insert([{ ...recipe, created_by: userData.user.id }])
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
