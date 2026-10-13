// src/pages/games/frogger/Frogger.jsx
// Frogger: hop across the road and the river and fill the five lily pads.
// Rules live in engine.js and the picture in draw.js; this page runs the
// frame loop, turns swipes, taps, the d-pad and keys into hops, and shows the
// HUD, start and game over screens and the family scoreboards.
//
// Two boards: Easy (for the little ones: slow, five lives, no clock, no
// diving turtles, bounced back rather than squashed at the bank) and Classic.
//
// The route is a `fill` route, so the page is exactly one screen tall: the
// canvas takes whatever room is left between the HUD and the d-pad.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard.jsx'
import { MODES, STEP_MS, createGame, hop, startGame, step, timeFraction } from './engine'
import { drawGame } from './draw'
import './frogger.css'

const MODE_KEY = 'fg-mode'
const SWIPE_PX = 22 // a finger moving this far counts as a swipe, not a tap

function loadMode() {
  try {
    const mode = localStorage.getItem(MODE_KEY)
    return MODES[mode] ? mode : 'easy'
  } catch {
    return 'easy'
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Not remembered; Easy is the default next time.
  }
}

function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    // Some browsers throw when vibration isn't allowed yet.
  }
}

function hudFrom(game) {
  return { score: game.score, lives: game.lives, level: game.level, status: game.status }
}

function resultLine(score, res) {
  if (score === 0) return 'Keep hopping, you will get there!'
  if (!res) return 'Saving your score…'
  if (res.best) return 'New personal best!'
  if (res.rank) return `Number ${res.rank} in the family`
  return 'Well hopped!'
}

const KEY_DIRS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
}

const ARROWS = { up: '▲', down: '▼', left: '◀', right: '▶' }

