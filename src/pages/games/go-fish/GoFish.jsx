// src/pages/games/go-fish/GoFish.jsx
// Two-to-four player online Go Fish. Every ask is a single row insert; the
// hand/pond/turn/book state is all DERIVED from those rows plus the deck
// seed (see engine.deriveState) — the database never stores a hand or a
// score, matching the Connect Four / AnimalPlaceThing design.
//
// User identity comes from useAuth(); all Supabase access goes through
// goFishData.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext.jsx'
import { cardLabel, isRed, rankLabel } from '../lib/deck'
import { deriveState, ranksInHand } from './engine'
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
import './go-fish.css'

const RULES_VERSION = 1

export default function GoFish() {
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

  const myHand = derived?.hands[userId] || []
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

  const nameOf = useCallback(
    (uid) => players.find((p) => p.user_id === uid)?.display_name || 'Player',
    [players]
  )

  const lastLogEntry = derived?.log[derived.log.length - 1]

  // --- render: menu ---
  if (view === 'menu') {
    return (
      <div className="go-fish">
        <header className="gf2-header">
          <Link to="/games" className="gf2-back">
            ← Games
          </Link>
          <h1 className="gf2-title">Go Fish</h1>
        </header>
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
        <header className="gf2-header">
          <h1 className="gf2-title">Go Fish</h1>
        </header>
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
  const finished = derived.isOver || session.status === 'finished'
  const winners = finished
    ? players.filter((p) => derived.scores[p.user_id] === Math.max(...players.map((q) => derived.scores[q.user_id])))
    : []

  return (
    <div className="go-fish">
      <header className="gf2-header">
        <h1 className="gf2-title">Go Fish</h1>
      </header>
      <div className="gf2-panel">
        {finished ? (
          <div className="gf2-finished">
            <h2 className="gf2-finished-title">Game over!</h2>
            <p className="gf2-finished-sub">
              {winners.length > 1 ? "It's a tie between " : 'Winner: '}
              {winners.map((w) => w.display_name).join(' & ')}
            </p>
            <div className="gf2-scoreboard">
              {[...players]
                .sort((a, b) => derived.scores[b.user_id] - derived.scores[a.user_id])
                .map((p) => (
                  <div key={p.user_id} className="gf2-score-row">
                    <span>
                      {p.display_name}
                      {p.user_id === userId ? ' (you)' : ''}
                    </span>
                    <span className="gf2-score-pts">{derived.scores[p.user_id]} books</span>
                  </div>
                ))}
            </div>
            <div className="gf2-actions">
              <button className="gf2-btn primary" onClick={createGame}>
                Play again
              </button>
              <button className="gf2-btn ghost" onClick={leave}>
                Back to games
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`gf2-turn-banner ${myTurn ? 'is-mine' : ''}`}>
              {myTurn ? 'Your turn — pick a card, then who to ask' : `${nameOf(derived.currentTurnUserId)}'s turn`}
            </div>

            <div className="gf2-opponents">
              {players
                .filter((p) => p.user_id !== userId)
                .map((p) => (
                  <button
                    key={p.user_id}
                    className={`gf2-opponent ${derived.currentTurnUserId === p.user_id ? 'active-turn' : ''}`}
                    disabled={!myTurn || selectedRank == null}
                    onClick={() => ask(p.user_id)}
                  >
                    <span className="gf2-opponent-name">{p.display_name}</span>
                    <span className="gf2-opponent-count">{(derived.hands[p.user_id] || []).length} cards</span>
                    <span className="gf2-opponent-books">{(derived.books[p.user_id] || []).length} books</span>
                  </button>
                ))}
            </div>

            <div className="gf2-pond">Pond: {derived.pondCount} cards left</div>

            {lastLogEntry && (
              <div className="gf2-log">
                {nameOf(lastLogEntry.actorId)} asked {nameOf(lastLogEntry.targetId)} for {rankLabel(lastLogEntry.rank)}s —{' '}
                {lastLogEntry.outcome.type === 'hit'
                  ? `got ${lastLogEntry.outcome.count}!`
                  : lastLogEntry.outcome.drawn
                    ? 'Go Fish!'
                    : 'Go Fish (pond empty)'}
                {lastLogEntry.newBooks.length > 0 && ` · completed a book of ${lastLogEntry.newBooks.map(rankLabel).join(', ')}s!`}
              </div>
            )}

            <div className="gf2-my-books">
              My books: {(derived.books[userId] || []).map(rankLabel).join(', ') || '—'}
            </div>

            <div className="gf2-hand">
              {[...myHand]
                .sort((a, b) => a.rank - b.rank)
                .map((card) => (
                  <button
                    key={card.id}
                    className={`gf2-card ${isRed(card.suit) ? 'red' : 'black'} ${selectedRank === card.rank ? 'selected' : ''}`}
                    disabled={!myTurn}
                    onClick={() => setSelectedRank(selectedRank === card.rank ? null : card.rank)}
                  >
                    {cardLabel(card)}
                  </button>
                ))}
            </div>
            {myTurn && ranksInHand(myHand).length > 0 && (
              <p className="gf2-hint">
                {selectedRank ? `Asking for ${rankLabel(selectedRank)}s — tap a player above.` : 'Tap a card to choose what to ask for.'}
              </p>
            )}

            <button className="gf2-btn ghost" onClick={leave}>
              Leave
            </button>
          </>
        )}
      </div>
    </div>
  )
}
