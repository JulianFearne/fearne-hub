// src/pages/animalPlaceThingData.js
// Fearne Hub :: every Supabase call for the AnimalPlaceThing game lives
// here, matching the recipesData.js / mealPlanData.js pattern — pages
// import this module rather than the Supabase client directly.

import { supabase } from '../supabaseClient'

// ---------- identity ----------

// AnimalPlaceThing is playable without a Fearne Hub account: anyone with a
// game code can join. RLS still needs *some* authenticated identity to
// attach rows to, so a person with no hub session gets a Supabase anonymous
// session instead — a real (if account-less) auth.users row, good enough to
// own a game_players row and survive a page refresh. Requires "Anonymous
// Sign-Ins" to be enabled in the Supabase project (Authentication settings).
export async function signInAsGuest() {
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

// ---------- session snapshot + realtime ----------

export async function loadSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: submissions }] = await Promise.all([
    supabase.from('game_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('game_players').select('*').eq('session_id', sessionId).order('joined_at'),
    supabase.from('game_submissions').select('*').eq('session_id', sessionId),
  ])
  return {
    session: session ?? null,
    players: players ?? [],
    submissions: submissions ?? [],
  }
}

// Subscribes to realtime changes for one session across all three game
// tables. `handlers` is { onSessionUpdate(row), onPlayersChange(), onSubmissionsChange() }.
// Returns the channel — pass it to unsubscribeFromSession() to tear down.
export function subscribeToSessionChanges(sessionId, { onSessionUpdate, onPlayersChange, onSubmissionsChange }) {
  return supabase
    .channel(`apt:${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') return
        onSessionUpdate(payload.new)
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_players', filter: `session_id=eq.${sessionId}` },
      () => onPlayersChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_submissions', filter: `session_id=eq.${sessionId}` },
      () => onSubmissionsChange()
    )
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

// ---------- sessions ----------

export async function insertGameSession({
  id,
  hostId,
  endCondition,
  pointGoal,
  rulesVersion,
  categorySet,
  roundSeconds,
}) {
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({
      id,
      host_id: hostId,
      phase: 'lobby',
      end_condition: endCondition,
      point_goal: endCondition === 'points' ? pointGoal : null,
      rules_version: rulesVersion,
      category_set: categorySet,
      round_seconds: roundSeconds,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getSessionByCode(code) {
  const { data } = await supabase.from('game_sessions').select('*').eq('id', code).single()
  return data ?? null
}

export async function updateSession(sessionId, patch) {
  const { error } = await supabase.from('game_sessions').update(patch).eq('id', sessionId)
  if (error) throw error
}

// ---------- players ----------

export async function upsertPlayer(sessionId, userId, displayName) {
  const { error } = await supabase
    .from('game_players')
    .upsert({ session_id: sessionId, user_id: userId, display_name: displayName })
  if (error) throw error
}

export async function removePlayer(sessionId, userId) {
  const { error } = await supabase
    .from('game_players')
    .delete()
    .match({ session_id: sessionId, user_id: userId })
  if (error) throw error
}

// ---------- submissions ----------

export async function upsertSubmission(sessionId, round, userId, answers) {
  const { error } = await supabase
    .from('game_submissions')
    .upsert({ session_id: sessionId, round, user_id: userId, answers: answers || {} })
  if (error) throw error
}

export async function getSubmittedUserCount(sessionId, round) {
  const { data, error } = await supabase
    .from('game_submissions')
    .select('user_id')
    .eq('session_id', sessionId)
    .eq('round', round)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.user_id)).size
}
