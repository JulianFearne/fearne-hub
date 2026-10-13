// src/pages/games/battleship/BattleshipOnline.jsx
// Two-player online Battleship, one device each. Same shape as online
// Connect Four: a session with a 4-character join code, a players table
// (seat 1 = host, fires first) and an append-only shot log. Each player's
// fleet is saved on their bs_players row once they hit Ready; the boards,
// whose turn it is and the winner are all DERIVED from the two fleets plus
// the shot rows (engine.deriveOnline), never stored.
//
// The host can share an invite link (/games/battleship?code=ABCD) that
// drops the other player straight into the game, like Categories. The
// current game id is remembered on the device so a reload (or the browser
// dropping the tab while you were sharing the link) puts you back in it.
//
// Note: both fleets sit in rows either player can read, so a determined
// cheat with dev tools could peek. Same trust model as Go Fish's shared
// deck seed; fine for family games.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { bareFleet, describeShot, deriveOnline, otherSeat, placeFleet } from './engine'
import {
  createSession,
  fetchSessionSnapshot,
  finishSession,
  getOpenSessionByCode,
  getPlayers,
  getSession,
  insertShot,
  inviteUrl,
  joinSessionAsSeat2,
  linkRematch,
  saveFleet,
  subscribeToSession,
  unsubscribeFromSession,
} from './battleshipData'
import BattleView from './BattleView'
import DeployView from './DeployView'

const RULES_VERSION = 1
const STORAGE_KEY = 'bsh-online-session'

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

