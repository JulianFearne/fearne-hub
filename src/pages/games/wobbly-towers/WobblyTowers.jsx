// src/pages/games/wobbly-towers/WobblyTowers.jsx
// Offline single-player physics stacker in the style of Tricky Towers. The
// physics and rules live in engine.js (matter-js), drawing in draw.js; this
// component owns the frame loop, input (keyboard and on-screen buttons) and
// the heads-up display. Best times per difficulty are kept in localStorage.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DIFFICULTIES,
  LIVES,
  STEP_MS,
  VIEW_HEIGHT,
  WORLD_WIDTH,
  createGame,
  destroyGame,
  step,
  towerHeightBlocks,
} from './engine'
import { drawGame, drawPreview } from './draw'
import './wobbly-towers.css'

const BEST_KEY = 'wt-best-times'
const REPEAT_DELAY = 220
const REPEAT_EVERY = 90

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || {}
  } catch {
    return {}
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best))
  } catch {
    // Private browsing or storage full: best times just won't stick.
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function hudFrom(game) {
  return {
    lives: game.lives,
    height: Math.floor(towerHeightBlocks(game) * 2) / 2,
    time: Math.floor(game.elapsed * 10) / 10,
    status: game.status,
    next: game.next,
  }
}

// A button that fires once on press and keeps firing while held.
function HoldButton({ label, children, onPress, onRelease, repeat = false }) {
  const timers = useRef([])

  function stop() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    onRelease?.()
  }

  function start(e) {
    e.preventDefault()
    try {
      // Keeps the release coming here even if the finger slides off.
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Not a live pointer (some synthetic events); the press still counts.
    }
    onPress()
    if (repeat) {
      const delay = setTimeout(() => {
        timers.current.push(setInterval(onPress, REPEAT_EVERY))
      }, REPEAT_DELAY)
      timers.current.push(delay)
    }
  }

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <button
      type="button"
      className="wt-pad"
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

export default function WobblyTowers() {
  const [difficulty, setDifficulty] = useState('easy')
  const [round, setRound] = useState(0) // bump to restart
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ lives: LIVES, height: 0, time: 0, status: 'playing', next: null })
  const [best, setBest] = useState(loadBest)
  const [newBest, setNewBest] = useState(false)

  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const previewRef = useRef(null)
  const gameRef = useRef(null)
  const pausedRef = useRef(false)
  const input = useRef({ left: 0, right: 0, rotate: 0, fast: false })

  const bestRef = useRef(best)

  pausedRef.current = paused
  bestRef.current = best

  // Keep the canvas sharp and sized to its container.
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    function resize() {
      const dpr = window.devicePixelRatio || 1
      const width = wrap.clientWidth
      const height = (width * VIEW_HEIGHT) / WORLD_WIDTH
      canvas.style.height = `${height}px`
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      if (gameRef.current) drawGame(canvas, gameRef.current)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // One game per round: fixed-timestep physics inside a rAF loop.
  useEffect(() => {
    const game = createGame(difficulty)
    gameRef.current = game
    input.current = { left: 0, right: 0, rotate: 0, fast: false }
    setNewBest(false)
    let last = performance.now()
    let acc = 0
    let raf = 0
    let lastHud = ''
    let recorded = false

    function frame(now) {
      const dt = Math.min(100, now - last)
      last = now
      if (!pausedRef.current) {
        acc += dt
        while (acc >= STEP_MS) {
          const i = input.current
          step(game, { left: i.left > 0, right: i.right > 0, rotate: i.rotate > 0, fast: i.fast })
          if (i.left > 0) i.left -= 1
          if (i.right > 0) i.right -= 1
          if (i.rotate > 0) i.rotate -= 1
          acc -= STEP_MS
        }
      }
      drawGame(canvasRef.current, game)

      const next = hudFrom(game)
      const key = JSON.stringify(next)
      if (key !== lastHud) {
        lastHud = key
        setHud(next)
      }
      if (game.status === 'won' && !recorded) {
        recorded = true
        const old = bestRef.current[difficulty]
        if (old == null || game.elapsed < old) {
          const updated = { ...bestRef.current, [difficulty]: game.elapsed }
          saveBest(updated)
          setBest(updated)
          setNewBest(true)
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      destroyGame(game)
      gameRef.current = null
    }
  }, [difficulty, round])

  useEffect(() => {
    if (previewRef.current) drawPreview(previewRef.current, hud.next)
  }, [hud.next])

  // Keyboard: arrows or WASD, space/up to rotate, down to drop faster, P to pause.
  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.current.left += 1
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.current.right += 1
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
        if (!e.repeat) input.current.rotate += 1
      } else if (k === 'ArrowDown' || k === 's' || k === 'S') input.current.fast = true
      else if (k === 'p' || k === 'P' || k === 'Escape') setPaused((p) => !p)
      else return
      e.preventDefault()
    }
    function onKeyUp(e) {
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') input.current.fast = false
    }
    function onHide() {
      if (document.hidden) setPaused(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  function restart(nextDifficulty = difficulty) {
    setDifficulty(nextDifficulty)
    setPaused(false)
    setRound((r) => r + 1)
  }

  const goal = DIFFICULTIES[difficulty].goalBlocks
  const over = hud.status !== 'playing'

  return (
    <div className="wt">
      <header className="wt-header">
        <Link to="/games" className="wt-back">
          ← Games
        </Link>
        <h1 className="wt-title">Wobbly Towers</h1>
      </header>

      <div className="wt-panel">
        <div className="wt-difficulty">
          {Object.entries(DIFFICULTIES).map(([key, d]) => (
            <button
              key={key}
              className={`wt-chip ${difficulty === key ? 'active' : ''}`}
              onClick={() => restart(key)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="wt-hud">
          <div className="wt-stat">
            <span className="wt-stat-label">Lives</span>
            <span className="wt-lives" aria-label={`${hud.lives} lives left`}>
              {Array.from({ length: LIVES }, (_, i) => (
                <span key={i} className={i < hud.lives ? 'on' : ''}>♥</span>
              ))}
            </span>
          </div>
          <div className="wt-stat">
            <span className="wt-stat-label">Height</span>
            <span className="wt-stat-value">
              {hud.height} / {goal}
            </span>
          </div>
          <div className="wt-stat">
            <span className="wt-stat-label">Time</span>
            <span className="wt-stat-value">{formatTime(hud.time)}</span>
          </div>
          <div className="wt-stat wt-next">
            <span className="wt-stat-label">Next</span>
            <canvas ref={previewRef} width={56} height={56} className="wt-preview" />
          </div>
        </div>

        <div ref={wrapRef} className="wt-stage">
          <canvas ref={canvasRef} className="wt-canvas" />
          {(over || paused) && (
            <div className="wt-overlay">
              {hud.status === 'won' && (
                <>
                  <p className="wt-overlay-title">You made it! 🎉</p>
                  <p className="wt-overlay-sub">
                    {formatTime(hud.time)}
                    {newBest ? ' · new best!' : best[difficulty] != null ? ` · best ${formatTime(best[difficulty])}` : ''}
                  </p>
                </>
              )}
              {hud.status === 'lost' && (
                <>
                  <p className="wt-overlay-title">Timber!</p>
                  <p className="wt-overlay-sub">Out of lives at {hud.height} blocks high.</p>
                </>
              )}
              {!over && paused && <p className="wt-overlay-title">Paused</p>}
              <div className="wt-overlay-actions">
                {!over && (
                  <button className="wt-btn primary" onClick={() => setPaused(false)}>
                    Resume
                  </button>
                )}
                <button className={`wt-btn ${over ? 'primary' : ''}`} onClick={() => restart()}>
                  {over ? 'Play again' : 'Restart'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="wt-controls">
          <HoldButton label="Move left" repeat onPress={() => (input.current.left += 1)}>
            ◀
          </HoldButton>
          <HoldButton label="Rotate" onPress={() => (input.current.rotate += 1)}>
            ⟳
          </HoldButton>
          <HoldButton
            label="Drop faster"
            onPress={() => (input.current.fast = true)}
            onRelease={() => (input.current.fast = false)}
          >
            ▼
          </HoldButton>
          <HoldButton label="Move right" repeat onPress={() => (input.current.right += 1)}>
            ▶
          </HoldButton>
        </div>

        <div className="wt-footer">
          <p className="wt-help">
            Stack the pieces past the finish line and keep them there for 3 seconds. A piece lets go as soon as it
            touches anything. Drop three off the edge and it's over. Keys: arrows to move, up or space to rotate, down to
            drop faster, P to pause.
          </p>
          {!over && (
            <button className="wt-btn" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>

        {Object.keys(best).length > 0 && (
          <p className="wt-best">
            Best times:{' '}
            {Object.entries(DIFFICULTIES)
              .filter(([key]) => best[key] != null)
              .map(([key, d]) => `${d.label} ${formatTime(best[key])}`)
              .join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
