// src/pages/games/connect-four/connectFourData.js
// Every Supabase call for online Connect Four lives here, matching the
// animalPlaceThingData.js pattern — components import this module rather
// than the Supabase client directly.

import { supabase } from '../../../supabaseClient'

export function makeCode() {
  // No I / L / O to keep codes easy to read aloud.
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += letters[Math.floor(Math.random() * letters.length)]
  }
  return s
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: moves }] = await Promise.all([
    supabase.from('c4_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('c4_players').select('*').eq('session_id', sessionId).order('seat'),
    supabase.from('c4_moves').select('*').eq('session_id', sessionId).order('move_number'),
  ])
  return {
    session: session ?? null,
    players: players ?? [],
    // Map the DB "col" column onto the engine's "column" field.
    moves: (moves ?? []).map((r) => ({ ...r, column: r.col })),
  }
}

export function subscribeToSession(sessionId, onChange) {
  return supabase
    .channel(`c4-${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'c4_moves', filter: `session_id=eq.${sessionId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'c4_sessions', filter: `id=eq.${sessionId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'c4_players', filter: `session_id=eq.${sessionId}` },
      onChange
    )
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

export async function createSession(hostId, rulesVersion) {
  const code = makeCode()
  const { data: session, error } = await supabase
    .from('c4_sessions')
    .insert({ host_id: hostId, code, status: 'waiting', rules_version: rulesVersion })
    .select()
    .single()
  if (error) throw error

  const { error: pErr } = await supabase
    .from('c4_players')
    .insert({ session_id: session.id, user_id: hostId, seat: 1 })
  if (pErr) throw pErr

  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('c4_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('c4_players').select('*').eq('session_id', sessionId)
  return data ?? []
}

export async function joinSessionAsSeat2(sessionId, userId) {
  const { error } = await supabase
    .from('c4_players')
    .insert({ session_id: sessionId, user_id: userId, seat: 2 })
  if (error) throw error
  await supabase.from('c4_sessions').update({ status: 'active' }).eq('id', sessionId).eq('status', 'waiting')
}

export async function insertMove({ sessionId, userId, seat, col, moveNumber }) {
  const { error } = await supabase.from('c4_moves').insert({
    session_id: sessionId,
    user_id: userId,
    seat,
    col,
    move_number: moveNumber,
  })
  return error
}

export async function finalizeSession(sessionId, winnerSeat) {
  await supabase
    .from('c4_sessions')
    .update({ status: 'finished', winner_seat: winnerSeat })
    .eq('id', sessionId)
    .eq('status', 'active')
}
