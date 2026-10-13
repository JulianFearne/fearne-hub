// src/pages/games/snake/Snake.jsx
// The classic phone game. Rules in engine.js, drawing in draw.js; this page
// runs the frame loop, the controls (swipe on the board, the big arrow
// buttons, or the keyboard), the start and game-over screens and the family
// high scores (one board per mode, see lib/scoreBoards.js).
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall: board in the middle, arrows underneath, nothing to scroll.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { KIDS_HEARTS, MAZE_FRUIT, MODES, createGame, turn, update } from './engine'
import { SKINS, drawGame } from './draw'
import './snake.css'

const MODE_KEY = 'snk-mode'
const SKIN_KEY = 'snk-skin'
const SWIPE_PX = 22

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

function hudFrom(game) {
  return {
    score: game.score,
    hearts: game.hearts,
    seconds: game.timeLeft == null ? null : Math.ceil(game.timeLeft / 1000),
    level: game.level,
    eaten: game.eaten,
  }
}

const sameHud = (a, b) =>
  a.score === b.score && a.hearts === b.hearts && a.seconds === b.seconds && a.level === b.level && a.eaten === b.eaten

const OVER_TITLE = { wall: 'Bonk!', tail: 'Tangled up!', hearts: 'Well played!', time: "Time's up!" }

