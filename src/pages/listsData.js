import { supabase } from '../supabaseClient'

// Every list in the hub lives in one `lists` table, with `kind` saying which
// section it belongs to. Adding a new kind of list means adding an entry
// here; the pages, routes and headers all read from this object.
//
//   amounts    items carry an optional amount ("2 tins"), shown on the right
//   combine    several lists can be merged into a new one
//   splitDone  ticked items drop into their own group below the rest
//   clearDone  a button to delete every ticked item at once
//   resetAll   a button to untick everything, for lists you reuse
export const LIST_KINDS = {
  shopping: {
    title: 'Shopping lists',
    noun: 'shopping list',
    icon: 'shopping-basket',
    blurb: 'Tick off, or combine a shop',
    namePlaceholder: 'New list name, e.g. Family',
    itemPlaceholder: 'Add an item…',
    emptyBody: "Create one above, or pull the ingredients in from this week's meals.",
    emptyItemsBody: "Add items above, or pull ingredients in from this week's meals.",
    doneLabel: 'Got it',
    amounts: true,
    combine: true,
    splitDone: true,
  },
  todo: {
    title: 'To-do lists',
    noun: 'to-do list',
    icon: 'list-todo',
    blurb: 'Jobs to get done, ticked off as you go',
    namePlaceholder: 'New list name, e.g. House jobs',
    itemPlaceholder: 'Add a task…',
    emptyBody: 'Create one above to start jotting down jobs.',
    emptyItemsBody: 'Add a task above.',
    doneLabel: 'Done',
    splitDone: true,
    clearDone: true,
  },
  checklist: {
    title: 'Checklists',
    noun: 'checklist',
    icon: 'clipboard-check',
    blurb: 'Reusable lists, e.g. packing or leaving the house',
    namePlaceholder: 'New checklist name, e.g. Holiday packing',
    itemPlaceholder: 'Add a step…',
    emptyBody: 'Create one above, then untick it all and reuse it next time.',
    emptyItemsBody: 'Add steps above.',
    resetAll: true,
  },
}

export function listKindFor(list) {
  return LIST_KINDS[list.kind] ? list.kind : 'shopping'
}

// ---------- access ----------
// Enforced by RLS (see _reference/lists-sharing-schema.sql); these only
// decide what the UI offers. The owner is lists.created_by; everyone else
// needs a row in list_shares.

export const PERMISSIONS = [
  { id: 'view', label: 'View', hint: 'See the list' },
  { id: 'edit', label: 'Edit', hint: 'Add, tick and remove items' },
  { id: 'manage', label: 'Manage', hint: 'Edit, plus rename, share and delete' },
]

// 'owner' | 'manage' | 'edit' | 'view' | null, for a list fetched with its
// list_shares embedded.
export function accessFor(list, userId) {
  if (list.created_by === userId) return 'owner'
  return list.list_shares?.find((s) => s.user_id === userId)?.permission ?? null
}

export const canEdit = (access) => ['owner', 'manage', 'edit'].includes(access)
export const canManage = (access) => ['owner', 'manage'].includes(access)

// ---------- lists ----------

// Pass a kind to get just that section's lists, or nothing for every list.
export async function fetchLists(kind) {
  let query = supabase.from('lists').select('*, list_shares(user_id, permission)').order('created_at', { ascending: true })
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createList(name, kind) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('lists')
    .insert([{ name, kind, created_by: userData.user.id }])
    .select('*, list_shares(user_id, permission)')
    .single()
  if (error) throw error
  return data
}

export async function renameList(id, name) {
  const { error } = await supabase.from('lists').update({ name }).eq('id', id)
  if (error) throw error
}

export async function deleteList(id) {
  const { error } = await supabase.from('lists').delete().eq('id', id)
  if (error) throw error
}

// ---------- sharing ----------

export async function setListShare(listId, userId, permission) {
  const { error } = await supabase
    .from('list_shares')
    .upsert([{ list_id: listId, user_id: userId, permission }], { onConflict: 'list_id,user_id' })
  if (error) throw error
}

// Also how someone leaves a list shared with them (removing their own share).
export async function removeListShare(listId, userId) {
  const { error } = await supabase.from('list_shares').delete().eq('list_id', listId).eq('user_id', userId)
  if (error) throw error
}

// ---------- items ----------

export async function fetchListItems(listId) {
  const { data, error } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function addListItem(listId, { name, amount = null, source = 'manual', recipe_title = null }) {
  const { data, error } = await supabase
    .from('list_items')
    .insert([{ list_id: listId, name, amount, source, recipe_title }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addListItems(listId, items) {
  const rows = items.map((i) => ({ list_id: listId, ...i }))
  const { data, error } = await supabase.from('list_items').insert(rows).select()
  if (error) throw error
  return data
}

export async function toggleListItem(id, checked) {
  const { error } = await supabase.from('list_items').update({ checked }).eq('id', id)
  if (error) throw error
}

export async function deleteListItem(id) {
  const { error } = await supabase.from('list_items').delete().eq('id', id)
  if (error) throw error
}

export async function uncheckAllItems(listId) {
  const { error } = await supabase.from('list_items').update({ checked: false }).eq('list_id', listId).eq('checked', true)
  if (error) throw error
}

export async function deleteCheckedItems(listId) {
  const { error } = await supabase.from('list_items').delete().eq('list_id', listId).eq('checked', true)
  if (error) throw error
}
