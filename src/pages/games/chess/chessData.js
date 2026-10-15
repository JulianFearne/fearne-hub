// src/pages/games/chess/checkersData.js
// Every Supabase call for online Chess lives here, matching the
// ludoData.js / battleshipData.js pattern. Schema and RLS:
// _reference/chess-schema.sql.

import { supabase } from '../../../supabaseClient'

export function makeCode() {
  // No I / L / O to keep codes easy to read aloud.
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)]
  return s
}

export function inviteUrl(code) {
  return `${window.location.origin}/games/chess?code=${code}`
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: moves }] = await Promise.all([
    supabase.from('ch_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('ch_players').select('*').eq('session_id', sessionId).order('seat'),
    supabase.from('ch_moves').select('*').eq('session_id', sessionId).order('move_number'),
  ])
  return { session: session ?? null, players: players ?? [], moves: moves ?? [] }
}

export function subscribeToSession(sessionId, onChange) {
  return supabase
    .channel(`ch-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ch_moves', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ch_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ch_players', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

// The host plays White (seat 0) and goes first.
export async function createSession(hostId, displayName, rulesVersion) {
  const { data: session, error } = await supabase
    .from('ch_sessions')
    .insert({ host_id: hostId, code: makeCode(), status: 'waiting', rules_version: rulesVersion })
    .select()
    .single()
  if (error) throw error
  const { error: pErr } = await supabase
    .from('ch_players')
    .insert({ session_id: session.id, user_id: hostId, display_name: displayName, seat: 0 })
  if (pErr) throw pErr
  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('ch_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function getSession(sessionId) {
  const { data } = await supabase.from('ch_sessions').select('*').eq('id', sessionId).maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('ch_players').select('*').eq('session_id', sessionId).order('seat')
  return data ?? []
}

// Takes the Black seat and starts the game.
export async function joinSession(sessionId, userId, displayName) {
  const existing = await getPlayers(sessionId)
  if (existing.some((p) => p.user_id === userId)) return
  if (existing.length >= 2) throw new Error('That game already has two players.')
  const { error } = await supabase
    .from('ch_players')
    .insert({ session_id: sessionId, user_id: userId, display_name: displayName, seat: 1 })
  if (error) throw new Error('Someone just took that seat.')
  await supabase.from('ch_sessions').update({ status: 'active' }).eq('id', sessionId).eq('status', 'waiting')
}

export async function insertMove({ sessionId, userId, seat, uci, moveNumber }) {
  const { error } = await supabase.from('ch_moves').insert({
    session_id: sessionId,
    user_id: userId,
    seat,
    uci,
    move_number: moveNumber,
  })
  return error
}

export async function finishSession(sessionId, winnerSeat) {
  await supabase
    .from('ch_sessions')
    .update({ status: 'finished', winner_seat: winnerSeat })
    .eq('id', sessionId)
    .neq('status', 'finished')
}

// Points a finished game at its rematch so the other player gets a "join
// the rematch" button. Returns false when they beat us to it.
export async function linkRematch(oldSessionId, newSessionId) {
  const { data, error } = await supabase
    .from('ch_sessions')
    .update({ rematch_id: newSessionId })
    .eq('id', oldSessionId)
    .is('rematch_id', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
