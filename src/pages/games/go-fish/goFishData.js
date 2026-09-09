// src/pages/games/go-fish/goFishData.js
// Every Supabase call for online Go Fish lives here, matching the
// animalPlaceThingData.js / connectFourData.js pattern — components import
// this module rather than the Supabase client directly.

import { supabase } from '../../../supabaseClient'

const MAX_PLAYERS = 4

export function makeCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += letters[Math.floor(Math.random() * letters.length)]
  }
  return s
}

// 32-bit unsigned-friendly seed — mulberry32 only cares about the low bits.
function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31)
}

export async function fetchSessionSnapshot(sessionId) {
  const [{ data: session }, { data: players }, { data: events }] = await Promise.all([
    supabase.from('gf_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('gf_players').select('*').eq('session_id', sessionId).order('seat'),
    supabase.from('gf_events').select('*').eq('session_id', sessionId).order('event_number'),
  ])
  return {
    session: session ?? null,
    players: players ?? [],
    events: (events ?? []).map((r) => ({
      type: r.type,
      actor_id: r.user_id,
      target_id: r.target_id,
      rank: r.rank,
      event_number: r.event_number,
    })),
  }
}

export function subscribeToSession(sessionId, onChange) {
  return supabase
    .channel(`gf-${sessionId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'gf_events', filter: `session_id=eq.${sessionId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'gf_sessions', filter: `id=eq.${sessionId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'gf_players', filter: `session_id=eq.${sessionId}` },
      onChange
    )
    .subscribe()
}

export function unsubscribeFromSession(channel) {
  supabase.removeChannel(channel)
}

export async function createSession(hostId, displayName, rulesVersion) {
  const code = makeCode()
  const { data: session, error } = await supabase
    .from('gf_sessions')
    .insert({ host_id: hostId, code, status: 'waiting', deck_seed: randomSeed(), rules_version: rulesVersion })
    .select()
    .single()
  if (error) throw error

  const { error: pErr } = await supabase
    .from('gf_players')
    .insert({ session_id: session.id, user_id: hostId, display_name: displayName, seat: 0 })
  if (pErr) throw pErr

  return session
}

export async function getOpenSessionByCode(code) {
  const { data } = await supabase
    .from('gf_sessions')
    .select('*')
    .eq('code', code)
    .eq('status', 'waiting')
    .maybeSingle()
  return data ?? null
}

export async function getPlayers(sessionId) {
  const { data } = await supabase.from('gf_players').select('*').eq('session_id', sessionId).order('seat')
  return data ?? []
}

export async function joinSession(sessionId, userId, displayName) {
  const existing = await getPlayers(sessionId)
  if (existing.some((p) => p.user_id === userId)) return
  if (existing.length >= MAX_PLAYERS) throw new Error('That game is already full.')
  const { error } = await supabase
    .from('gf_players')
    .insert({ session_id: sessionId, user_id: userId, display_name: displayName, seat: existing.length })
  if (error) throw new Error('Someone just took the last seat.')
}

export async function startSession(sessionId) {
  await supabase.from('gf_sessions').update({ status: 'active' }).eq('id', sessionId).eq('status', 'waiting')
}

export async function insertAskEvent({ sessionId, userId, targetId, rank, eventNumber }) {
  const { error } = await supabase.from('gf_events').insert({
    session_id: sessionId,
    user_id: userId,
    type: 'ask',
    target_id: targetId,
    rank,
    event_number: eventNumber,
  })
  return error
}

export async function finalizeSession(sessionId) {
  await supabase.from('gf_sessions').update({ status: 'finished' }).eq('id', sessionId).eq('status', 'active')
}
