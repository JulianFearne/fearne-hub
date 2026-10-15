// src/pages/games/gem-clash/GemClash.jsx
// Falling-gem battler in the style of Puzzle Pirates' Swordfight. Rules in
// engine.js, drawing in draw.js, the play surface (canvas, buttons,
// swipes) in GemStage.jsx, the computer opponent in ai.js and online
// matches in GemOnline.jsx. This page is the start and results screens,
// the HUD and the offline modes:
//
//   easy    3 colours, more breakers, slow: for little ones (own board)
//   solo    the full game against the clock, with a little junk dropping
//           in now and then (own board)
//   versus  against the computer (easy / medium / hard); smashing gems
//           sends junk into each other's wells
//
// An invite link (/games/gem-clash?code=ABCD), or coming back to a match
// this phone was in, goes straight to online play.
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall: well in the middle, buttons underneath.

import { useCallback, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { MODES, createGame, hardDrop, move, receive, rotate, setSoftDrop, takeEvents, update } from './engine'
import { AI_LEVELS, plan } from './ai'
import GemStage from './GemStage'
import GemOnline, { storedMatchId } from './GemOnline'
import './gem-clash.css'

const MODE_KEY = 'gc-mode'
const LEVEL_KEY = 'gc-level'

function load(key, valid, fallback) {
  try {
    const v = localStorage.getItem(key)
    return valid[v] ? v : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered; the default comes back next time.
  }
}

const hudFrom = (g) => ({ score: g.score, chain: g.biggestChain, smashed: g.smashed })
const sameHud = (a, b) => a.score === b.score && a.chain === b.chain && a.smashed === b.smashed

export default function GemClash() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inviteCode, setInviteCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [online, setOnline] = useState(() => !!inviteCode || !!storedMatchId())

  if (online) {
    return (
      <GemOnline
        initialCode={inviteCode}
        onCodeUsed={() => {
          setInviteCode('')
          setSearchParams({}, { replace: true })
        }}
        onExit={() => setOnline(false)}
      />
    )
  }
  return <GemOffline onOnline={() => setOnline(true)} />
}

