// src/pages/games/gem-clash/GemOnline.jsx
// Online Gem Clash for 2-4 players, each playing their own well on their
// own phone at the same time. The host shares a code or invite link
// (/games/gem-clash?code=ABCD), picks Normal or Easy gems and starts;
// after a countdown everyone gets the same pairs in the same order (a
// shared seed). Smashing gems throws junk at whoever is doing best (the
// lowest stack); the last well standing wins.
//
// A few times a second each phone broadcasts a snapshot of its well
// (engine.snapshot), which the others draw small down the side; junk goes
// over the same Realtime broadcast channel. Knock-outs and the result go
// in the database (gcData.js). The match is remembered on the phone so a
// reload puts you back in it, though a well can't survive a reload, so you
// start that well afresh.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { createGame, fromSnapshot, receive, snapshot, stackHeight, takeEvents, update } from './engine'
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
  subscribeToMatch,
  unsubscribeFromMatch,
  updateSettings,
} from './gcData'
import GemStage from './GemStage'

const RULES_VERSION = 1
const STORAGE_KEY = 'gc-online-session'
const SNAPSHOT_EVERY_MS = 250
const COUNTDOWN = 3
const ONLINE_MODES = {
  versus: { label: 'Normal', blurb: 'Four colours, the full game.' },
  easy: { label: 'Easy', blurb: 'Three colours and more breakers: good for little ones.' },
}

function rememberMatch(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable, resume just won't work on this device */
  }
}

