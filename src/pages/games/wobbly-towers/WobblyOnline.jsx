// src/pages/games/wobbly-towers/WobblyOnline.jsx
// Online Wobbly Towers races for 2-4 players, each building their own tower
// on their own device at the same time. The host shares a code or invite
// link, picks Classic or Power-ups and a finish height, and starts; after a
// countdown everyone gets the same pieces in the same order (a shared
// seed). First to the finish line wins, or the last one standing if the
// others lose all their lives.
//
// In Power-ups races half the power-ups earned are attacks (engine ATTACKS)
// thrown at whoever is in the lead. Live heights and attacks go over a
// Realtime broadcast channel; knock-outs and the result go in the database
// (wtData.js). The race is remembered on the device so a reload puts you
// back in it, though a tower can't survive a reload, so you start afresh.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { ATTACKS, LIVES, MODES, POWERS, towerHeightBlocks } from './engine'
import {
  MAX_PLAYERS,
  broadcast,
  createSession,
  fetchSessionSnapshot,
  finishSession,
  getOpenSessionByCode,
  getPlayers,
  getSession,
  inviteUrl,
  joinSession,
  knockOut,
  linkRematch,
  startSession,
  subscribeToRace,
  unsubscribeFromRace,
  updateSettings,
} from './wtData'
import WobblyStage from './WobblyStage'

const RULES_VERSION = 1
const STORAGE_KEY = 'wt-online-session'
const GOALS = [15, 25, 40]
const STATUS_EVERY_MS = 300
const COUNTDOWN = 3

function rememberRace(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable, resume just won't work on this device */
  }
}

