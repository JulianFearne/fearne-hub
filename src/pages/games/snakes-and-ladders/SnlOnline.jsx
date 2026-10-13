// src/pages/games/snakes-and-ladders/SnlOnline.jsx
// Online Snakes and Ladders for 2-4 players, each on their own device. Same
// shape as online Ludo: the host shares a code or invite link
// (/games/snakes-and-ladders?code=ABCD), players join, the host starts.
// Every roll is one row in snl_rolls; the board is DERIVED by replaying
// them (engine.deriveOnline), never stored. The current game is remembered
// on the device so a reload puts you back in it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { applyRoll, deriveOnline, rollDice } from './engine'
import {
  MAX_PLAYERS,
  createSession,
  fetchSessionSnapshot,
  finishSession,
  getOpenSessionByCode,
  getPlayers,
  getSession,
  insertRoll,
  inviteUrl,
  joinSession,
  startSession,
  subscribeToSession,
  unsubscribeFromSession,
} from './snlData'
import SnlTable from './SnlTable'
import { PLAYER_KEYS } from './SnlBoard'

const RULES_VERSION = 1
const STORAGE_KEY = 'snl-online-session'

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

export default function SnlOnline({ initialCode = '', onCodeUsed }) {
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
  const [rolls, setRolls] = useState([])

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)
  const sendingRef = useRef(false)

  const fetchAll = useCallback(async (sessionId) => {
    const snap = await fetchSessionSnapshot(sessionId)
    if (sessionIdRef.current !== sessionId) return
    if (snap.session) setSession(snap.session)
    setPlayers(snap.players)
    setRolls(snap.rolls)
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
      setRolls([])
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
    setRolls([])
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  async function shareInvite() {
    const url = inviteUrl(session.code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Snakes and Ladders', text: `Join my Snakes and Ladders game, code ${session.code}`, url })
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
    () => (session?.status === 'waiting' || numPlayers < 2 ? null : deriveOnline(numPlayers, rolls)),
    [session?.status, numPlayers, rolls],
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

  async function roll() {
    if (!state || state.turn !== mySeat || state.winner != null || sendingRef.current) return
    sendingRef.current = true
    const sessionId = sessionIdRef.current
    const value = rollDice()
    const rollNumber = rolls.reduce((m, r) => Math.max(m, r.roll_number), 0) + 1
    // Show it straight away; the realtime refetch confirms it.
    setRolls((prev) => [...prev, { session_id: sessionId, seat: mySeat, value, roll_number: rollNumber }])
    if (navigator.vibrate) navigator.vibrate(15)
    try {
      const err = await insertRoll({ sessionId, userId, seat: mySeat, value, rollNumber })
      if (err) await fetchAll(sessionId)
      else if (applyRoll(state, value).winner != null) await finishSession(sessionId, mySeat)
    } finally {
      sendingRef.current = false
    }
  }

  async function endGame() {
    if (!window.confirm('End this game for everyone?')) return
    await finishSession(sessionIdRef.current, null)
    await fetchAll(sessionIdRef.current)
  }

  // ---------- render ----------

  if (view === 'menu') {
    return (
      <div className="snl-panel">
        <div className="snl-lobby">
          <p className="snl-hint">
            Playing as <strong>{myName}</strong>
          </p>
          <button className="snl-btn primary" disabled={busy} onClick={createGame}>
            Start a new game
          </button>
          <div className="snl-lobby-divider">or join with a code</div>
          <div className="snl-join-row">
            <input
              className="snl-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              aria-label="Game code"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button className="snl-btn" disabled={busy} onClick={() => joinGame()}>
              Join
            </button>
          </div>
          {busy && <p className="snl-hint">Connecting…</p>}
          {error && <div className="snl-error">{error}</div>}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="snl-panel">
        <p className="snl-hint">Loading game…</p>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="snl-panel">
        <p className="snl-hint">This game was made on a newer version of Snakes and Ladders. Refresh the page, then rejoin.</p>
        <button className="snl-btn" onClick={leave}>
          Back
        </button>
      </div>
    )
  }

  if (session.status === 'waiting') {
    const isHost = session.host_id === userId
    return (
      <div className="snl-panel">
        <div className="snl-lobby">
          <span className="snl-code-label">Share this code</span>
          <span className="snl-code-value">{session.code}</span>
          <button className="snl-btn primary" onClick={shareInvite}>
            {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
          </button>
          <div className="snl-lobby-players">
            {players.map((p, i) => (
              <span key={p.user_id} className="snl-player-chip">
                <span className={`snl-dot snl-bg-${PLAYER_KEYS[i]}`} />
                {p.display_name}
                {p.user_id === userId ? ' (you)' : ''}
                {p.user_id === session.host_id ? ' · host' : ''}
              </span>
            ))}
          </div>
          <p className="snl-hint">
            {players.length}/{MAX_PLAYERS} players
          </p>
          {isHost ? (
            <button className="snl-btn primary" onClick={() => startSession(session.id, players.length)} disabled={players.length < 2}>
              {players.length < 2 ? 'Waiting for at least 2 players…' : `Start with ${players.length} players`}
            </button>
          ) : (
            <p className="snl-hint">Waiting for the host to start…</p>
          )}
          <button
            className="snl-btn ghost"
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
    <div className="snl-panel">
      {endedEarly && <p className="snl-status is-over">This game was ended early.</p>}
      <SnlTable
        state={state}
        names={names}
        canRoll={!finished && state.turn === mySeat}
        onRoll={roll}
        actions={
          finished ? (
            <>
              <button className="snl-btn primary" onClick={createGame}>
                New game
              </button>
              <button className="snl-btn ghost" onClick={leave}>
                Leave
              </button>
            </>
          ) : (
            <>
              <button className="snl-btn ghost" onClick={leave}>
                Leave
              </button>
              <button className="snl-btn ghost" onClick={endGame}>
                End game
              </button>
            </>
          )
        }
      />
    </div>
  )
}