export default function BattleshipOnline({ initialCode = '', onCodeUsed }) {
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
  const [shots, setShots] = useState([])
  const [draftFleet, setDraftFleet] = useState(() => placeFleet())

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)
  const firingRef = useRef(false)

  // ---------- data + realtime ----------

  const fetchAll = useCallback(async (sessionId) => {
    const snap = await fetchSessionSnapshot(sessionId)
    if (sessionIdRef.current !== sessionId) return // left or moved on meanwhile
    if (snap.session) setSession(snap.session)
    setPlayers(snap.players)
    setShots(snap.shots)
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
      setShots([])
      setDraftFleet(placeFleet())
      await fetchAll(sessionId)
      if (channelRef.current) unsubscribeFromSession(channelRef.current)
      channelRef.current = subscribeToSession(sessionId, () => fetchAll(sessionId))
      setView('game')
    },
    [fetchAll],
  )

  // ---------- lobby actions ----------

  const createGame = useCallback(async () => {
    if (!userId) return null
    setBusy(true)
    setError('')
    try {
      const s = await createSession(userId, myName, RULES_VERSION)
      await enterSession(s.id)
      return s
    } catch (e) {
      setError(e.message || 'Could not create the game.')
      return null
    } finally {
      setBusy(false)
    }
  }, [userId, myName, enterSession])

  const joinById = useCallback(
    async (sessionId) => {
      const existing = await getPlayers(sessionId)
      if (!existing.some((p) => p.user_id === userId)) {
        if (existing.length >= 2) throw new Error('That game is already full.')
        try {
          await joinSessionAsSeat2(sessionId, userId, myName)
        } catch {
          throw new Error('Someone just took the last seat.')
        }
      }
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

  // Arriving from an invite link: join straight away. Otherwise pick up a
  // game this device was already in.
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
    setShots([])
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  async function shareInvite() {
    const url = inviteUrl(session.code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Battleship', text: `Join my Battleship game, code ${session.code}`, url })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return // closed the share sheet
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

  // ---------- derived game state ----------

  const me = players.find((p) => p.user_id === userId) ?? null
  const mySeat = me?.seat ?? null
  const opponent = players.find((p) => p.seat !== mySeat) ?? null
  const theirSeat = mySeat ? otherSeat(mySeat) : null
  const oppName = opponent?.display_name || 'Opponent'

  const derived = useMemo(() => {
    const fleets = {}
    for (const p of players) fleets[p.seat] = p.fleet
    return deriveOnline(fleets, shots)
  }, [players, shots])

  const status = session?.status
  const bothDeployed = !!me?.fleet && !!opponent?.fleet
  const winnerSeat = derived.winner ?? (status === 'finished' ? session?.winner_seat ?? null : null)
  const finished = status === 'finished' || !!derived.winner
  const resigned = finished && !derived.winner && winnerSeat != null
  const myTurn = status === 'active' && bothDeployed && !finished && derived.nextSeat === mySeat

  // ---------- in-game actions ----------

  async function commitFleet() {
    setBusy(true)
    setError('')
    try {
      await saveFleet(sessionIdRef.current, userId, bareFleet(draftFleet))
      await fetchAll(sessionIdRef.current)
    } catch (e) {
      setError(e.message || 'Could not save your fleet.')
    } finally {
      setBusy(false)
    }
  }

  async function fire(r, c) {
    if (!myTurn || firingRef.current) return
    if (derived.shots[mySeat][r][c] != null) return
    firingRef.current = true
    const sessionId = sessionIdRef.current
    const shotNumber = derived.shotCount + 1
    const row = { session_id: sessionId, seat: mySeat, cell_row: r, cell_col: c, shot_number: shotNumber }
    // Show the shot straight away; the realtime refetch confirms it.
    setShots((prev) => [...prev, row])
    try {
      const err = await insertShot({ sessionId, userId, seat: mySeat, r, c, shotNumber })
      if (err) {
        await fetchAll(sessionId) // almost always a lost race on shot_number
        return
      }
      const fleets = { [mySeat]: me.fleet, [theirSeat]: opponent.fleet }
      const after = deriveOnline(fleets, [...shots, row])
      if (navigator.vibrate) navigator.vibrate(after.lastShot?.result.hit ? [15, 60, 15] : 15)
      if (after.winner) await finishSession(sessionId, after.winner)
      await fetchAll(sessionId)
    } finally {
      firingRef.current = false
    }
  }

  async function resign() {
    if (!window.confirm('Resign this game? Your opponent wins.')) return
    await finishSession(sessionIdRef.current, theirSeat)
    await fetchAll(sessionIdRef.current)
  }

  async function closeGame() {
    // Leaving before the battle starts: close the game so nobody joins an
    // abandoned code, and the other player isn't left waiting for a fleet
    // that never comes.
    await finishSession(sessionIdRef.current, null)
    leave()
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
      const linked = await linkRematch(oldId, s.id)
      if (linked) {
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

  // ---------- render: menu ----------

  if (view === 'menu') {
    return (
      <div className="bsh-panel">
        <div className="bsh-lobby">
          <p className="bsh-hint">
            Playing as <strong>{myName}</strong>
          </p>
          <button className="bsh-btn primary" disabled={busy} onClick={createGame}>
            Start a new game
          </button>
          <div className="bsh-lobby-divider">or join with a code</div>
          <div className="bsh-join-row">
            <input
              className="bsh-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              aria-label="Game code"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            />
            <button className="bsh-btn" disabled={busy} onClick={() => joinGame()}>
              Join
            </button>
          </div>
          {busy && <p className="bsh-hint">Connecting…</p>}
          {error && <div className="bsh-error">{error}</div>}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="bsh-panel">
        <p className="bsh-hint">Loading game…</p>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="bsh-panel">
        <div className="bsh-handoff">
          <p className="bsh-handoff-title">This game was made on a newer version of Battleship.</p>
          <p className="bsh-hint">Refresh the page, then rejoin.</p>
          <button className="bsh-btn" onClick={leave}>
            Back
          </button>
        </div>
      </div>
    )
  }

  // ---------- render: setup (waiting for a player and/or fleets) ----------

  if (!bothDeployed && finished) {
    return (
      <div className="bsh-panel">
        <div className="bsh-handoff">
          <span className="bsh-handoff-emoji">🌊</span>
          <p className="bsh-handoff-title">This game was called off</p>
          <p className="bsh-hint">Someone left before the battle started.</p>
          <button className="bsh-btn primary" onClick={leave}>
            Back
          </button>
        </div>
      </div>
    )
  }

  if (!bothDeployed) {
    const waitingForJoin = status === 'waiting'
    return (
      <div className="bsh-panel">
        {waitingForJoin && (
          <div className="bsh-invite">
            <span className="bsh-code-label">Waiting for a player. Share this code</span>
            <span className="bsh-code-value">{session.code}</span>
            <button className="bsh-btn primary" onClick={shareInvite}>
              {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
            </button>
          </div>
        )}

        {!me?.fleet ? (
          <DeployView
            title="Position your fleet"
            ships={draftFleet}
            onShuffle={() => setDraftFleet(placeFleet())}
            onReady={commitFleet}
            readyLabel="Ready"
            busy={busy}
          />
        ) : (
          <div className="bsh-handoff">
            <span className="bsh-handoff-emoji">⚓</span>
            <p className="bsh-handoff-title">Fleet ready</p>
            <p className="bsh-hint">
              {waitingForJoin ? 'The battle starts once someone joins and positions their fleet.' : `Waiting for ${oppName} to position their fleet…`}
            </p>
          </div>
        )}

        {error && <div className="bsh-error">{error}</div>}
        <div className="bsh-actions">
          <button className="bsh-btn ghost" onClick={closeGame}>
            {waitingForJoin ? 'Cancel game' : 'Leave'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- render: battle / over ----------

  const last = derived.lastShot
  let banner
  let tone = ''
  if (finished) {
    const iWon = winnerSeat === mySeat
    if (resigned) banner = iWon ? `${oppName} resigned. You win! 🎉` : 'You resigned'
    else banner = iWon ? 'You win! 🎉' : `${oppName} sank your whole fleet`
    tone = iWon ? 'win' : 'lose'
  } else if (myTurn) {
    banner = last ? `${describeShot(oppName, 'you', last.r, last.c, last.result)}. Your shot.` : `Your shot. Tap ${oppName}'s waters to fire.`
    tone = last?.result.hit ? 'incoming' : ''
  } else {
    banner = last ? `${describeShot('You', 'them', last.r, last.c, last.result)} ${oppName} is aiming…` : `${oppName} fires first…`
    tone = last?.result.hit ? 'hit' : ''
  }

  const lastMine = last && last.seat === mySeat ? [last.r, last.c] : null
  const lastTheirs = last && last.seat !== mySeat ? [last.r, last.c] : null

  return (
    <div className="bsh-panel">
      <p className="bsh-versus">
        <strong>{myName}</strong> vs <strong>{oppName}</strong>
      </p>
      <p className={`bsh-status ${tone}`} aria-live="polite">
        {banner}
      </p>

      <BattleView
        enemyName={oppName}
        enemyShips={derived.ships[theirSeat]}
        myShots={derived.shots[mySeat]}
        myShips={derived.ships[mySeat]}
        theirShots={derived.shots[theirSeat]}
        onFire={fire}
        canFire={myTurn}
        lastMine={lastMine}
        lastTheirs={lastTheirs}
        reveal={finished}
      />

      {error && <div className="bsh-error">{error}</div>}
      <div className="bsh-actions">
        {finished ? (
          <>
            <button className="bsh-btn primary" disabled={busy} onClick={rematch}>
              {session.rematch_id ? `Join ${oppName}'s rematch` : 'Rematch'}
            </button>
            <button className="bsh-btn ghost" onClick={leave}>
              Leave
            </button>
          </>
        ) : (
          <button className="bsh-btn ghost" onClick={resign}>
            Resign
          </button>
        )}
      </div>
    </div>
  )
}