export default function Snake() {
  const [mode, setMode] = useState(() => load(MODE_KEY, MODES, 'classic'))
  const [skin, setSkin] = useState(() => load(SKIN_KEY, SKINS, 'green'))
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'paused' | 'over'
  const [hud, setHud] = useState(() => hudFrom(createGame(mode)))
  const [result, setResult] = useState(null) // { score, reason, best, rank, saved }
  const scores = useHighScores('snake', mode)

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const gameRef = useRef(null)
  const phaseRef = useRef(phase)
  const skinRef = useRef(skin)
  const popsRef = useRef([])
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const submitRef = useRef(scores.submit)

  phaseRef.current = phase
  skinRef.current = skin
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

  const finish = useCallback((game) => {
    if (navigator.vibrate) navigator.vibrate(game.overReason === 'time' ? 40 : [60, 40, 60])
    const score = game.score
    // A beat to see what happened before the results cover the board.
    setTimeout(async () => {
      setPhase('over')
      setResult({ score, reason: game.overReason, best: false, rank: null, saved: true, pending: score > 0 })
      if (score > 0) {
        const r = await submitRef.current(score)
        setResult((prev) => (prev && prev.score === score ? { ...prev, ...r, pending: false } : prev))
      }
    }, 650)
  }, [])

  // ---------- frame loop ----------

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last)
      last = now
      const game = gameRef.current
      if (phaseRef.current === 'playing') {
        const events = update(game, dt)
        for (const ev of events) {
          const head = game.snake[0]
          if (ev.type === 'eat') {
            popsRef.current.push({
              x: head.x,
              y: head.y,
              at: now,
              text: `+${ev.value}`,
              colour: ev.kind === 'star' ? '#ffd54f' : '#fff',
            })
            if (navigator.vibrate) navigator.vibrate(ev.kind === 'star' ? 25 : 10)
          } else if (ev.type === 'snip') {
            popsRef.current.push({ x: head.x, y: head.y, at: now, text: 'Oops!', colour: '#ffcdd2' })
            if (navigator.vibrate) navigator.vibrate(50)
          } else if (ev.type === 'level') {
            popsRef.current.push({ x: game.cols / 2 - 0.5, y: game.rows / 2, at: now, text: `Maze ${ev.level + 1}!`, colour: '#fff' })
          } else if (ev.type === 'over') {
            phaseRef.current = 'ending'
            finish(game)
          }
        }
        popsRef.current = popsRef.current.filter((p) => now - p.at < 700)
        const next = hudFrom(game)
        setHud((prev) => (sameHud(prev, next) ? prev : next))
      }

      const { w, h, dpr } = sizeRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && w > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const hint =
          phaseRef.current === 'playing' && !game.moving
            ? game.level > 0
              ? 'Swipe to go again'
              : 'Swipe or tap an arrow to go'
            : null
        drawGame(ctx, game, w, h, { skin: skinRef.current, pops: popsRef.current, now, hint })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [finish])

  // ---------- controls ----------

  const steer = useCallback((dir) => {
    if (phaseRef.current !== 'playing') return
    turn(gameRef.current, dir)
  }, [])

  const pause = useCallback(() => {
    if (phaseRef.current === 'playing') setPhase('paused')
  }, [])

  useEffect(() => {
    const KEYS = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      s: 'down',
      a: 'left',
      d: 'right',
    }
    function onKey(e) {
      const dir = KEYS[e.key] ?? KEYS[e.key?.toLowerCase?.()]
      if (dir) {
        e.preventDefault()
        steer(dir)
      } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        if (phaseRef.current === 'playing') setPhase('paused')
        else if (phaseRef.current === 'paused') setPhase('playing')
      }
    }
    function onHide() {
      if (document.hidden) pause()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [steer, pause])

  // Swipe anywhere on the board. Each time the finger travels far enough
  // it turns and starts measuring again, so one long wiggle can steer
  // several turns.
  const swipe = useRef(null)
  function onPointerDown(e) {
    // Only while playing, so taps on the overlay buttons stay clicks.
    if (phaseRef.current !== 'playing') return
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Older browsers: the swipe just stops at the edge of the board.
    }
  }
  function onPointerMove(e) {
    const s = swipe.current
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  function onPointerUp() {
    swipe.current = null
  }

  // ---------- starting ----------

  function start(nextMode = mode) {
    gameRef.current = createGame(nextMode)
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
    setHud(hudFrom(gameRef.current))
    setResult(null)
    setPhase('ready')
  }

  function chooseSkin(next) {
    save(SKIN_KEY, next)
    setSkin(next)
  }

  // ---------- render ----------

  const modePicker = (
    <div className="snk-modes" role="group" aria-label="Game mode">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} className={`snk-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )

  const skinPicker = (
    <div className="snk-skins" role="group" aria-label="Snake colour">
      {Object.entries(SKINS).map(([key, s]) => (
        <button
          key={key}
          className={`snk-skin ${skin === key ? 'active' : ''}`}
          style={{ background: s.body, borderColor: s.dark }}
          aria-label={s.label}
          aria-pressed={skin === key}
          onClick={() => chooseSkin(key)}
        />
      ))}
    </div>
  )

  let overlay = null
  if (phase === 'ready') {
    overlay = (
      <div className="snk-overlay">
        <p className="snk-overlay-title">🐍 Snake</p>
        {modePicker}
        <p className="snk-overlay-sub">{MODES[mode].blurb}</p>
        {skinPicker}
        <button className="snk-btn primary" onClick={() => start()}>
          Start
        </button>
        <Leaderboard scores={scores} />
      </div>
    )
  } else if (phase === 'paused') {
    overlay = (
      <div className="snk-overlay">
        <p className="snk-overlay-title">Paused</p>
        <div className="snk-overlay-actions">
          <button className="snk-btn primary" onClick={() => setPhase('playing')}>
            Resume
          </button>
          <button className="snk-btn" onClick={() => start()}>
            Restart
          </button>
        </div>
        <button className="snk-link" onClick={() => setPhase('ready')}>
          Change mode
        </button>
      </div>
    )
  } else if (phase === 'over' && result) {
    let line = 'Have another go!'
    if (result.pending) line = 'Saving your score…'
    else if (result.score > 0 && !result.saved) line = "Saved on this phone. It'll go on the family table when you're back online."
    else if (result.best && result.rank === 1) line = 'Top of the family! 👑'
    else if (result.best) line = `New personal best! Number ${result.rank} in the family.`
    else if (result.rank) line = `Your best is ${scores.myBest}. You're number ${result.rank} in the family.`
    overlay = (
      <div className="snk-overlay">
        <p className="snk-overlay-title">{OVER_TITLE[result.reason] ?? 'Game over'}</p>
        <p className="snk-overlay-score">
          {result.score} fruit
        </p>
        <p className="snk-overlay-sub">{line}</p>
        <div className="snk-overlay-actions">
          <button className="snk-btn primary" onClick={() => start()}>
            Play again
          </button>
        </div>
        {modePicker}
        <Leaderboard scores={scores} />
      </div>
    )
  }

  let extra = null
  if (mode === 'kids') {
    extra = (
      <div className="snk-stat">
        <span className="snk-stat-label">Hearts</span>
        <span className="snk-hearts" aria-label={`${hud.hearts} hearts left`}>
          {Array.from({ length: KIDS_HEARTS }, (_, i) => (
            <span key={i} className={i < hud.hearts ? 'on' : ''}>
              ♥
            </span>
          ))}
        </span>
      </div>
    )
  } else if (mode === 'rush') {
    extra = (
      <div className="snk-stat">
        <span className="snk-stat-label">Time</span>
        <span className={`snk-stat-value ${hud.seconds <= 10 ? 'is-low' : ''}`}>{hud.seconds}s</span>
      </div>
    )
  } else if (mode === 'maze') {
    extra = (
      <div className="snk-stat">
        <span className="snk-stat-label">Maze {hud.level + 1}</span>
        <span className="snk-stat-value">
          {hud.eaten}/{MAZE_FRUIT}
        </span>
      </div>
    )
  }

  const pad = (dir, label, symbol) => (
    <button
      type="button"
      className={`snk-pad snk-pad--${dir}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault()
        steer(dir)
      }}
    >
      {symbol}
    </button>
  )

  return (
    <div className={`snk ${mode === 'kids' ? 'snk--kids' : ''}`}>
      <div className="snk-hud">
        <div className="snk-stat">
          <span className="snk-stat-label">Score</span>
          <span className="snk-stat-value">{hud.score}</span>
        </div>
        <div className="snk-stat">
          <span className="snk-stat-label">Best</span>
          <span className="snk-stat-value">{scores.myBest ?? '-'}</span>
        </div>
        {extra}
        <button
          className="snk-icon-btn"
          onClick={pause}
          disabled={phase !== 'playing'}
          aria-label="Pause"
        >
          ❚❚
        </button>
      </div>

      <div
        ref={stageRef}
        className="snk-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="snk-canvas" />
        {overlay}
      </div>

      <div className="snk-controls" aria-label="Arrows">
        {pad('left', 'Left', '◀')}
        <div className="snk-controls-mid">
          {pad('up', 'Up', '▲')}
          {pad('down', 'Down', '▼')}
        </div>
        {pad('right', 'Right', '▶')}
      </div>
    </div>
  )
}