export function storedRaceId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export default function WobblyOnline({ initialCode = '', onCodeUsed, onExit }) {
  const { user, profile } = useAuth()
  const userId = user?.id ?? null
  const myName = displayName(profile, user?.email)

  const [view, setView] = useState('menu') // 'menu' | 'race'
  const [codeInput, setCodeInput] = useState(initialCode.toUpperCase())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [liveStatus, setLiveStatus] = useState({}) // seat -> { height, lives, status }
  const [countdown, setCountdown] = useState(null) // 3, 2, 1, then null once racing
  const [myState, setMyState] = useState({ height: 0, lives: LIVES, status: 'ready', best: 0 })

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)
  const stage = useRef(null)
  const startedRaceRef = useRef(null) // session id whose countdown has run
  const lastSentRef = useRef(0)
  const playersRef = useRef(players)
  playersRef.current = players

  const mySeat = players.find((p) => p.user_id === userId)?.seat ?? null
  const mySeatRef = useRef(mySeat)
  mySeatRef.current = mySeat
  const liveStatusRef = useRef(liveStatus)
  liveStatusRef.current = liveStatus

  // ---------- data + realtime ----------

  const fetchAll = useCallback(async (sessionId) => {
    const snap = await fetchSessionSnapshot(sessionId)
    if (sessionIdRef.current !== sessionId) return
    if (snap.session) setSession(snap.session)
    setPlayers(snap.players)
  }, [])

  useEffect(
    () => () => {
      if (channelRef.current) unsubscribeFromRace(channelRef.current)
    },
    [],
  )

  const enterSession = useCallback(
    async (sessionId) => {
      sessionIdRef.current = sessionId
      rememberRace(sessionId)
      setSession(null)
      setPlayers([])
      setLiveStatus({})
      setCountdown(null)
      setMyState({ height: 0, lives: LIVES, status: 'ready', best: 0 })
      await fetchAll(sessionId)
      if (channelRef.current) unsubscribeFromRace(channelRef.current)
      channelRef.current = subscribeToRace(sessionId, {
        onChange: () => fetchAll(sessionId),
        onStatus: (p) => setLiveStatus((prev) => ({ ...prev, [p.seat]: p })),
        onAttack: (p) => {
          if (p.to !== mySeatRef.current) return
          const from = playersRef.current.find((pl) => pl.seat === p.from)?.display_name
          stage.current?.receive(p.power, from)
        },
      })
      setView('race')
    },
    [fetchAll],
  )

  const createRace = useCallback(async () => {
    if (!userId) return null
    setBusy(true)
    setError('')
    try {
      const s = await createSession(userId, myName, RULES_VERSION)
      await enterSession(s.id)
      return s
    } catch (e) {
      setError(e.message || 'Could not create the race.')
      return null
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

  const joinRace = useCallback(
    async (rawCode) => {
      if (!userId) return
      const code = (rawCode ?? codeInput).trim().toUpperCase()
      if (code.length !== 4) {
        setError('Enter the 4-character race code.')
        return
      }
      setBusy(true)
      setError('')
      try {
        const s = await getOpenSessionByCode(code)
        if (!s) throw new Error('No open race with that code. It may have already started.')
        await joinById(s.id)
      } catch (e) {
        setError(e.message || 'Could not join the race.')
      } finally {
        setBusy(false)
      }
    },
    [userId, codeInput, joinById],
  )

  // Invite link: join straight away. Otherwise pick up a race this device
  // was already in.
  const bootedRef = useRef(false)
  useEffect(() => {
    if (!userId || bootedRef.current) return
    bootedRef.current = true
    if (initialCode) {
      onCodeUsed?.()
      joinRace(initialCode)
      return
    }
    const stored = storedRaceId()
    if (!stored) return
    ;(async () => {
      const s = await getSession(stored)
      const mine = s && s.status !== 'finished' && (await getPlayers(s.id)).some((p) => p.user_id === userId)
      if (mine) await enterSession(s.id)
      else rememberRace(null)
    })()
  }, [userId, initialCode, onCodeUsed, joinRace, enterSession])

  const leave = useCallback(() => {
    if (channelRef.current) unsubscribeFromRace(channelRef.current)
    channelRef.current = null
    sessionIdRef.current = null
    startedRaceRef.current = null
    rememberRace(null)
    setSession(null)
    setPlayers([])
    setLiveStatus({})
    setCountdown(null)
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  async function shareInvite() {
    const url = inviteUrl(session.code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Wobbly Towers', text: `Race me at Wobbly Towers, code ${session.code}`, url })
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

  // ---------- race flow ----------

  const status = session?.status
  const racers = useMemo(() => players.filter((p) => session?.num_players == null || p.seat < session.num_players), [players, session])

  // When the host starts: count down, then everyone's game starts together.
  useEffect(() => {
    if (status !== 'active' || !session || startedRaceRef.current === session.id) return undefined
    startedRaceRef.current = session.id
    let n = COUNTDOWN
    setCountdown(n)
    const timer = setInterval(() => {
      n -= 1
      if (n > 0) {
        setCountdown(n)
        return
      }
      clearInterval(timer)
      setCountdown(null)
      stage.current?.start()
    }, 1000)
    return () => clearInterval(timer)
  }, [status, session])

  // Someone won (or the race was called off): stop this tower where it is.
  useEffect(() => {
    if (status === 'finished') stage.current?.stop()
  }, [status])

  // Last one standing: everyone else is out and we're still building.
  useEffect(() => {
    if (status !== 'active' || mySeat == null || myState.status !== 'playing') return
    const others = racers.filter((p) => p.seat !== mySeat)
    if (others.length && others.every((p) => p.out)) finishSession(session.id, mySeat)
  }, [status, racers, mySeat, myState.status, session])

  // Everyone's out (the last two can go at once): best height wins.
  useEffect(() => {
    if (status !== 'active' || racers.length < 2 || !racers.every((p) => p.out)) return
    const top = [...racers].sort((a, b) => b.best - a.best || a.seat - b.seat)[0]
    finishSession(session.id, top.seat)
  }, [status, racers, session])

  const onFrame = useCallback((game) => {
    const now = performance.now()
    if (now - lastSentRef.current < STATUS_EVERY_MS || mySeatRef.current == null) return
    lastSentRef.current = now
    const mine = { seat: mySeatRef.current, height: towerHeightBlocks(game), lives: game.lives, status: game.status, best: game.best }
    broadcast(channelRef.current, 'status', mine)
    setMyState((prev) =>
      prev.height === mine.height && prev.lives === mine.lives && prev.status === mine.status && prev.best === mine.best ? prev : mine,
    )
  }, [])

  const onGameEnd = useCallback(
    (game) => {
      const sessionId = sessionIdRef.current
      const final = { seat: mySeatRef.current, height: towerHeightBlocks(game), lives: game.lives, status: game.status, best: game.best }
      broadcast(channelRef.current, 'status', final)
      setMyState(final)
      if (game.status === 'won') finishSession(sessionId, mySeatRef.current)
      else knockOut(sessionId, userId, game.best)
    },
    [userId],
  )

  // Attacks go to whoever is highest (other than you) and still in.
  const onAttack = useCallback(
    (power) => {
      const targets = playersRef.current.filter((p) => p.seat !== mySeatRef.current && !p.out)
      if (!targets.length) return
      const height = (p) => liveStatusRef.current[p.seat]?.height ?? 0
      const best = Math.max(...targets.map(height))
      const leaders = targets.filter((p) => height(p) === best)
      const target = leaders[Math.floor(Math.random() * leaders.length)]
      broadcast(channelRef.current, 'attack', { from: mySeatRef.current, to: target.seat, power })
    },
    [],
  )

  async function quitRace() {
    if (!finished && !window.confirm('Leave the race? You’ll be counted as out.')) return
    if (!finished && mySeat != null && myState.status !== 'over') await knockOut(session.id, userId, myState.best)
    leave()
    onExit()
  }

  async function rematch() {
    const oldId = sessionIdRef.current
    setBusy(true)
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
      <div className="wt wt-online-menu">
        <div className="wt-panel">
          <p className="wt-overlay-title">Race online</p>
          <p className="wt-overlay-sub">
            2-4 players build at the same time on their own phones. First to the finish line wins. In Power-ups races
            you can throw {Object.values(ATTACKS).map((a) => a.emoji).join(' ')} at the leader.
          </p>
          <p className="wt-hint">
            Playing as <strong>{myName}</strong>
          </p>
          <button className="wt-btn primary" disabled={busy} onClick={createRace}>
            Start a new race
          </button>
          <div className="wt-divider">or join with a code</div>
          <div className="wt-join-row">
            <input
              className="wt-code-input"
              value={codeInput}
              maxLength={4}
              placeholder="CODE"
              aria-label="Race code"
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinRace()}
            />
            <button className="wt-btn" disabled={busy} onClick={() => joinRace()}>
              Join
            </button>
          </div>
          {busy && <p className="wt-hint">Connecting…</p>}
          {error && <p className="wt-error">{error}</p>}
          <button className="wt-btn ghost" onClick={onExit}>
            Back to solo
          </button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="wt wt-online-menu">
        <div className="wt-panel">
          <p className="wt-hint">Loading race…</p>
        </div>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="wt wt-online-menu">
        <div className="wt-panel">
          <p className="wt-hint">This race was made on a newer version of Wobbly Towers. Refresh the page, then rejoin.</p>
          <button className="wt-btn" onClick={leave}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const isHost = session.host_id === userId
  const nameOf = (seat) => (seat === mySeat ? 'You' : players.find((p) => p.seat === seat)?.display_name || 'Player')

  if (status === 'waiting') {
    return (
      <div className="wt wt-online-menu">
        <div className="wt-panel">
          <span className="wt-code-label">Share this code</span>
          <span className="wt-code-value">{session.code}</span>
          <button className="wt-btn primary" onClick={shareInvite}>
            {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
          </button>
          <div className="wt-lobby-players">
            {players.map((p) => (
              <span key={p.user_id} className="wt-chip">
                {p.display_name}
                {p.user_id === userId ? ' (you)' : ''}
                {p.user_id === session.host_id ? ' · host' : ''}
              </span>
            ))}
          </div>
          <p className="wt-hint">
            {players.length}/{MAX_PLAYERS} players
          </p>

          <div className="wt-setting">
            <span className="wt-setting-label">Mode</span>
            <div className="wt-modes">
              {Object.entries(MODES).map(([key, m]) => (
                <button
                  key={key}
                  className={`wt-chip ${session.mode === key ? 'active' : ''}`}
                  disabled={!isHost}
                  onClick={() => updateSettings(session.id, { mode: key })}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="wt-setting">
            <span className="wt-setting-label">Finish line</span>
            <div className="wt-modes">
              {GOALS.map((g) => (
                <button
                  key={g}
                  className={`wt-chip ${session.goal === g ? 'active' : ''}`}
                  disabled={!isHost}
                  onClick={() => updateSettings(session.id, { goal: g })}
                >
                  {g} blocks
                </button>
              ))}
            </div>
          </div>
          {session.mode === 'powerups' && (
            <p className="wt-overlay-note">
              Power-ups for you: {Object.values(POWERS).map((p) => p.emoji).join(' ')}. Attacks on the leader:{' '}
              {Object.values(ATTACKS)
                .map((a) => `${a.emoji} ${a.label}`)
                .join(', ')}
              .
            </p>
          )}

          {isHost ? (
            <button className="wt-btn primary" onClick={() => startSession(session.id, players.length)} disabled={players.length < 2}>
              {players.length < 2 ? 'Waiting for at least 2 players…' : `Start the race with ${players.length}`}
            </button>
          ) : (
            <p className="wt-hint">Waiting for the host to start…</p>
          )}
          <button
            className="wt-btn ghost"
            onClick={async () => {
              if (isHost) await finishSession(session.id, null)
              leave()
            }}
          >
            {isHost ? 'Cancel race' : 'Leave'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- racing / finished ----------

  const goal = session.goal
  const finished = status === 'finished'
  const rivals = racers
    .filter((p) => p.seat !== mySeat)
    .map((p) => ({ name: p.display_name, height: liveStatus[p.seat]?.height ?? 0 }))

  const standings = racers
    .map((p) => {
      const live = p.seat === mySeat ? myState : liveStatus[p.seat]
      return { ...p, height: live?.height ?? 0, lives: live?.lives ?? LIVES, best: Math.max(p.best, live?.best ?? 0) }
    })
    .sort((a, b) => (a.seat === session.winner_seat ? -1 : b.seat === session.winner_seat ? 1 : b.best - a.best))

  function overlay(hud) {
    if (countdown != null) {
      return (
        <div className="wt-overlay wt-countdown">
          <p className="wt-countdown-num" key={countdown}>
            {countdown}
          </p>
          <p className="wt-overlay-sub">First to {goal} blocks wins</p>
        </div>
      )
    }
    if (finished) {
      const iWon = session.winner_seat === mySeat
      return (
        <div className="wt-overlay">
          <p className="wt-overlay-title">
            {session.winner_seat == null ? 'Race called off' : iWon ? 'You win! 🏆' : `${nameOf(session.winner_seat)} wins!`}
          </p>
          <ol className="wt-board">
            {standings.map((p, i) => (
              <li key={p.seat} className={p.seat === mySeat ? 'is-new' : ''}>
                <span className="wt-board-rank">{i + 1}</span>
                <span className="wt-board-name">
                  {p.seat === mySeat ? 'You' : p.display_name}
                  {p.seat === session.winner_seat ? ' 🏆' : p.out ? ' (out)' : ''}
                </span>
                <span className="wt-board-medal" />
                <span className="wt-board-score">{p.best}</span>
              </li>
            ))}
          </ol>
          <div className="wt-overlay-actions">
            <button className="wt-btn primary" disabled={busy} onClick={rematch}>
              {session.rematch_id ? 'Join the rematch' : 'Rematch'}
            </button>
            <button
              className="wt-btn"
              onClick={() => {
                leave()
                onExit()
              }}
            >
              Leave
            </button>
          </div>
          {error && <p className="wt-error">{error}</p>}
        </div>
      )
    }
    if (hud.status === 'over') {
      return (
        <div className="wt-overlay">
          <p className="wt-overlay-title">Timber! You're out</p>
          <p className="wt-overlay-sub">You got to {hud.best} blocks. Watch the others finish above.</p>
        </div>
      )
    }
    if (hud.status === 'ready') {
      return (
        <div className="wt-overlay">
          <p className="wt-overlay-sub">Getting ready…</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="wt">
      <div className="wt-rivals">
        <button type="button" className="wt-rivals-leave" onClick={quitRace} aria-label="Leave the race">
          ✕
        </button>
        {standings
          .slice()
          .sort((a, b) => a.seat - b.seat)
          .map((p) => (
            <div key={p.seat} className={`wt-rival ${p.seat === mySeat ? 'is-me' : ''} ${p.out ? 'is-out' : ''}`}>
              <span className="wt-rival-name">
                {p.seat === mySeat ? 'You' : p.display_name}
                {p.seat === session.winner_seat ? ' 🏆' : ''}
              </span>
              <span className="wt-rival-bar">
                <span style={{ width: `${Math.min(100, (p.height / goal) * 100)}%` }} />
              </span>
              <span className="wt-rival-meta">
                {p.out ? 'out' : `${p.height} · ${'♥'.repeat(Math.max(0, p.lives))}`}
              </span>
            </div>
          ))}
      </div>
      <WobblyStage
        ref={stage}
        mode={session.mode}
        options={{ seed: session.seed, goal, attacks: session.mode === 'powerups' }}
        rivals={rivals}
        allowPause={false}
        overlay={overlay}
        onFrame={onFrame}
        onGameEnd={onGameEnd}
        onAttack={onAttack}
      />
    </div>
  )
}
