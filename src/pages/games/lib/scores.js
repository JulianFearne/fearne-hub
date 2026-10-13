// src/pages/games/lib/scores.js
// Family high scores. Every finished game that has a board in
// scoreBoards.js saves one row to game_scores (schema:
// _reference/game-scores-schema.sql). The boards show each person's best,
// so one keen player can't fill the whole table.
//
// The offline games still work with no signal: a score that can't be saved
// is kept in a queue on the device and sent the next time any board loads.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../supabaseClient'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { beats, boardInfo } from './scoreBoards'

const QUEUE_KEY = 'fh-score-queue'
const TABLE_SIZE = 10

function readQueue() {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY))
    return Array.isArray(q) ? q : []
  } catch {
    return []
  }
}

function writeQueue(q) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
    else localStorage.removeItem(QUEUE_KEY)
  } catch {
    // Storage blocked: an offline score is lost, nothing else breaks.
  }
}

async function insertRow(row) {
  const { error } = await supabase.from('game_scores').insert(row)
  return !error
}

// Sends any scores saved while offline. Safe to call often.
let flushing = null
export function flushQueue() {
  if (flushing) return flushing
  flushing = (async () => {
    const queue = readQueue()
    if (!queue.length) return
    const left = []
    for (const row of queue) {
      if (!(await insertRow(row))) left.push(row)
    }
    // Anything queued while this ran goes on the end.
    const added = readQueue().slice(queue.length)
    writeQueue([...left, ...added])
  })().finally(() => {
    flushing = null
  })
  return flushing
}

export async function saveScore({ userId, name, game, board, score }) {
  const row = { user_id: userId, display_name: name, game, board, score: Math.round(score) }
  if (await insertRow(row)) return { saved: true }
  writeQueue([...readQueue(), { ...row, created_at: new Date().toISOString() }])
  return { saved: false }
}

// Best score per person on one board, best first.
export async function fetchBoard(game, board) {
  const info = boardInfo(game, board)
  const { data, error } = await supabase
    .from('game_scores')
    .select('user_id, display_name, score, created_at')
    .eq('game', game)
    .eq('board', board)
    .order('score', { ascending: info.order === 'low' })
    .order('created_at', { ascending: true })
    .limit(300)
  if (error) throw error
  const seen = new Set()
  const people = []
  for (const row of data ?? []) {
    if (seen.has(row.user_id)) continue
    seen.add(row.user_id)
    people.push(row)
  }
  return people
}

// Everything a game needs for one board:
//   rows      each person's best, best first (top 10)
//   myBest    the signed-in person's best score, or null
//   myRank    their place among everyone (1-based), or null
//   status    'loading' | 'ready' | 'offline'
//   submit(score) saves a finished game and reloads the board. Resolves
//             to { best: true if it beat their old best, rank, saved }.
export function useHighScores(game, board) {
  const { user, profile } = useAuth()
  const userId = user?.id ?? null
  const [people, setPeople] = useState([])
  const [status, setStatus] = useState('loading')

  const load = useCallback(async () => {
    try {
      await flushQueue()
      const rows = await fetchBoard(game, board)
      setPeople(rows)
      setStatus('ready')
      return rows
    } catch {
      setStatus('offline')
      return null
    }
  }, [game, board])

  useEffect(() => {
    setStatus('loading')
    setPeople([])
    load()
  }, [load])

  const myIndex = people.findIndex((p) => p.user_id === userId)
  const myBest = myIndex >= 0 ? people[myIndex].score : null

  const submit = useCallback(
    async (score) => {
      if (!userId || !(score >= 0)) return { best: false, rank: null, saved: false }
      const info = boardInfo(game, board)
      const before = people.find((p) => p.user_id === userId)?.score ?? null
      const best = before == null || beats(info, score, before)
      const { saved } = await saveScore({ userId, name: displayName(profile, user?.email), game, board, score })
      const rows = await load()
      const idx = rows ? rows.findIndex((p) => p.user_id === userId) : -1
      return { best, rank: idx >= 0 ? idx + 1 : null, saved }
    },
    [userId, profile, user?.email, game, board, people, load],
  )

  return {
    game,
    board,
    rows: people.slice(0, TABLE_SIZE),
    myBest,
    myRank: myIndex >= 0 ? myIndex + 1 : null,
    userId,
    status,
    submit,
    reload: load,
  }
}
