// src/pages/games/wobbly-towers/wtData.js
// Every Supabase call for online Wobbly Towers races lives here. Schema and
// RLS: _reference/wobbly-towers-schema.sql.
//
// Unlike the turn-based games, the towers themselves never touch the
// database: each player's physics runs on their own device. The tables only
// hold the lobby, the settings, who's been knocked out and the result. The
// live bits (everyone's height a few times a second, and attacks) go over a
// Supabase Realtime broadcast channel, which is fast and stores nothing.

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
  return `${window.location.origin}/games/wobbly-towers?code=${code}`
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }] = await Promise.all([
    supabase.from('wt_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('wt_players').select('*').eq('session_id', sessionId).order('seat'),
  ])
  return { session: session ?? null, players: players ?? [] }
}

// Table changes (lobby, knock-outs, the result) plus the live broadcast.
// handlers: { onChange(), onStatus(payload), onAttack(payload) }.
export function subscribeToRace(sessionId, { onChange, onStatus, onAttack }) {
  return supabase
    .channel(`wt-${sessionId}`, { config: { broadcast: { self: false } } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wt_sessions', filter: `id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'wt_players', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('broadcast', { event: 'status' }, ({ payload }) => onStatus(payload))
    .on('broadcast', { event: 'attack' }, ({ payload }) => onAttack(payload))
    .subscribe()
}

export function unsubscribeFromRace(channel) {
  supabase.removeChannel(channel)
}

export function broadcast(channel, event, payload) {
  channel?.send({ type: 'broadcast', event, payload })
}

export async function createSession(hostId, displayName, rulesVersion) {
  const { data: session, error } = await supabase
    .from('wt_sessions')
    .insert({
      host_id: hostId,
      code: makeCode(),
      status: 'waiting',
      mode: 'powerups',
      goal: 25,
      seed: Math.floor(Math.random() * 2 ** 31),
      rules_version: rulesVersion,
    })
    .select()
    .single()
  if (error) throw error
  const { error: pErr } = await supabase
    .from('wt_players')
    .insert({ session_id: session.id, user_id: hostId, display_name: displayName, seat: 0 })
  if (pErr) throw pErr
  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('wt_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

export async function getSession(sessionId) {
  const { data } = await supabase.from('wt_sessions').select('*').eq('id', sessionId).maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('wt_players').select('*').eq('session_id', sessionId).order('seat')
  return data ?? []
}

export async function joinSession(sessionId, userId, displayName) {
  const existing = await getPlayers(sessionId)
  if (existing.some((p) => p.user_id === userId)) return
  if (existing.length >= MAX_PLAYERS) throw new Error('That race is already full.')
  const { error } = await supabase
    .from('wt_players')
    .insert({ session_id: sessionId, user_id: userId, display_name: displayName, seat: existing.length })
  if (error) throw new Error('Someone just took that spot. Try again.')
}

export async function updateSettings(sessionId, patch) {
  await supabase.from('wt_sessions').update(patch).eq('id', sessionId).eq('status', 'waiting')
}

export async function startSession(sessionId, numPlayers) {
  await supabase
    .from('wt_sessions')
    .update({ status: 'active', num_players: numPlayers })
    .eq('id', sessionId)
    .eq('status', 'waiting')
}

// This player has lost all their lives.
export async function knockOut(sessionId, userId, best) {
  await supabase.from('wt_players').update({ out: true, best }).eq('session_id', sessionId).eq('user_id', userId)
}

export async function finishSession(sessionId, winnerSeat) {
  await supabase
    .from('wt_sessions')
    .update({ status: 'finished', winner_seat: winnerSeat })
    .eq('id', sessionId)
    .neq('status', 'finished')
}

// Points a finished race at its rematch. Returns false if someone else got
// there first.
export async function linkRematch(oldSessionId, newSessionId) {
  const { data, error } = await supabase
    .from('wt_sessions')
    .update({ rematch_id: newSessionId })
    .eq('id', oldSessionId)
    .is('rematch_id', null)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
