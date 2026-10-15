// src/pages/games/checkers/CheckersOnline.jsx
// Online Checkers for two players on their own devices. The host shares a
// code or invite link (/games/checkers?code=ABCD) and plays Red; the game
// starts as soon as someone joins as White. Every move is one row in
// ck_moves; the board is DERIVED by replaying them (engine.deriveOnline),
// never stored. Each player sees their own pieces at the bottom. The
// current game is remembered on the device so a reload puts you back in it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { applyMove, deriveOnline, moveKey } from './engine'
import {
  createSession,
  fetchSessionSnapshot,
  finishSession,
  getOpenSessionByCode,
  getPlayers,
  getSession,
  insertMove,
  inviteUrl,
  joinSession,
  linkRematch,
  subscribeToSession,
  unsubscribeFromSession,
} from './checkersData'
import CheckersTable from './CheckersTable'

const RULES_VERSION = 1
const STORAGE_KEY = 'ck-online-session'

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

export default function CheckersOnline({ initialCode = '', onCodeUsed }) {
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
  const [moves, setMoves] = useState([])

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)
  const sendingRef = useRef(false)

  const fetchAll = useCallback(async (sessionId) => {
    const snap = await fetchSessionSnapshot(sessionId)
    if (sessionIdRef.current !== sessionId) return
    if (snap.session) setSession(snap.session)
    setPlayers(snap.players)
    setMoves(snap.moves)
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
      setMoves([])
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

  const joinById = useCallback(
    async (sessionId) => {
      await joinSession(sessionId, userId, myName)
      await enterSession(sessionId)
    },
    [userId, myName, enterSession],
  )

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
        await joinById(s.id)
      } catch (e) {
        setError(e.message || 'Could not join the game.')
      } finally {
        setBusy(false)
      }
    },
    [userId, codeInput, joinById],
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
    setMoves([])
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  async function shareInvite() {
    const url = inviteUrl(session.code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Checkers', text: `Play me at Checkers, code ${session.code}`, url })
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

  const state = useMemo(() => deriveOnline(moves), [moves])
  const mySeat = players.find((p) => p.user_id === userId)?.seat ?? null
  const theirSeat = mySeat == null ? null : 1 - mySeat
  const nameOf = (seat) => (seat === mySeat ? 'You' : players.find((p) => p.seat === seat)?.display_name || (seat === 0 ? 'Red' : 'White'))
  const names = [nameOf(0), nameOf(1)]
  const oppName = theirSeat == null ? 'Your opponent' : nameOf(theirSeat)

  // Stamp the result once the replay shows it (whoever notices first).
  useEffect(() => {
    if (session?.status !== 'active') return
    if (state.winner != null) finishSession(session.id, state.winner)
    else if (state.draw) finishSession(session.id, null)
  }, [state.winner, state.draw, session])

  async function play(move) {
    if (sendingRef.current || state.turn !== mySeat) return
    sendingRef.current = true
    const sessionId = sessionIdRef.current
    const path = moveKey(move)
    const moveNumber = moves.reduce((m, row) => Math.max(m, row.move_number), 0) + 1
    // Show it straight away; the realtime refetch confirms it.
    setMoves((prev) => [...prev, { session_id: sessionId, seat: mySeat, path, move_number: moveNumber }])
    try {
      const err = await insertMove({ sessionId, userId, seat: mySeat, path, moveNumber })
      if (err) await fetchAll(sessionId)
      else {
        const next = applyMove(state, move)
        if (next.winner != null) await finishSession(sessionId, next.winner)
        else if (next.draw) await finishSession(sessionId, null)
      }
    } finally {
      sendingRef.current = false
    }
  }

  async function resign() {
    if (!window.confirm('Resign this game? Your opponent wins.')) return
    await finishSession(sessionIdRef.current, theirSeat)
    await fetchAll(sessionIdRef.current)
  }

  async function rematch() {
    const oldId = sessionIdRef.current
    setBusy(true)
    setError('')
    try {
      if (session?.rematch_id) {
        await joinById(session.rematch_id)
        return
      }
      const s = await createSession(userId, myName, RULES_VERSION)
      if (await linkRematch(oldId, s.id)) {
        await enterSession(s.id)
        return
      }
      // They started one at the same moment: bin ours and join theirs.
      await finishSession(s.id, null)
      const old = await getSession(oldId)
      if (old?.rematch_id) await joinById(old.rematch_id)
    } catch (e) {
      setError(e.message || 'Could not start a rematch.')
    } finally {
      setBusy(false)
    }
  }

  // ---------- render ----------

  if (view === 'menu') {
    return (
      <div className="ck-panel">
        <div className="ck-lobby">
          <p className="ck-hint">
            Playing as <strong>{myName}</strong>
          </p>
          <button className="ck-btn primary" disabled={busy} onClick={createGame}>
            Start a new game
          </button>
          <div className="ck-lobby-divider">or join with a code</div>
          <div className="ck-join-row">
            <input
              className="ck-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              aria-label="Game code"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button className="ck-btn" disabled={busy} onClick={() => joinGame()}>
              Join
            </button>
          </div>
          {busy && <p className="ck-hint">Connecting…</p>}
          {error && <div className="ck-error">{error}</div>}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="ck-panel">
        <p className="ck-hint">Loading game…</p>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="ck-panel">
        <p className="ck-hint">This game was made on a newer version of Checkers. Refresh the page, then rejoin.</p>
        <button className="ck-btn" onClick={leave}>
          Back
        </button>
      </div>
    )
  }

  if (session.status === 'waiting') {
    return (
      <div className="ck-panel">
        <div className="ck-lobby">
          <span className="ck-code-label">Share this code</span>
          <span className="ck-code-value">{session.code}</span>
          <button className="ck-btn primary" onClick={shareInvite}>
            {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
          </button>
          <p className="ck-hint">You're Red and go first. Waiting for someone to join…</p>
          <button
            className="ck-btn ghost"
            onClick={async () => {
              await finishSession(session.id, null)
              leave()
            }}
          >
            Cancel game
          </button>
        </div>
      </div>
    )
  }

  const finished = session.status === 'finished' || state.winner != null || state.draw
  let status = null
  if (session.status === 'finished' && state.winner == null && !state.draw) {
    status = session.winner_seat != null ? `${nameOf(1 - session.winner_seat)} resigned. ${nameOf(session.winner_seat)} wins!` : 'This game was ended early.'
  }

  return (
    <div className="ck-panel">
      <CheckersTable
        state={state}
        names={names}
        canAct={!finished && state.turn === mySeat}
        flipped={mySeat === 1}
        onMove={play}
        status={status}
        actions={
          <>
            <div className="ck-actions">
              {finished ? (
                <>
                  <button className="ck-btn primary" disabled={busy} onClick={rematch}>
                    {session.rematch_id ? `Join ${oppName}'s rematch` : 'Rematch'}
                  </button>
                  <button className="ck-btn ghost" onClick={leave}>
                    Leave
                  </button>
                </>
              ) : (
                <>
                  <button className="ck-btn ghost" onClick={leave}>
                    Leave
                  </button>
                  <button className="ck-btn ghost" onClick={resign}>
                    Resign
                  </button>
                </>
              )}
            </div>
            {error && <div className="ck-error">{error}</div>}
          </>
        }
      />
    </div>
  )
}
