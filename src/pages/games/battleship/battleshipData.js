// src/pages/games/battleship/battleshipData.js
// Every Supabase call for online Battleship lives here, matching the
// connectFourData.js / goFishData.js pattern. Schema and RLS:
// _reference/battleship-schema.sql.

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

export function inviteUrl(code) {
  return `${window.location.origin}/games/battleship?code=${code}`
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: shots }] = await Promise.all([
    supabase.from('bs_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('bs_players').select('*').eq('session_id', sessionId).order('seat'),
    supabase.from('bs_shots').select('*').eq('session_id', sessionId).order('shot_number'),
  ])
  return { session: session ?? null, players: players ?? [], shots: shots ?? [] }
}

export function subscribeToSession(sessionId, onChange) {
  return supabase
    .channel(`bs-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bs_shots', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bs_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bs_players', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

export async function createSession(hostId, displayName, rulesVersion) {
  const { data: session, error } = await supabase
    .from('bs_sessions')
    .insert({ host_id: hostId, code: makeCode(), status: 'waiting', rules_version: rulesVersion })
    .select()
    .single()
  if (error) throw error

  const { error: pErr } = await supabase
    .from('bs_players')
    .insert({ session_id: session.id, user_id: hostId, display_name: displayName, seat: 1 })
  if (pErr) throw pErr

  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('bs_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function getSession(sessionId) {
  const { data } = await supabase.from('bs_sessions').select('*').eq('id', sessionId).maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('bs_players').select('*').eq('session_id', sessionId)
  return data ?? []
}

export async function joinSessionAsSeat2(sessionId, userId, displayName) {
  const { error } = await supabase
    .from('bs_players')
    .insert({ session_id: sessionId, user_id: userId, display_name: displayName, seat: 2 })
  if (error) throw error
  await supabase.from('bs_sessions').update({ status: 'active' }).eq('id', sessionId).eq('status', 'waiting')
}

// Commits this player's fleet. RLS only allows it while their fleet is
// still empty, so ships can't be moved once the battle is under way.
export async function saveFleet(sessionId, userId, fleet) {
  const { error } = await supabase
    .from('bs_players')
    .update({ fleet })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('fleet', null)
  if (error) throw error
}

export async function insertShot({ sessionId, userId, seat, r, c, shotNumber }) {
  const { error } = await supabase.from('bs_shots').insert({
    session_id: sessionId,
    user_id: userId,
    seat,
    cell_row: r,
    cell_col: c,
    shot_number: shotNumber,
  })
  return error
}

export async function finishSession(sessionId, winnerSeat) {
  await supabase
    .from('bs_sessions')
    .update({ status: 'finished', winner_seat: winnerSeat })
    .eq('id', sessionId)
    .neq('status', 'finished')
}

// Points a finished game at its rematch so the other player gets a "join
// the rematch" button. Returns false when they beat us to it.
export async function linkRematch(oldSessionId, newSessionId) {
  const { data, error } = await supabase
    .from('bs_sessions')
    .update({ rematch_id: newSessionId })
    .eq('id', oldSessionId)
    .is('rematch_id', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
