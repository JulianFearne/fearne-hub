// src/pages/games/go-fish/GoFishOnline.jsx
// Two-to-four player online Go Fish. Every ask is a single row insert; the
// hand/pond/turn/book state is all DERIVED from those rows plus the deck
// seed (see engine.deriveState) — the database never stores a hand or a
// score, matching the Connect Four / AnimalPlaceThing design.
//
// User identity comes from useAuth(); all Supabase access goes through
// goFishData.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { deriveState } from './engine'
import {
  createSession,
  finalizeSession,
  fetchSessionSnapshot,
  getOpenSessionByCode,
  insertAskEvent,
  joinSession,
  startSession,
  subscribeToSession,
  unsubscribeFromSession,
} from './goFishData'
import GoFishTable from './GoFishTable'
import './go-fish.css'

const RULES_VERSION = 1

export default function GoFishOnline() {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem('gf-nickname') || user?.email?.split('@')[0] || ''
    } catch {
      return user?.email?.split('@')[0] || ''
    }
  })

  function handleNicknameChange(value) {
    setNickname(value)
    try {
      localStorage.setItem('gf-nickname', value)
    } catch {
      /* storage unavailable — nickname still works this session */
    }
  }

  const [view, setView] = useState('menu') // 'menu' | 'lobby' | 'game'
  const [codeInput, setCodeInput] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [events, setEvents] = useState([])
  const [selectedRank, setSelectedRank] = useState(null)

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)

  const fetchAll = useCallback(async (sessionId) => {
    const { session: s, players: p, events: e } = await fetchSessionSnapshot(sessionId)
    if (s) setSession(s)
    setPlayers(p)
    setEvents(e)
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
      setView('lobby')
    },
    [fetchAll, subscribe]
  )

  const createGame = useCallback(async () => {
    if (!userId || !nickname.trim()) {
      setError('Enter your name first.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const s = await createSession(userId, nickname.trim(), RULES_VERSION)
      await enterSession(s.id)
    } catch (e) {
      setError(e.message || 'Could not create the game.')
    } finally {
      setBusy(false)
    }
  }, [userId, nickname, enterSession])

  const joinGame = useCallback(async () => {
    if (!userId || !nickname.trim()) {
      setError('Enter your name first.')
      return
    }
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
      await joinSession(s.id, userId, nickname.trim())
      await enterSession(s.id)
    } catch (e) {
      setError(e.message || 'Could not join the game.')
    } finally {
      setBusy(false)
    }
  }, [userId, nickname, codeInput, enterSession])

  const startGame = useCallback(async () => {
    if (!sessionIdRef.current) return
    await startSession(sessionIdRef.current)
    await fetchAll(sessionIdRef.current)
  }, [fetchAll])

  const leave = useCallback(() => {
    if (channelRef.current) unsubscribeFromSession(channelRef.current)
    channelRef.current = null
    sessionIdRef.current = null
    setSession(null)
    setPlayers([])
    setEvents([])
    setSelectedRank(null)
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  // --- derived game state ---
  const derived = useMemo(() => {
    if (!session || players.length === 0) return null
    return deriveState(players, session.deck_seed, events)
  }, [session, players, events])

  const myTurn = derived?.currentTurnUserId === userId
  const versionMismatch =
    session && session.rules_version != null && session.rules_version !== RULES_VERSION

  // Once the derived state says the game is over, flip the session to
  // finished. Whichever connected client notices first wins the race; the
  // `.eq('status','active')` guard in finalizeSession makes it a no-op for
  // everyone else.
  useEffect(() => {
    if (derived?.isOver && session?.status === 'active') {
      finalizeSession(session.id)
    }
  }, [derived?.isOver, session])

  const ask = useCallback(
    async (targetId) => {
      if (!myTurn || selectedRank == null) return
      const nextEventNumber = events.reduce((m, e) => Math.max(m, e.event_number), 0) + 1
      const err = await insertAskEvent({
        sessionId: sessionIdRef.current,
        userId,
        targetId,
        rank: selectedRank,
        eventNumber: nextEventNumber,
      })
      setSelectedRank(null)
      if (err) {
        await fetchAll(sessionIdRef.current)
        return
      }
      if (navigator.vibrate) navigator.vibrate(15)
      await fetchAll(sessionIdRef.current)
    },
    [myTurn, selectedRank, events, userId, fetchAll]
  )

  // --- render: menu ---
  if (view === 'menu') {
    return (
      <div className="go-fish">
        <div className="gf2-panel">
          <label className="gf2-field">
            <span>Your name</span>
            <input
              className="gf2-input"
              value={nickname}
              maxLength={24}
              onChange={(e) => handleNicknameChange(e.target.value)}
            />
          </label>
          <button className="gf2-btn primary" disabled={busy} onClick={createGame}>
            Start a new game
          </button>
          <div className="gf2-divider">or join with a code</div>
          <div className="gf2-join-row">
            <input
              className="gf2-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button className="gf2-btn" disabled={busy} onClick={joinGame}>
              Join
            </button>
          </div>
          {error && <div className="gf2-error">{error}</div>}
        </div>
      </div>
    )
  }

  if (versionMismatch) {
    return (
      <div className="go-fish">
        <div className="gf2-panel">
          <p className="gf2-waiting-title">This game was made on a newer version of Go Fish.</p>
          <p className="gf2-hint">Refresh the page, then rejoin.</p>
          <button className="gf2-btn ghost" onClick={leave}>
            Back
          </button>
        </div>
      </div>
    )
  }

  // --- render: lobby ---
  if (session?.status === 'waiting') {
    const isHost = session.host_id === userId
    return (
      <div className="go-fish">
        <div className="gf2-panel">
          <p className="gf2-waiting-title">Waiting for players…</p>
          <div className="gf2-code-display">
            <span className="gf2-code-label">Share this code</span>
            <span className="gf2-code-value">{session.code}</span>
          </div>
          <div className="gf2-players">
            {players.map((p) => (
              <div key={p.user_id} className="gf2-player-chip">
                <span className="gf2-dot" />
                {p.display_name}
                {p.user_id === userId ? ' (you)' : ''}
                {p.user_id === session.host_id ? ' · host' : ''}
              </div>
            ))}
          </div>
          {isHost ? (
            <button className="gf2-btn primary" onClick={startGame} disabled={players.length < 2}>
              {players.length < 2 ? 'Waiting for at least 2 players…' : 'Start game →'}
            </button>
          ) : (
            <p className="gf2-hint">Waiting for the host to start…</p>
          )}
          <button className="gf2-btn ghost" onClick={leave}>
            Leave
          </button>
        </div>
      </div>
    )
  }

  // --- render: game / finished ---
  if (!derived) return null
  // A game stamped finished is over even if this client's replay disagrees.
  const shown = session.status === 'finished' ? { ...derived, isOver: true } : derived

  return (
    <div className="go-fish">
      <div className="gf2-panel">
        <GoFishTable
          players={players}
          meId={userId}
          derived={shown}
          selectedRank={selectedRank}
          onSelectRank={setSelectedRank}
          onAsk={ask}
          onPlayAgain={createGame}
          onLeave={leave}
        />
      </div>
    </div>
  )
}
