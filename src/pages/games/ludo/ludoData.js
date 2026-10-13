// src/pages/games/ludo/ludoData.js
// Every Supabase call for online Ludo lives here, matching the
// goFishData.js / battleshipData.js pattern. Schema and RLS:
// _reference/ludo-schema.sql.

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
  return `${window.location.origin}/games/ludo?code=${code}`
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: events }] = await Promise.all([
    supabase.from('ludo_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('ludo_players').select('*').eq('session_id', sessionId).order('seat'),
    supabase.from('ludo_events').select('*').eq('session_id', sessionId).order('event_number'),
  ])
  return { session: session ?? null, players: players ?? [], events: events ?? [] }
}

export function subscribeToSession(sessionId, onChange) {
  return supabase
    .channel(`ludo-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_events', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ludo_players', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

export async function createSession(hostId, displayName, rulesVersion) {
  const { data: session, error } = await supabase
    .from('ludo_sessions')
    .insert({ host_id: hostId, code: makeCode(), status: 'waiting', rules_version: rulesVersion })
    .select()
    .single()
  if (error) throw error
  const { error: pErr } = await supabase
    .from('ludo_players')
    .insert({ session_id: session.id, user_id: hostId, display_name: displayName, seat: 0 })
  if (pErr) throw pErr
  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('ludo_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function getSession(sessionId) {
  const { data } = await supabase.from('ludo_sessions').select('*').eq('id', sessionId).maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('ludo_players').select('*').eq('session_id', sessionId).order('seat')
  return data ?? []
}

export async function joinSession(sessionId, userId, displayName) {
  const existing = await getPlayers(sessionId)
  if (existing.some((p) => p.user_id === userId)) return
  if (existing.length >= MAX_PLAYERS) throw new Error('That game is already full.')
  const { error } = await supabase
    .from('ludo_players')
    .insert({ session_id: sessionId, user_id: userId, display_name: displayName, seat: existing.length })
  if (error) throw new Error('Someone just took that seat. Try again.')
}

// Locks in the player count; nobody can join after this.
export async function startSession(sessionId, numPlayers) {
  await supabase
    .from('ludo_sessions')
    .update({ status: 'active', num_players: numPlayers })
    .eq('id', sessionId)
    .eq('status', 'waiting')
}

export async function insertEvent({ sessionId, userId, seat, type, value, eventNumber }) {
  const { error } = await supabase.from('ludo_events').insert({
    session_id: sessionId,
    user_id: userId,
    seat,
    type,
    value,
    event_number: eventNumber,
  })
  return error
}

export async function finishSession(sessionId, winnerSeat) {
  await supabase
    .from('ludo_sessions')
    .update({ status: 'finished', winner_seat: winnerSeat })
    .eq('id', sessionId)
    .neq('status', 'finished')
}
