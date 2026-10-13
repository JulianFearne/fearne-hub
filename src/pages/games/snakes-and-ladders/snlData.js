// src/pages/games/snakes-and-ladders/snlData.js
// Every Supabase call for online Snakes and Ladders lives here, matching the
// ludoData.js / goFishData.js pattern. Schema and RLS:
// _reference/snakes-and-ladders-schema.sql.

import { supabase } from '../../../supabaseClient'

export const MAX_PLAYERS = 4

export function makeCode() {
  // No I / L / O to keep codes easy to read aloud.
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)]
  return s
}

export function inviteUrl(code) {
  return `${window.location.origin}/games/snakes-and-ladders?code=${code}`
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: rolls }] = await Promise.all([
    supabase.from('snl_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('snl_players').select('*').eq('session_id', sessionId).order('seat'),
    supabase.from('snl_rolls').select('*').eq('session_id', sessionId).order('roll_number'),
  ])
  return { session: session ?? null, players: players ?? [], rolls: rolls ?? [] }
}

export function subscribeToSession(sessionId, onChange) {
  return supabase
    .channel(`snl-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'snl_rolls', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'snl_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'snl_players', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

export async function createSession(hostId, displayName, rulesVersion) {
  const { data: session, error } = await supabase
    .from('snl_sessions')
    .insert({ host_id: hostId, code: makeCode(), status: 'waiting', rules_version: rulesVersion })
    .select()
    .single()
  if (error) throw error
  const { error: pErr } = await supabase
    .from('snl_players')
    .insert({ session_id: session.id, user_id: hostId, display_name: displayName, seat: 0 })
  if (pErr) throw pErr
  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('snl_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function getSession(sessionId) {
  const { data } = await supabase.from('snl_sessions').select('*').eq('id', sessionId).maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('snl_players').select('*').eq('session_id', sessionId).order('seat')
  return data ?? []
}

export async function joinSession(sessionId, userId, displayName) {
  const existing = await getPlayers(sessionId)
  if (existing.some((p) => p.user_id === userId)) return
  if (existing.length >= MAX_PLAYERS) throw new Error('That game is already full.')
  const { error } = await supabase
    .from('snl_players')
    .insert({ session_id: sessionId, user_id: userId, display_name: displayName, seat: existing.length })
  if (error) throw new Error('Someone just took that seat. Try again.')
}

// Locks in the player count; nobody can join after this.
export async function startSession(sessionId, numPlayers) {
  await supabase
    .from('snl_sessions')
    .update({ status: 'active', num_players: numPlayers })
    .eq('id', sessionId)
    .eq('status', 'waiting')
}

export async function insertRoll({ sessionId, userId, seat, value, rollNumber }) {
  const { error } = await supabase.from('snl_rolls').insert({
    session_id: sessionId,
    user_id: userId,
    seat,
    value,
    roll_number: rollNumber,
  })
  return error
}

export async function finishSession(sessionId, winnerSeat) {
  await supabase
    .from('snl_sessions')
    .update({ status: 'finished', winner_seat: winnerSeat })
    .eq('id', sessionId)
    .neq('status', 'finished')
}