export function storedMatchId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export default function GemOnline({ initialCode = '', onCodeUsed, onExit }) {
  const { user, profile } = useAuth()
  const userId = user?.id ?? null
  const myName = displayName(profile, user?.email)

  const [view, setView] = useState('menu') // 'menu' | 'match'
  const [codeInput, setCodeInput] = useState(initialCode.toUpperCase())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const [session, setSession] = useState(null)
  const [players, setPlayers] = useState([])
  const [countdown, setCountdown] = useState(null) // 3, 2, 1, then null once playing
  const [playing, setPlaying] = useState(false)
  const [mine, setMine] = useState({ score: 0, chain: 0, out: false })
  const [liveScores, setLiveScores] = useState({}) // seat -> score, from snapshots

  const sessionIdRef = useRef(null)
  const channelRef = useRef(null)
  const startedRef = useRef(null) // session id whose countdown has run
  const worldRef = useRef({ game: createGame('versus'), rivals: [] })
  const rivalGames = useRef(new Map()) // seat -> drawable well from their last snapshot
  const rivalHeights = useRef(new Map()) // seat -> stack height
  const lastSentRef = useRef(0)
  const knockedRef = useRef(false)
  const playersRef = useRef(players)
  playersRef.current = players

  const mySeat = players.find((p) => p.user_id === userId)?.seat ?? null
  const mySeatRef = useRef(mySeat)
  mySeatRef.current = mySeat

  // ---------- data + realtime ----------

  const fetchAll = useCallback(async (sessionId) => {
    const snap = await fetchSessionSnapshot(sessionId)
    if (sessionIdRef.current !== sessionId) return
    if (snap.session) setSession(snap.session)
    setPlayers(snap.players)
  }, [])

  useEffect(
    () => () => {
      if (channelRef.current) unsubscribeFromMatch(channelRef.current)
    },
    [],
  )

  const enterSession = useCallback(
    async (sessionId) => {
      sessionIdRef.current = sessionId
      rememberMatch(sessionId)
      setSession(null)
      setPlayers([])
      setCountdown(null)
      setPlaying(false)
      setMine({ score: 0, chain: 0, out: false })
      setLiveScores({})
      rivalGames.current = new Map()
      rivalHeights.current = new Map()
      knockedRef.current = false
      await fetchAll(sessionId)
      if (channelRef.current) unsubscribeFromMatch(channelRef.current)
      channelRef.current = subscribeToMatch(sessionId, {
        onChange: () => fetchAll(sessionId),
        onWell: (p) => {
          if (p.seat === mySeatRef.current) return
          rivalGames.current.set(p.seat, fromSnapshot(p, `s${p.seat}`))
          rivalHeights.current.set(p.seat, p.x ? Infinity : p.h)
          setLiveScores((prev) => (prev[p.seat] === p.s ? prev : { ...prev, [p.seat]: p.s }))
        },
        onJunk: (p) => {
          if (p.to === mySeatRef.current) receive(worldRef.current.game, p.n)
        },
      })
      setView('match')
    },
    [fetchAll],
  )

  const createMatch = useCallback(async () => {
    if (!userId) return
    setBusy(true)
    setError('')
    try {
      const s = await createSession(userId, myName, RULES_VERSION)
      await enterSession(s.id)
    } catch (e) {
      setError(e.message || 'Could not create the match.')
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

  const joinMatch = useCallback(
    async (rawCode) => {
      if (!userId) return
      const code = (rawCode ?? codeInput).trim().toUpperCase()
      if (code.length !== 4) {
        setError('Enter the 4-character match code.')
        return
      }
      setBusy(true)
      setError('')
      try {
        const s = await getOpenSessionByCode(code)
        if (!s) throw new Error('No open match with that code. It may have already started.')
        await joinById(s.id)
      } catch (e) {
        setError(e.message || 'Could not join the match.')
      } finally {
        setBusy(false)
      }
    },
    [userId, codeInput, joinById],
  )

  // Invite link: join straight away. Otherwise pick up a match this phone
  // was already in.
  const bootedRef = useRef(false)
  useEffect(() => {
    if (!userId || bootedRef.current) return
    bootedRef.current = true
    if (initialCode) {
      onCodeUsed?.()
      joinMatch(initialCode)
      return
    }
    const stored = storedMatchId()
    if (!stored) return
    ;(async () => {
      const s = await getSession(stored)
      const inIt = s && s.status !== 'finished' && (await getPlayers(s.id)).some((p) => p.user_id === userId)
      if (inIt) await enterSession(s.id)
      else rememberMatch(null)
    })()
  }, [userId, initialCode, onCodeUsed, joinMatch, enterSession])

  const leave = useCallback(() => {
    if (channelRef.current) unsubscribeFromMatch(channelRef.current)
    channelRef.current = null
    sessionIdRef.current = null
    startedRef.current = null
    rememberMatch(null)
    setSession(null)
    setPlayers([])
    setCountdown(null)
    setPlaying(false)
    setCodeInput('')
    setError('')
    setView('menu')
  }, [])

  async function shareInvite() {
    const url = inviteUrl(session.code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Gem Clash', text: `Take me on at Gem Clash, code ${session.code}`, url })
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

  // ---------- match flow ----------

  const status = session?.status
  const finished = status === 'finished'
  const racers = useMemo(() => players.filter((p) => session?.num_players == null || p.seat < session.num_players), [players, session])
  const racersRef = useRef(racers)
  racersRef.current = racers

  // When the host starts: count down, then everyone's well starts together.
  useEffect(() => {
    if (status !== 'active' || !session || mySeat == null || startedRef.current === session.id) return undefined
    startedRef.current = session.id
    worldRef.current = { game: createGame(session.mode, { seed: session.seed, junkPattern: mySeat % 2 }), rivals: [] }
    knockedRef.current = false
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
      setPlaying(true)
    }, 1000)
    return () => clearInterval(timer)
  }, [status, session, mySeat])

  useEffect(() => {
    if (finished) setPlaying(false)
  }, [finished])

  // Last one standing: everyone else is out and we're still going.
  useEffect(() => {
    if (status !== 'active' || mySeat == null || mine.out || !playing) return
    const others = racers.filter((p) => p.seat !== mySeat)
    if (others.length && others.every((p) => p.out)) finishSession(session.id, mySeat)
  }, [status, racers, mySeat, mine.out, playing, session])

  // Everyone's out (the last two can go together): the best score wins.
  useEffect(() => {
    if (status !== 'active' || racers.length < 2 || !racers.every((p) => p.out)) return
    const top = [...racers].sort((a, b) => b.score - a.score || a.seat - b.seat)[0]
    finishSession(session.id, top.seat)
  }, [status, racers, session])

  // Junk goes to whoever's doing best: the opponent still in with the
  // lowest stack.
  function pickTarget() {
    const targets = racersRef.current.filter((p) => p.seat !== mySeatRef.current && !p.out && rivalHeights.current.get(p.seat) !== Infinity)
    if (!targets.length) return null
    const height = (p) => rivalHeights.current.get(p.seat) ?? 0
    const low = Math.min(...targets.map(height))
    const best = targets.filter((p) => height(p) === low)
    return best[Math.floor(Math.random() * best.length)].seat
  }

  function tick(dt, now, feedback) {
    const game = worldRef.current.game
    if (game.phase !== 'over') {
      update(game, dt)
      feedback(takeEvents(game))
    }
    if (game.outbox > 0) {
      const to = pickTarget()
      if (to != null) broadcast(channelRef.current, 'junk', { from: mySeatRef.current, to, n: game.outbox })
      game.outbox = 0
    }
    if (now - lastSentRef.current >= SNAPSHOT_EVERY_MS || (game.phase === 'over' && !knockedRef.current)) {
      lastSentRef.current = now
      broadcast(channelRef.current, 'well', { seat: mySeatRef.current, ...snapshot(game) })
      setMine((prev) =>
        prev.score === game.score && prev.chain === game.biggestChain && prev.out === (game.phase === 'over')
          ? prev
          : { score: game.score, chain: game.biggestChain, out: game.phase === 'over' },
      )
    }
    if (game.phase === 'over' && !knockedRef.current) {
      knockedRef.current = true
      if (navigator.vibrate) navigator.vibrate([60, 40, 60])
      knockOut(sessionIdRef.current, userId, game.score)
    }
  }

  // Keep the opponents' wells in the world the stage draws.
  useEffect(() => {
    const id = setInterval(() => {
      worldRef.current.rivals = racersRef.current
        .filter((p) => p.seat !== mySeatRef.current)
        .map((p) => ({
          key: `s${p.seat}`,
          name: p.display_name.split(' ')[0].slice(0, 10),
          game: rivalGames.current.get(p.seat) ?? fromSnapshot(null, `s${p.seat}`),
          out: p.out,
        }))
    }, 100)
    return () => clearInterval(id)
  }, [])

  async function quitMatch() {
    if (!finished && !window.confirm('Leave the match? You’ll be counted as out.')) return
    if (!finished && mySeat != null && !knockedRef.current) await knockOut(session.id, userId, worldRef.current.game.score)
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

  if (view === 'menu' || !session) {
    return (
      <div className="gc gc-online-menu">
        <div className="gc-card">
          <p className="gc-overlay-title">Play online</p>
          {view === 'match' ? (
            <p className="gc-overlay-sub">Loading the match…</p>
          ) : (
            <>
              <p className="gc-overlay-sub">
                2-4 players, each on their own phone. Smash gems to bury the others in junk. Last well standing wins.
              </p>
              <p className="gc-overlay-note">
                Playing as <strong>{myName}</strong>
              </p>
              <button className="gc-btn primary" disabled={busy} onClick={createMatch}>
                Start a new match
              </button>
              <div className="gc-divider">or join with a code</div>
              <div className="gc-join-row">
                <input
                  className="gc-code-input"
                  value={codeInput}
                  maxLength={4}
                  placeholder="CODE"
                  aria-label="Match code"
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && joinMatch()}
                />
                <button className="gc-btn" disabled={busy} onClick={() => joinMatch()}>
                  Join
                </button>
              </div>
              {busy && <p className="gc-overlay-note">Connecting…</p>}
              {error && <p className="gc-error">{error}</p>}
              <button className="gc-link" onClick={onExit}>
                Back to solo
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (session.rules_version != null && session.rules_version !== RULES_VERSION) {
    return (
      <div className="gc gc-online-menu">
        <div className="gc-card">
          <p className="gc-overlay-sub">This match was made on a newer version of Gem Clash. Refresh the page, then rejoin.</p>
          <button className="gc-btn" onClick={leave}>
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
      <div className="gc gc-online-menu">
        <div className="gc-card">
          <span className="gc-code-label">Share this code</span>
          <span className="gc-code-value">{session.code}</span>
          <button className="gc-btn primary" onClick={shareInvite}>
            {linkCopied ? 'Link copied!' : '🔗 Share invite link'}
          </button>
          <div className="gc-chips">
            {players.map((p) => (
              <span key={p.user_id} className="gc-chip">
                {p.display_name}
                {p.user_id === userId ? ' (you)' : ''}
                {p.user_id === session.host_id ? ' · host' : ''}
              </span>
            ))}
          </div>
          <p className="gc-overlay-note">
            {players.length}/{MAX_PLAYERS} players
          </p>
          <div className="gc-chips" role="group" aria-label="Gems">
            {Object.entries(ONLINE_MODES).map(([key, m]) => (
              <button
                key={key}
                className={`gc-chip ${session.mode === key ? 'active' : ''}`}
                disabled={!isHost}
                onClick={() => updateSettings(session.id, { mode: key })}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="gc-overlay-note">{ONLINE_MODES[session.mode]?.blurb}</p>
          {isHost ? (
            <button className="gc-btn primary" onClick={() => startSession(session.id, players.length)} disabled={players.length < 2}>
              {players.length < 2 ? 'Waiting for at least 2 players…' : `Start with ${players.length} players`}
            </button>
          ) : (
            <p className="gc-overlay-note">Waiting for the host to start…</p>
          )}
          <button
            className="gc-link"
            onClick={async () => {
              if (isHost) await finishSession(session.id, null)
              leave()
            }}
          >
            {isHost ? 'Cancel match' : 'Leave'}
          </button>
        </div>
      </div>
    )
  }

  // ---------- playing / finished ----------

  const standings = racers
    .map((p) => ({ ...p, score: p.seat === mySeat ? mine.score : Math.max(p.score, liveScores[p.seat] ?? 0) }))
    .sort((a, b) => (a.seat === session.winner_seat ? -1 : b.seat === session.winner_seat ? 1 : b.score - a.score))

  let overlay = null
  if (countdown != null) {
    overlay = (
      <div className="gc-overlay">
        <p className="gc-countdown" key={countdown}>
          {countdown}
        </p>
      </div>
    )
  } else if (finished) {
    const iWon = session.winner_seat === mySeat
    overlay = (
      <div className="gc-overlay">
        <div className="gc-card">
          <p className="gc-overlay-title">
            {session.winner_seat == null ? 'Match called off' : iWon ? 'You win! 🏆' : `${nameOf(session.winner_seat)} wins!`}
          </p>
          <ol className="gc-standings">
            {standings.map((p, i) => (
              <li key={p.seat} className={p.seat === mySeat ? 'is-me' : ''}>
                <span>{i + 1}</span>
                <span>
                  {p.seat === mySeat ? 'You' : p.display_name}
                  {p.seat === session.winner_seat ? ' 🏆' : p.out ? ' (out)' : ''}
                </span>
                <span>{p.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <div className="gc-overlay-actions">
            <button className="gc-btn primary" disabled={busy} onClick={rematch}>
              {session.rematch_id ? 'Join the rematch' : 'Rematch'}
            </button>
            <button
              className="gc-btn"
              onClick={() => {
                leave()
                onExit()
              }}
            >
              Leave
            </button>
          </div>
          {error && <p className="gc-error">{error}</p>}
        </div>
      </div>
    )
  } else if (mine.out) {
    overlay = (
      <div className="gc-overlay">
        <div className="gc-card">
          <p className="gc-overlay-title">Your well's full</p>
          <p className="gc-overlay-sub">You scored {mine.score.toLocaleString()}. Watch the others battle it out.</p>
        </div>
      </div>
    )
  }

  const inCount = racers.filter((p) => !p.out).length

  return (
    <div className="gc">
      <div className="gc-hud">
        <div className="gc-stat">
          <span className="gc-stat-label">Score</span>
          <span className="gc-stat-value">{mine.score.toLocaleString()}</span>
        </div>
        <div className="gc-stat">
          <span className="gc-stat-label">Best chain</span>
          <span className="gc-stat-value">{mine.chain > 0 ? `×${mine.chain}` : '-'}</span>
        </div>
        <div className="gc-stat">
          <span className="gc-stat-label">Still in</span>
          <span className="gc-stat-value">
            {inCount}/{racers.length}
          </span>
        </div>
        <button className="gc-icon-btn" onClick={quitMatch} aria-label="Leave the match">
          ✕
        </button>
      </div>

      <GemStage worldRef={worldRef} active={playing && !finished} onTick={tick} overlay={overlay} />
    </div>
  )
}