export default function Frogger() {
  const [mode, setMode] = useState(loadMode)
  const scores = useHighScores('frogger', mode)
  const [screen, setScreen] = useState('start') // 'start' | 'playing' | 'over'
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState(() => ({ score: 0, lives: MODES[mode].lives, level: 1, status: 'ready' }))
  const [result, setResult] = useState(null) // { score, level, res }

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const timeBarRef = useRef(null)
  const gameRef = useRef(null)
  const pausedRef = useRef(false)
  const pointer = useRef(null)
  pausedRef.current = paused

  // The latest score hook and screen, read from inside the frame loop.
  const live = useRef({})
  live.current = { scores, screen }

  if (!gameRef.current) gameRef.current = createGame(mode)

  const finish = useCallback((game) => {
    const score = game.score
    setScreen('over')
    setResult({ score, level: game.level, res: null })
    if (score > 0) {
      live.current.scores
        .submit(score)
        .then((res) => setResult((r) => (r && r.score === score ? { ...r, res } : r)))
        .catch(() => setResult((r) => (r ? { ...r, res: { best: false, rank: null } } : r)))
    }
  }, [])

  // Size the canvas to the stage at device resolution; draw.js letterboxes.
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    function resize() {
      const dpr = window.devicePixelRatio || 1
      const { clientWidth: w, clientHeight: h } = stage
      if (!w || !h) return
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      if (gameRef.current) drawGame(canvas, gameRef.current)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // One frame loop for the life of the page; it always draws whatever game
  // is in gameRef, so starting a new game is just swapping the ref.
  useEffect(() => {
    let last = performance.now()
    let acc = 0
    let raf = 0
    let lastHud = ''
    let lastFrac = -1

    function frame(now) {
      const dt = Math.min(100, now - last)
      last = now
      const game = gameRef.current
      if (game && !pausedRef.current) {
        acc += dt
        while (acc >= STEP_MS) {
          step(game, STEP_MS)
          acc -= STEP_MS
        }
        while (game.events.length) {
          const ev = game.events.shift()
          if (ev === 'die') buzz(80)
          else if (ev === 'level') buzz([40, 60, 40])
          else if (ev === 'over') finish(game)
        }
      }
      if (game) {
        drawGame(canvasRef.current, game)
        const next = hudFrom(game)
        const key = JSON.stringify(next)
        if (key !== lastHud) {
          lastHud = key
          setHud(next)
        }
        const bar = timeBarRef.current
        const frac = Math.round(timeFraction(game) * 200) / 200
        if (bar && frac !== lastFrac) {
          lastFrac = frac
          bar.style.transform = `scaleX(${frac})`
          bar.classList.toggle('is-low', frac < 0.25)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [finish])

  const doHop = useCallback((dir) => {
    const game = gameRef.current
    if (!game || pausedRef.current || game.status !== 'playing') return
    hop(game, dir)
  }, [])

  // Keys, and pausing when the page is hidden.
  useEffect(() => {
    function onKeyDown(e) {
      const dir = KEY_DIRS[e.key]
      if (dir) {
        e.preventDefault()
        if (!e.repeat) doHop(dir)
        return
      }
      if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (live.current.screen !== 'playing') return
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    function onHide() {
      if (document.hidden && live.current.screen === 'playing') setPaused(true)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [doHop])

  function play() {
    const game = createGame(mode)
    startGame(game)
    gameRef.current = game
    setResult(null)
    setPaused(false)
    setScreen('playing')
  }

  function chooseMode(next) {
    if (next === mode) return
    saveMode(next)
    setMode(next)
    // On the start screen the river behind the menu shows the new mode.
    if (screen === 'start') gameRef.current = createGame(next)
  }

  // Swipes hop as soon as the finger has moved far enough, so a quick flick
  // feels instant; a touch that barely moves is a tap, which hops forward.
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false }
  }
  function swipeDir(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
    return dy > 0 ? 'down' : 'up'
  }
  function onPointerMove(e) {
    const p = pointer.current
    if (!p || p.id !== e.pointerId || p.done) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.hypot(dx, dy) >= SWIPE_PX) {
      p.done = true
      doHop(swipeDir(dx, dy))
    }
  }
  function onPointerUp(e) {
    const p = pointer.current
    if (!p || p.id !== e.pointerId) return
    pointer.current = null
    if (p.done) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    doHop(Math.hypot(dx, dy) >= SWIPE_PX / 2 ? swipeDir(dx, dy) : 'up')
  }

  function padPress(dir) {
    return (e) => {
      e.preventDefault()
      doHop(dir)
    }
  }

  const cfg = MODES[mode]
  const playing = screen === 'playing'
  const maxLives = playing || screen === 'over' ? MODES[gameRef.current?.mode ?? mode].lives : cfg.lives
  const showTimer = !!MODES[gameRef.current?.mode ?? mode].timer

  const modePicker = (
    <div className="fg-modes" role="group" aria-label="Game mode">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} type="button" className={`fg-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="fg">
      <div className="fg-hud">
        <div className="fg-stat">
          <span className="fg-stat-label">Score</span>
          <span className="fg-stat-value">{hud.score}</span>
        </div>
        <div className="fg-stat">
          <span className="fg-stat-label">Best</span>
          <span className="fg-stat-value">{scores.myBest ?? '-'}</span>
        </div>
        <div className="fg-stat">
          <span className="fg-stat-label">Level</span>
          <span className="fg-stat-value">{hud.level}</span>
        </div>
        <div className="fg-stat">
          <span className="fg-stat-label">Lives</span>
          <span className="fg-lives" aria-label={`${hud.lives} lives left`}>
            {Array.from({ length: maxLives }, (_, i) => (
              <span key={i} className={i < hud.lives ? 'on' : ''}>
                ●
              </span>
            ))}
          </span>
        </div>
        <button
          type="button"
          className="fg-icon-btn"
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => setPaused((p) => !p)}
          disabled={!playing}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      {showTimer && (
        <div className="fg-timer" aria-hidden="true">
          <span ref={timeBarRef} className="fg-timer-fill" />
        </div>
      )}

      <div
        ref={stageRef}
        className="fg-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointer.current = null)}
      >
        <canvas ref={canvasRef} className="fg-canvas" aria-label="Frogger play area" />

        {screen === 'start' && (
          <div className="fg-overlay" onPointerDown={(e) => e.stopPropagation()}>
            <p className="fg-overlay-title">Frogger</p>
            <p className="fg-overlay-sub">
              Hop over the road and across the river on logs and turtles. Get a frog home to all five lily pads.
            </p>
            <p className="fg-overlay-note">Swipe or tap the play area, or use the arrows below.</p>
            {modePicker}
            <button type="button" className="fg-btn primary" onClick={play}>
              Start
            </button>
            <Leaderboard scores={scores} />
          </div>
        )}

        {screen === 'over' && result && (
          <div className="fg-overlay" onPointerDown={(e) => e.stopPropagation()}>
            <p className="fg-overlay-title">Game over</p>
            <p className="fg-overlay-score">{result.score} points</p>
            <p className="fg-overlay-sub">
              {resultLine(result.score, result.res)} {result.level > 1 ? `(reached level ${result.level})` : ''}
            </p>
            <button type="button" className="fg-btn primary" onClick={play}>
              Play again
            </button>
            {modePicker}
            <Leaderboard scores={scores} />
          </div>
        )}

        {paused && playing && (
          <div className="fg-overlay" onPointerDown={(e) => e.stopPropagation()}>
            <p className="fg-overlay-title">Paused</p>
            <button type="button" className="fg-btn primary" onClick={() => setPaused(false)}>
              Resume
            </button>
          </div>
        )}
      </div>

      <div className="fg-pad-grid">
        {['up', 'left', 'right', 'down'].map((dir) => (
          <button
            key={dir}
            type="button"
            className={`fg-pad fg-pad--${dir}`}
            aria-label={`Hop ${dir}`}
            onPointerDown={padPress(dir)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {ARROWS[dir]}
          </button>
        ))}
      </div>
    </div>
  )
}
