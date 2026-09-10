// src/pages/games/connect-four/ConnectFourMultiplayer.jsx
// Two-player online Connect Four. Turn-based, so every move is a single row
// insert that both clients read. The board and winner are DERIVED from the move
// rows (see engine.deriveState) — the database never stores the grid or a score,
// matching the AnimalPlaceThing design.
//
// User identity comes from useAuth(), like every other page in the hub —
// this component takes no props. All Supabase access goes through
// connectFourData.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { deriveState, isValidMove, SEAT_1, SEAT_2 } from './engine'
import {
  createSession,
  fetchSessionSnapshot,
  finalizeSession,
  getOpenSessionByCode,
  getPlayers,
  insertMove,
  joinSessionAsSeat2,
  subscribeToSession,
  unsubscribeFromSession,
} from './connectFourData'
import Board from './Board'
import './connect-four.css'

const RULES_VERSION = 1

export default function ConnectFourMultiplayer() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [view, setView] = useState('menu') // 'menu' | 'game'
  const [codeInput, setCodeInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [moves, setMoves] = useState([])

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)

  // --- data + realtime ---
  const fetchAll = useCallback(async (sessionId) => {
    const { session: s, players: p, moves: m } = await fetchSessionSnapshot(sessionId)
    if (s) setSession(s)
    setPlayers(p)
    setMoves(m)
  }, [])

  const subscribe = useCallback(
    (sessionId) => {
      if (channelRef.current) unsubscribeFromSession(channelRef.current)
      channelRef.current = subscribeToSession(sessionId, () => fetchAll(sessionId))
    },
    [fetchAll]
  )

  useEffect(
    () => () => {
      if (channelRef.current) unsubscribeFromSession(channelRef.current)
    },
    []
  )

  const enterSession = useCallback(
    async (sessionId) => {
      sessionIdRef.current = sessionId
      await fetchAll(sessionId)
      subscribe(sessionId)
      setView('game')
    },
    [fetchAll, subscribe]
  )

  // --- lobby actions ---
  const createGame = useCallback(async () => {
    if (!userId) return
    setBusy(true)
    setError('')
    try {
      const s = await createSession(userId, RULES_VERSION)
      await enterSession(s.id)
    } catch (e) {
      setError(e.message || 'Could not create the game.')
    } finally {
      setBusy(false)
    }
  }, [userId, enterSession])

  const joinGame = useCallback(async () => {
    if (!userId) return
    const code = codeInput.trim().toUpperCase()
    if (code.length !== 4) {
      setError('Enter the 4-character game code.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const s = await getOpenSessionByCode(code)
      if (!s) throw new Error('No open game with that code.')

      // Am I already in it (e.g. I am the host on another tab)?
      const existing = await getPlayers(s.id)
      const mine = existing.find((p) => p.user_id === userId)
      if (!mine) {
        if (existing.length >= 2) throw new Error('That game is already full.')
        try {
          await joinSessionAsSeat2(s.id, userId)
        } catch {
          throw new Error('Someone just took the last seat.')
        }
      }
      await enterSession(s.id)
    } catch (e) {
      setError(e.message || 'Could not join the game.')
    } finally {
      setBusy(false)
    }
  }, [userId, codeInput, enterSession])

  const leave = useCallback(() => {
    if (channelRef.current) unsubscribeFromSession(channelRef.current)
    channelRef.current = null
    sessionIdRef.current = null
    setSession(null)
    setPlayers([])
    setMoves([])
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  // --- derived game state ---
  const derived = useMemo(() => deriveState(moves), [moves])
  const mySeat = useMemo(
    () => players.find((p) => p.user_id === userId)?.seat ?? null,
    [players, userId]
  )
  const status = session?.status
  const finished = status === 'finished' || derived.winner || derived.isDraw
  const myTurn = status === 'active' && !finished && derived.nextSeat === mySeat

  const play = useCallback(
    async (col) => {
      if (!myTurn || !isValidMove(derived.board, col)) return
      const moveNumber = derived.moveCount + 1
      const mErr = await insertMove({
        sessionId: sessionIdRef.current,
        userId,
        seat: mySeat,
        col,
        moveNumber,
      })
      if (mErr) {
        // Almost always a lost race on move_number; just resync.
        await fetchAll(sessionIdRef.current)
        return
      }
      if (navigator.vibrate) navigator.vibrate(15)
      // Work out locally whether that move ended the game and, if so, stamp the
      // result. Only the player who made the winning move reaches this.
      const after = deriveState([...moves, { column: col, seat: mySeat, move_number: moveNumber }])
      if (after.winner) await finalizeSession(sessionIdRef.current, after.winner)
      else if (after.isDraw) await finalizeSession(sessionIdRef.current, null)
      await fetchAll(sessionIdRef.current)
    },
    [myTurn, derived, moves, userId, mySeat, fetchAll]
  )

  // Version check the hub way: a session made on a newer rules version could
  // derive state differently on this device's bundle.
  const versionMismatch =
    session && session.rules_version != null && session.rules_version !== RULES_VERSION

  // --- render: menu ---
  if (view === 'menu') {
    return (
      <div className="connect-four">
        <div className="c4-panel">
          <div className="c4-lobby">
            <button className="c4-btn primary" disabled={busy} onClick={createGame}>
              Start a new game
            </button>
            <div className="c4-lobby-divider">or join with a code</div>
            <div className="c4-join-row">
              <input
                className="c4-code-input"
                value={codeInput}
                maxLength={4}
                placeholder="CODE"
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinGame()}
              />
              <button className="c4-btn" disabled={busy} onClick={joinGame}>
                Join
              </button>
            </div>
            {error && <div className="c4-error">{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  if (versionMismatch) {
    return (
      <div className="connect-four">
        <div className="c4-panel">
          <div className="c4-waiting">
            <p className="c4-waiting-title">
              This game was made on a newer version of Connect Four.
            </p>
            <p className="c4-hint">Refresh the page, then rejoin.</p>
            <button className="c4-btn ghost" onClick={leave}>
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- render: waiting for opponent ---
  if (status === 'waiting') {
    return (
      <div className="connect-four">
        <div className="c4-panel">
          <div className="c4-waiting">
            <p className="c4-waiting-title">Waiting for a player to join…</p>
            <div className="c4-code-display">
              <span className="c4-code-label">Share this code</span>
              <span className="c4-code-value">{session?.code}</span>
            </div>
            <button className="c4-btn ghost" onClick={leave}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- render: game ---
  let banner
  if (derived.winner) {
    banner = derived.winner === mySeat ? 'You win! 🎉' : 'You lost'
  } else if (derived.isDraw) {
    banner = "It's a draw"
  } else if (myTurn) {
    banner = 'Your turn'
  } else {
    banner = "Opponent's turn"
  }

  return (
    <div className="connect-four">
      <div className="c4-panel">
        <div className="c4-seat-line">
          You are <span className={`c4-dot ${mySeat === SEAT_1 ? 'p1' : 'p2'}`} />
          {mySeat === SEAT_1 ? ' Red' : ' Gold'}
        </div>

        <div className={`c4-status ${finished ? 'is-over' : ''}`}>{banner}</div>

        <Board
          board={derived.board}
          winningLine={derived.winningLine}
          onColumnClick={play}
          disabled={!myTurn}
        />

        <div className="c4-actions">
          {finished ? (
            <button className="c4-btn primary" onClick={createGame}>
              Play again
            </button>
          ) : null}
          <button className="c4-btn ghost" onClick={leave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
