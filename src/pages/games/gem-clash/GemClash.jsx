// src/pages/games/gem-clash/GemClash.jsx
// Falling-gem battler in the style of Puzzle Pirates' Swordfight. Rules in
// engine.js, drawing in draw.js, the computer opponent in ai.js; this page
// runs the frame loop, the controls (buttons, swipes on the well, or the
// keyboard), the start and results screens and the family high scores.
//
// Modes
//   easy    3 colours, more breakers, slow: for little ones (own board)
//   solo    the full game against the clock, with a little junk dropping
//           in now and then (own board)
//   versus  against the computer (easy / medium / hard); smashing gems
//           sends junk into each other's wells
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall: well in the middle, buttons underneath.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { MODES, createGame, hardDrop, move, receive, rotate, setSoftDrop, takeEvents, update } from './engine'
import { AI_LEVELS, plan } from './ai'
import { drawGame, layout } from './draw'
import './gem-clash.css'

const MODE_KEY = 'gc-mode'
const LEVEL_KEY = 'gc-level'
const REPEAT_DELAY = 200
const REPEAT_EVERY = 75

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

// A button that fires on press and, if `repeat`, keeps firing while held.
function Pad({ label, children, onPress, onRelease, repeat = false, className = '' }) {
  const timers = useRef([])
  function stop() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    onRelease?.()
  }
  function start(e) {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Older browsers: the hold just ends if the finger slides off.
    }
    onPress()
    if (!repeat) return
    const again = () => {
      onPress()
      timers.current.push(setTimeout(again, REPEAT_EVERY))
    }
    timers.current.push(setTimeout(again, REPEAT_DELAY))
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return (
    <button
      type="button"
      className={`gc-pad ${className}`}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export default function GemClash() {
  const [mode, setMode] = useState(() => load(MODE_KEY, MODES, 'solo'))
  const [level, setLevel] = useState(() => load(LEVEL_KEY, AI_LEVELS, 'medium'))
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'paused' | 'over'
  const [hud, setHud] = useState({ score: 0, chain: 0, smashed: 0 })
  const [result, setResult] = useState(null)
  const [tally, setTally] = useState({ you: 0, cpu: 0 })
  const scores = useHighScores('gem-clash', mode === 'easy' ? 'easy' : 'solo')
  const versus = mode === 'versus'

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const gameRef = useRef(null)
  const rivalRef = useRef(null)
  const aiRef = useRef({ piece: -1, target: null, next: 0 })
  const popsRef = useRef([])
  const shakeRef = useRef(0)
  const phaseRef = useRef(phase)
  const levelRef = useRef(level)
  const submitRef = useRef(scores.submit)
  phaseRef.current = phase
  levelRef.current = level
  submitRef.current = scores.submit

  if (!gameRef.current) gameRef.current = createGame(mode)

  // ---------- sizing ----------

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const ro = new ResizeObserver(() => {
      const rect = stage.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      sizeRef.current = { w: rect.width, h: rect.height, dpr }
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // ---------- game end ----------

  const finish = useCallback((youWon) => {
    const game = gameRef.current
    phaseRef.current = 'ending'
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

  // ---------- frame loop ----------

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    function handle(events, now, mine) {
      for (const ev of events) {
        if (ev.type === 'clear' && mine) {
          const text = ev.chain > 1 ? `Chain ×${ev.chain}!` : ev.count >= 8 ? 'Smash!' : `+${ev.damage * 10}`
          popsRef.current.push({ at: now, text, colour: ev.chain > 1 ? '#ffd54f' : '#ffffff', big: ev.chain > 1 })
          if (navigator.vibrate) navigator.vibrate(ev.chain > 1 ? [20, 40, 20] : 15)
        } else if (ev.type === 'junk' && mine) {
          shakeRef.current = 6
          if (navigator.vibrate) navigator.vibrate(30)
        }
      }
    }

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

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last)
      last = now
      const game = gameRef.current
      const rival = rivalRef.current
      if (phaseRef.current === 'playing') {
        update(game, dt)
        handle(takeEvents(game), now, true)
        if (rival) {
          driveAi(rival, now)
          update(rival, dt)
          handle(takeEvents(rival), now, false)
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
      shakeRef.current = Math.max(0, shakeRef.current - dt * 0.03)
      popsRef.current = popsRef.current.filter((p) => now - p.at < 1000)

      const { w, h, dpr } = sizeRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && w > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawGame(ctx, w, h, {
          game,
          rival,
          rivalName: 'Computer',
          pops: popsRef.current,
          now,
          shake: shakeRef.current,
        })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [finish])

  // ---------- controls ----------

  const act = useCallback((fn) => {
    if (phaseRef.current !== 'playing') return
    fn(gameRef.current)
  }, [])

  const pause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhase('paused')
  }, [])

  useEffect(() => {
    function onKey(e) {
      const k = e.key
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') act((g) => move(g, -1))
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') act((g) => move(g, 1))
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') act((g) => rotate(g, 1))
      else if (k === 'z' || k === 'Z') act((g) => rotate(g, -1))
      else if (k === 'ArrowDown' || k === 's' || k === 'S') act((g) => setSoftDrop(g, true))
      else if (k === ' ') act((g) => hardDrop(g))
      else if (k === 'p' || k === 'P' || k === 'Escape') {
        if (phaseRef.current === 'playing') setPhase('paused')
        else if (phaseRef.current === 'paused') setPhase('playing')
      } else return
      e.preventDefault()
    }
    function onKeyUp(e) {
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setSoftDrop(gameRef.current, false)
    }
    function onHide() {
      if (document.hidden) pause()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [act, pause])

  // Gestures on the well: drag sideways to slide the pair a column at a
  // time, tap to turn it, flick down to drop it.
  const touch = useRef(null)
  function onPointerDown(e) {
    if (phaseRef.current !== 'playing') return
    const { w, h } = sizeRef.current
    const cell = layout(w, h, versus).cell
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, at: performance.now(), cell, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Older browsers: the drag just stops at the edge.
    }
  }
  function onPointerMove(e) {
    const t = touch.current
    if (!t || t.id !== e.pointerId) return
    const step = Math.max(18, t.cell * 0.8)
    while (e.clientX - t.lastX >= step) {
      act((g) => move(g, 1))
      t.lastX += step
      t.moved = true
    }
    while (t.lastX - e.clientX >= step) {
      act((g) => move(g, -1))
      t.lastX -= step
      t.moved = true
    }
  }
  function onPointerUp(e) {
    const t = touch.current
    touch.current = null
    if (!t || t.id !== e.pointerId) return
    const dy = e.clientY - t.y
    const dx = e.clientX - t.x
    const quick = performance.now() - t.at < 350
    if (dy > 50 && Math.abs(dy) > Math.abs(dx) * 1.5 && quick) act((g) => hardDrop(g))
    else if (!t.moved && Math.abs(dx) < 10 && Math.abs(dy) < 10) act((g) => rotate(g, 1))
  }

  // ---------- starting ----------

  function start(nextMode = mode) {
    const seed = Math.floor(Math.random() * 2 ** 31)
    gameRef.current = createGame(nextMode, { seed })
    rivalRef.current = nextMode === 'versus' ? createGame('versus', { seed: seed + 1, junkPattern: 1 }) : null
    aiRef.current = { piece: -1, target: null, next: 0 }
    popsRef.current = []
    setHud(hudFrom(gameRef.current))
    setResult(null)
    setPhase('playing')
  }

  function chooseMode(next) {
    if (next === mode) return
    save(MODE_KEY, next)
    setMode(next)
    gameRef.current = createGame(next)
    rivalRef.current = next === 'versus' ? createGame('versus', { junkPattern: 1 }) : null
    setHud(hudFrom(gameRef.current))
    setResult(null)
    setPhase('ready')
  }

  function chooseLevel(next) {
    save(LEVEL_KEY, next)
    setLevel(next)
  }

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
        <p className="gc-overlay-title">💎 Gem Clash</p>
        <p className="gc-overlay-sub">
          Round <strong>breakers</strong> smash every touching gem of their colour. Line up big blocks of one colour to
          make power gems worth double.
        </p>
        {modePicker}
        {levelPicker}
        <p className="gc-overlay-note">{blurb}</p>
        <button className="gc-btn primary" onClick={() => start()}>
          Start
        </button>
        {!versus && <Leaderboard scores={scores} />}
        {versus && (tally.you > 0 || tally.cpu > 0) && (
          <p className="gc-overlay-note">
            You {tally.you} · Computer {tally.cpu}
          </p>
        )}
      </div>
    )
  } else if (phase === 'paused') {
    overlay = (
      <div className="gc-overlay">
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
        <p className="gc-overlay-title">{title}</p>
        {!result.versus && <p className="gc-overlay-score">{result.score.toLocaleString()} points</p>}
        <p className="gc-overlay-sub">{line}</p>
        <div className="gc-overlay-actions">
          <button className="gc-btn primary" onClick={() => start()}>
            Play again
          </button>
        </div>
        {modePicker}
        {levelPicker}
        {!result.versus && <Leaderboard scores={scores} />}
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

      <div
        ref={stageRef}
        className="gc-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (touch.current = null)}
      >
        <canvas ref={canvasRef} className="gc-canvas" />
        {overlay}
      </div>

      <div className="gc-controls">
        <Pad label="Left" repeat onPress={() => act((g) => move(g, -1))}>
          ◀
        </Pad>
        <Pad label="Right" repeat onPress={() => act((g) => move(g, 1))}>
          ▶
        </Pad>
        <Pad label="Turn" onPress={() => act((g) => rotate(g, 1))} className="gc-pad--turn">
          ⟳
        </Pad>
        <Pad
          label="Faster"
          onPress={() => act((g) => setSoftDrop(g, true))}
          onRelease={() => setSoftDrop(gameRef.current, false)}
        >
          ▼
        </Pad>
        <Pad label="Drop" onPress={() => act((g) => hardDrop(g))}>
          ⤓
        </Pad>
      </div>
    </div>
  )
}
