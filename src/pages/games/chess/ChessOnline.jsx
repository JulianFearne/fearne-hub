// src/pages/games/chess/ChessOnline.jsx
// Online Chess for two players on their own devices. The host shares a
// code or invite link (/games/chess?code=ABCD) and plays White; the game
// starts as soon as someone joins as Black. Every move is one row in
// ch_moves (in UCI form, 'e2e4'); the board is DERIVED by replaying them
// (engine.replay), never stored. Each player sees their own pieces at the bottom. The
// current game is remembered on the device so a reload puts you back in it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { replay, resultOf } from './engine'
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
} from './chessData'
import ChessTable from './ChessTable'

const RULES_VERSION = 1
const STORAGE_KEY = 'cs-online-session'

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

export default function ChessOnline({ initialCode = '', onCodeUsed }) {
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
        await navigator.share({ title: 'Chess', text: `Play me at Chess, code ${session.code}`, url })
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

  const uciList = useMemo(() => moves.map((m) => m.uci), [moves])
  const chess = useMemo(() => replay(uciList), [uciList])
  const result = useMemo(() => resultOf(chess), [chess])
  const turnSeat = chess.turn() === 'w' ? 0 : 1
  const winnerSeat = result.winner == null ? null : result.winner === 'w' ? 0 : 1
  const mySeat = players.find((p) => p.user_id === userId)?.seat ?? null
  const theirSeat = mySeat == null ? null : 1 - mySeat
  const nameOf = (seat) => (seat === mySeat ? 'You' : players.find((p) => p.seat === seat)?.display_name || (seat === 0 ? 'White' : 'Black'))
  const names = { w: nameOf(0), b: nameOf(1) }
  const oppName = theirSeat == null ? 'Your opponent' : nameOf(theirSeat)

  // Stamp the result once the replay shows it (whoever notices first).
  useEffect(() => {
    if (session?.status !== 'active') return
    if (result.over) finishSession(session.id, winnerSeat)
  }, [result.over, winnerSeat, session])

  async function play(uci) {
    if (sendingRef.current || turnSeat !== mySeat) return
    sendingRef.current = true
    const sessionId = sessionIdRef.current
    const moveNumber = moves.reduce((m, row) => Math.max(m, row.move_number), 0) + 1
    // Show it straight away; the realtime refetch confirms it.
    setMoves((prev) => [...prev, { session_id: sessionId, seat: mySeat, uci, move_number: moveNumber }])
    try {
      const err = await insertMove({ sessionId, userId, seat: mySeat, uci, moveNumber })
      if (err) await fetchAll(sessionId)
      else {
        const next = resultOf(replay([...uciList, uci]))
        if (next.over) await finishSession(sessionId, next.winner == null ? null : next.winner === 'w' ? 0 : 1)
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
      <div className="cs-panel">
        <div className="cs-lobby">
          <p className="cs-hint">
            Playing as <strong>{myName}</strong>
          </p>
          <button className="cs-btn primary" disabled={busy} onClick={createGame}>
            Start a new game
          </button>
          <div className="cs-lobby-divider">or join with a code</div>
          <div className="cs-join-row">
            <input
              className="cs-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              aria-label="Game code"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button className="cs-btn" disabled={busy} onClick={() => joinGame()}>
              Join
            </button>
          </div>
          {busy && <p className="cs-hint">Connecting…</p>}
          {error && <div className="cs-error">{error}</div>}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="cs-panel">
        <p className="cs-hint">Loading game…</p>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="cs-panel">
        <p className="cs-hint">This game was made on a newer version of Chess. Refresh the page, then rejoin.</p>
        <button className="cs-btn" onClick={leave}>
          Back
        </button>
      </div>
    )
  }

  if (session.status === 'waiting') {
    return (
      <div className="cs-panel">
        <div className="cs-lobby">
          <span className="cs-code-label">Share this code</span>
          <span className="cs-code-value">{session.code}</span>
          <button className="cs-btn primary" onClick={shareInvite}>
            {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
          </button>
          <p className="cs-hint">You're White and go first. Waiting for someone to join…</p>
          <button
            className="cs-btn ghost"
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

  const finished = session.status === 'finished' || result.over
  let status = null
  if (session.status === 'finished' && !result.over) {
    status = session.winner_seat != null ? `${nameOf(1 - session.winner_seat)} resigned. ${nameOf(session.winner_seat)} wins!` : 'This game was ended early.'
  }

  return (
    <div className="cs-panel">
      <ChessTable
        moves={uciList}
        names={names}
        canMove={!finished && turnSeat === mySeat}
        flipped={mySeat === 1}
        onMove={play}
        status={status}
        actions={
          <>
            <div className="cs-actions">
              {finished ? (
                <>
                  <button className="cs-btn primary" disabled={busy} onClick={rematch}>
                    {session.rematch_id ? `Join ${oppName}'s rematch` : 'Rematch'}
                  </button>
                  <button className="cs-btn ghost" onClick={leave}>
                    Leave
                  </button>
                </>
              ) : (
                <>
                  <button className="cs-btn ghost" onClick={leave}>
                    Leave
                  </button>
                  <button className="cs-btn ghost" onClick={resign}>
                    Resign
                  </button>
                </>
              )}
            </div>
            {error && <div className="cs-error">{error}</div>}
          </>
        }
      />
    </div>
  )
}
