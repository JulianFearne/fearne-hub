// src/pages/games/ludo/LudoOnline.jsx
// Online Ludo for 2-4 players, each on their own device. Same shape as
// online Go Fish: the host shares a code or invite link
// (/games/ludo?code=ABCD), players join, the host starts. Every roll and
// every token move is one row in ludo_events; the board is DERIVED by
// replaying them (engine.deriveOnline), never stored. The current game is
// remembered on the device so a reload puts you back in it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { applyMove, applyRoll, colorsFor, deriveOnline, rollDice } from './engine'
import {
  MAX_PLAYERS,
  createSession,
  fetchSessionSnapshot,
  finishSession,
  getOpenSessionByCode,
  getPlayers,
  getSession,
  insertEvent,
  inviteUrl,
  joinSession,
  startSession,
  subscribeToSession,
  unsubscribeFromSession,
} from './ludoData'
import LudoTable from './LudoTable'
import { COLOR_KEYS } from './LudoBoard'

const RULES_VERSION = 1
const STORAGE_KEY = 'ludo-online-session'

function rememberSession(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable, resume just won't work on this device */
  }
}

export function storedSessionId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export default function LudoOnline({ initialCode = '', onCodeUsed }) {
  const { user, profile } = useAuth()
  const userId = user?.id ?? null
  const myName = displayName(profile, user?.email)

  const [view, setView] = useState('menu') // 'menu' | 'game'
  const [codeInput, setCodeInput] = useState(initialCode.toUpperCase())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [events, setEvents] = useState([])

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)
  const sendingRef = useRef(false)

  const fetchAll = useCallback(async (sessionId) => {
    const snap = await fetchSessionSnapshot(sessionId)
    if (sessionIdRef.current !== sessionId) return
    if (snap.session) setSession(snap.session)
    setPlayers(snap.players)
    setEvents(snap.events)
  }, [])

  useEffect(
    () => () => {
      if (channelRef.current) unsubscribeFromSession(channelRef.current)
    },
    [],
  )

  const enterSession = useCallback(
    async (sessionId) => {
      sessionIdRef.current = sessionId
      rememberSession(sessionId)
      setSession(null)
      setPlayers([])
      setEvents([])
      await fetchAll(sessionId)
      if (channelRef.current) unsubscribeFromSession(channelRef.current)
      channelRef.current = subscribeToSession(sessionId, () => fetchAll(sessionId))
      setView('game')
    },
    [fetchAll],
  )

  const createGame = useCallback(async () => {
    if (!userId) return
    setBusy(true)
    setError('')
    try {
      const s = await createSession(userId, myName, RULES_VERSION)
      await enterSession(s.id)
    } catch (e) {
      setError(e.message || 'Could not create the game.')
    } finally {
      setBusy(false)
    }
  }, [userId, myName, enterSession])

  const joinGame = useCallback(
    async (rawCode) => {
      if (!userId) return
      const code = (rawCode ?? codeInput).trim().toUpperCase()
      if (code.length !== 4) {
        setError('Enter the 4-character game code.')
        return
      }
      setBusy(true)
      setError('')
      try {
        const s = await getOpenSessionByCode(code)
        if (!s) throw new Error('No open game with that code. It may have already started.')
        await joinSession(s.id, userId, myName)
        await enterSession(s.id)
      } catch (e) {
        setError(e.message || 'Could not join the game.')
      } finally {
        setBusy(false)
      }
    },
    [userId, myName, codeInput, enterSession],
  )

  // Invite link: join straight away. Otherwise pick up a game this device
  // was already in.
  const startedRef = useRef(false)
  useEffect(() => {
    if (!userId || startedRef.current) return
    startedRef.current = true
    if (initialCode) {
      onCodeUsed?.()
      joinGame(initialCode)
      return
    }
    const stored = storedSessionId()
    if (!stored) return
    ;(async () => {
      const s = await getSession(stored)
      const mine = s && s.status !== 'finished' && (await getPlayers(s.id)).some((p) => p.user_id === userId)
      if (mine) await enterSession(s.id)
      else rememberSession(null)
    })()
  }, [userId, initialCode, onCodeUsed, joinGame, enterSession])

  const leave = useCallback(() => {
    if (channelRef.current) unsubscribeFromSession(channelRef.current)
    channelRef.current = null
    sessionIdRef.current = null
    rememberSession(null)
    setSession(null)
    setPlayers([])
    setEvents([])
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  async function shareInvite() {
    const url = inviteUrl(session.code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Ludo', text: `Join my Ludo game, code ${session.code}`, url })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      /* clipboard unavailable, the code is still on screen */
    }
  }

  // ---------- derived ----------

  const numPlayers = session?.num_players ?? players.length
  const state = useMemo(
    () => (session?.status === 'waiting' || numPlayers < 2 ? null : deriveOnline(numPlayers, events)),
    [session?.status, numPlayers, events],
  )
  const mySeat = players.find((p) => p.user_id === userId)?.seat ?? null
  const names = useMemo(
    () => Array.from({ length: numPlayers }, (_, i) => (i === mySeat ? 'You' : players.find((p) => p.seat === i)?.display_name || 'Player')),
    [numPlayers, players, mySeat],
  )

  // Stamp the result once the replay shows a winner (whoever notices first).
  useEffect(() => {
    if (state?.winner != null && session?.status === 'active') finishSession(session.id, state.winner)
  }, [state?.winner, session])

  async function send(type, value, nextState) {
    if (sendingRef.current) return
    sendingRef.current = true
    const sessionId = sessionIdRef.current
    const eventNumber = events.reduce((m, e) => Math.max(m, e.event_number), 0) + 1
    const row = { session_id: sessionId, seat: mySeat, type, value, event_number: eventNumber }
    // Show it straight away; the realtime refetch confirms it.
    setEvents((prev) => [...prev, row])
    try {
      const err = await insertEvent({ sessionId, userId, seat: mySeat, type, value, eventNumber })
      if (err) await fetchAll(sessionId)
      else if (nextState.winner != null) await finishSession(sessionId, nextState.winner)
    } finally {
      sendingRef.current = false
    }
  }

  function roll() {
    if (!state || state.turn !== mySeat || state.roll != null) return
    const value = rollDice()
    send('roll', value, applyRoll(state, value))
    if (navigator.vibrate) navigator.vibrate(15)
  }

  function pick(token) {
    if (!state || state.turn !== mySeat || state.roll == null) return
    const next = applyMove(state, token)
    if (next === state) return
    send('move', token, next)
  }

  async function endGame() {
    if (!window.confirm('End this game for everyone?')) return
    await finishSession(sessionIdRef.current, null)
    await fetchAll(sessionIdRef.current)
  }

  // ---------- render ----------

  if (view === 'menu') {
    return (
      <div className="ludo-panel">
        <div className="ludo-lobby">
          <p className="ludo-hint">
            Playing as <strong>{myName}</strong>
          </p>
          <button className="ludo-btn primary" disabled={busy} onClick={createGame}>
            Start a new game
          </button>
          <div className="ludo-lobby-divider">or join with a code</div>
          <div className="ludo-join-row">
            <input
              className="ludo-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              aria-label="Game code"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button className="ludo-btn" disabled={busy} onClick={() => joinGame()}>
              Join
            </button>
          </div>
          {busy && <p className="ludo-hint">Connecting…</p>}
          {error && <div className="ludo-error">{error}</div>}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="ludo-panel">
        <p className="ludo-hint">Loading game…</p>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="ludo-panel">
        <p className="ludo-hint">This game was made on a newer version of Ludo. Refresh the page, then rejoin.</p>
        <button className="ludo-btn" onClick={leave}>
          Back
        </button>
      </div>
    )
  }

  if (session.status === 'waiting') {
    const isHost = session.host_id === userId
    const colors = colorsFor(Math.max(2, players.length))
    return (
      <div className="ludo-panel">
        <div className="ludo-lobby">
          <span className="ludo-code-label">Share this code</span>
          <span className="ludo-code-value">{session.code}</span>
          <button className="ludo-btn primary" onClick={shareInvite}>
            {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
          </button>
          <div className="ludo-lobby-players">
            {players.map((p, i) => (
              <span key={p.user_id} className="ludo-player-chip">
                <span className={`ludo-dot ludo-bg-${COLOR_KEYS[colors[i] ?? i]}`} />
                {p.display_name}
                {p.user_id === userId ? ' (you)' : ''}
                {p.user_id === session.host_id ? ' · host' : ''}
              </span>
            ))}
          </div>
          <p className="ludo-hint">
            {players.length}/{MAX_PLAYERS} players
          </p>
          {isHost ? (
            <button className="ludo-btn primary" onClick={() => startSession(session.id, players.length)} disabled={players.length < 2}>
              {players.length < 2 ? 'Waiting for at least 2 players…' : `Start with ${players.length} players`}
            </button>
          ) : (
            <p className="ludo-hint">Waiting for the host to start…</p>
          )}
          <button
            className="ludo-btn ghost"
            onClick={async () => {
              if (isHost) await finishSession(session.id, null)
              leave()
            }}
          >
            {isHost ? 'Cancel game' : 'Leave'}
          </button>
        </div>
      </div>
    )
  }

  if (!state) return null
  const finished = session.status === 'finished' || state.winner != null
  const endedEarly = session.status === 'finished' && state.winner == null

  return (
    <div className="ludo-panel">
      {endedEarly && <p className="ludo-status is-over">This game was ended early.</p>}
      <LudoTable
        state={state}
        names={names}
        canAct={!finished && state.turn === mySeat}
        onRoll={roll}
        onPick={pick}
        actions={
          finished ? (
            <>
              <button className="ludo-btn primary" onClick={createGame}>
                New game
              </button>
              <button className="ludo-btn ghost" onClick={leave}>
                Leave
              </button>
            </>
          ) : (
            <>
              <button className="ludo-btn ghost" onClick={leave}>
                Leave
              </button>
              <button className="ludo-btn ghost" onClick={endGame}>
                End game
              </button>
            </>
          )
        }
      />
    </div>
  )
}