function GemOffline({ onOnline }) {
  const [mode, setMode] = useState(() => load(MODE_KEY, MODES, 'solo'))
  const [level, setLevel] = useState(() => load(LEVEL_KEY, AI_LEVELS, 'medium'))
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'paused' | 'over'
  const [hud, setHud] = useState({ score: 0, chain: 0, smashed: 0 })
  const [result, setResult] = useState(null)
  const [tally, setTally] = useState({ you: 0, cpu: 0 })
  const scores = useHighScores('gem-clash', mode === 'easy' ? 'easy' : 'solo')
  const versus = mode === 'versus'

  const worldRef = useRef(null)
  const aiRef = useRef({ piece: -1, target: null, next: 0 })
  const endingRef = useRef(false)
  const levelRef = useRef(level)
  const submitRef = useRef(scores.submit)
  levelRef.current = level
  submitRef.current = scores.submit

  function newWorld(nextMode, seed = Math.floor(Math.random() * 2 ** 31)) {
    const game = createGame(nextMode, { seed })
    const rival = nextMode === 'versus' ? createGame('versus', { seed: seed + 1, junkPattern: 1 }) : null
    return { game, rivals: rival ? [{ key: 'cpu', name: 'Computer', game: rival }] : [] }
  }
  if (!worldRef.current) worldRef.current = newWorld(mode)

  // ---------- game end ----------

  const finish = useCallback((youWon) => {
    const game = worldRef.current.game
    endingRef.current = true
    if (navigator.vibrate) navigator.vibrate(youWon ? 40 : [60, 40, 60])
    setTimeout(async () => {
      setPhase('over')
      if (game.mode === 'versus') {
        setTally((t) => (youWon ? { ...t, you: t.you + 1 } : { ...t, cpu: t.cpu + 1 }))
        setResult({ versus: true, youWon, score: game.score, chain: game.biggestChain })
        return
      }
      const score = game.score
      setResult({ score, chain: game.biggestChain, smashed: game.smashed, pending: score > 0 })
      if (score > 0) {
        const r = await submitRef.current(score)
        setResult((prev) => (prev && prev.score === score ? { ...prev, ...r, pending: false } : prev))
      }
    }, 900)
  }, [])

  // ---------- each frame ----------

  // The computer steers a step at a time towards the spot it picked.
  function driveAi(rival, now) {
    if (rival.phase !== 'fall' || !rival.piece) return
    const ai = aiRef.current
    const lvl = AI_LEVELS[levelRef.current]
    if (ai.piece !== rival.pieces) {
      ai.piece = rival.pieces
      ai.target = plan(rival, levelRef.current)
      ai.next = now + lvl.stepMs * 2
      setSoftDrop(rival, false)
    }
    if (now < ai.next || !ai.target) return
    ai.next = now + lvl.stepMs
    const p = rival.piece
    if (p.o !== ai.target.o) rotate(rival, 1)
    else if (p.c !== ai.target.c) {
      if (!move(rival, Math.sign(ai.target.c - p.c))) ai.target = { ...ai.target, c: p.c }
    } else if (levelRef.current === 'hard') hardDrop(rival)
    else setSoftDrop(rival, true)
  }

  function tick(dt, now, feedback) {
    if (endingRef.current) return
    const { game, rivals } = worldRef.current
    const rival = rivals[0]?.game
    update(game, dt)
    feedback(takeEvents(game))
    if (rival) {
      driveAi(rival, now)
      update(rival, dt)
      takeEvents(rival)
      if (game.outbox) {
        receive(rival, game.outbox)
        game.outbox = 0
      }
      if (rival.outbox) {
        receive(game, rival.outbox)
        rival.outbox = 0
      }
    }
    const next = hudFrom(game)
    setHud((prev) => (sameHud(prev, next) ? prev : next))
    if (game.phase === 'over') finish(false)
    else if (rival?.phase === 'over') finish(true)
  }

  // ---------- starting ----------

  function start(nextMode = mode) {
    worldRef.current = newWorld(nextMode)
    aiRef.current = { piece: -1, target: null, next: 0 }
    endingRef.current = false
    setHud(hudFrom(worldRef.current.game))
    setResult(null)
    setPhase('playing')
  }

  function chooseMode(next) {
    if (next === mode) return
    save(MODE_KEY, next)
    setMode(next)
    worldRef.current = newWorld(next)
    setHud(hudFrom(worldRef.current.game))
    setResult(null)
    setPhase('ready')
  }

  function chooseLevel(next) {
    save(LEVEL_KEY, next)
    setLevel(next)
  }

  const pause = () => setPhase((p) => (p === 'playing' ? 'paused' : p))

  // ---------- render ----------

  const modePicker = (
    <div className="gc-chips" role="group" aria-label="Game mode">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} className={`gc-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )
  const levelPicker = versus && (
    <div className="gc-chips" role="group" aria-label="Computer level">
      {Object.entries(AI_LEVELS).map(([key, l]) => (
        <button key={key} className={`gc-chip small ${level === key ? 'active' : ''}`} onClick={() => chooseLevel(key)}>
          {l.label}
        </button>
      ))}
    </div>
  )
  const blurb = {
    easy: 'Three colours, lots of breakers and a gentle pace. Great for little ones.',
    solo: 'How long can you last? It speeds up, and a little junk drops in now and then.',
    versus: 'Smash gems to drop junk on the computer. First well to fill up loses.',
  }[mode]

  let overlay = null
  if (phase === 'ready') {
    overlay = (
      <div className="gc-overlay">
        <div className="gc-card">
          <p className="gc-overlay-title">💎 Gem Clash</p>
          <p className="gc-overlay-sub">
            Round <strong>breakers</strong> smash every touching gem of their colour. Line up big blocks of one colour
            to make power gems worth double.
          </p>
          {modePicker}
          {levelPicker}
          <p className="gc-overlay-note">{blurb}</p>
          <div className="gc-overlay-actions">
            <button className="gc-btn primary" onClick={() => start()}>
              Start
            </button>
            <button className="gc-btn" onClick={onOnline}>
              🌐 Play online
            </button>
          </div>
          {!versus && <Leaderboard scores={scores} />}
          {versus && (tally.you > 0 || tally.cpu > 0) && (
            <p className="gc-overlay-note">
              You {tally.you} · Computer {tally.cpu}
            </p>
          )}
        </div>
      </div>
    )
  } else if (phase === 'paused') {
    overlay = (
      <div className="gc-overlay">
        <div className="gc-card">
          <p className="gc-overlay-title">Paused</p>
          <div className="gc-overlay-actions">
            <button className="gc-btn primary" onClick={() => setPhase('playing')}>
              Resume
            </button>
            <button className="gc-btn" onClick={() => start()}>
              Restart
            </button>
          </div>
          <button className="gc-link" onClick={() => setPhase('ready')}>
            Change mode
          </button>
        </div>
      </div>
    )
  } else if (phase === 'over' && result) {
    let title = 'Game over'
    let line = `${result.smashed} gems smashed${result.chain > 1 ? `, best chain ×${result.chain}` : ''}.`
    if (result.versus) {
      title = result.youWon ? 'You win! 🎉' : 'The computer wins'
      line = `You ${tally.you} · Computer ${tally.cpu}`
    } else if (result.pending) line = 'Saving your score…'
    else if (result.score > 0 && result.saved === false) line = "Saved on this phone. It'll go on the family table when you're back online."
    else if (result.best && result.rank === 1) line = 'Top of the family! 👑'
    else if (result.best) line = `New personal best! Number ${result.rank} in the family.`
    overlay = (
      <div className="gc-overlay">
        <div className="gc-card">
          <p className="gc-overlay-title">{title}</p>
          {!result.versus && <p className="gc-overlay-score">{result.score.toLocaleString()} points</p>}
          <p className="gc-overlay-sub">{line}</p>
          <div className="gc-overlay-actions">
            <button className="gc-btn primary" onClick={() => start()}>
              Play again
            </button>
            <button className="gc-btn" onClick={onOnline}>
              🌐 Play online
            </button>
          </div>
          {modePicker}
          {levelPicker}
          {!result.versus && <Leaderboard scores={scores} />}
        </div>
      </div>
    )
  }

  return (
    <div className={`gc ${mode === 'easy' ? 'gc--easy' : ''}`}>
      <div className="gc-hud">
        <div className="gc-stat">
          <span className="gc-stat-label">Score</span>
          <span className="gc-stat-value">{hud.score.toLocaleString()}</span>
        </div>
        {!versus && (
          <div className="gc-stat">
            <span className="gc-stat-label">Best</span>
            <span className="gc-stat-value">{scores.myBest != null ? scores.myBest.toLocaleString() : '-'}</span>
          </div>
        )}
        <div className="gc-stat">
          <span className="gc-stat-label">Best chain</span>
          <span className="gc-stat-value">{hud.chain > 0 ? `×${hud.chain}` : '-'}</span>
        </div>
        <button className="gc-icon-btn" onClick={pause} disabled={phase !== 'playing'} aria-label="Pause">
          ❚❚
        </button>
      </div>

      <GemStage
        worldRef={worldRef}
        active={phase === 'playing'}
        onTick={tick}
        onPauseKey={() => setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))}
        onHidden={pause}
        overlay={overlay}
      />
    </div>
  )
}
