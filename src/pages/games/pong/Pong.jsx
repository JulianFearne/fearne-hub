// src/pages/games/pong/Pong.jsx
// Portrait Pong for phones held upright: your paddle at the bottom, the
// computer (or a second player) at the top. Rules live in engine.js and the
// drawing in draw.js; this page owns the frame loop, touch and keyboard
// input, the HUD and the start and results screens.
//
// Three modes: Vs computer (Easy, Medium, Hard), Two players on one phone,
// and Wall rally, the only one with a family leaderboard (pong / wall).
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall. There are no on-screen buttons: dragging anywhere in your half moves
// your paddle, which is easier for small fingers than tapping arrows.

import { useEffect, useRef, useState } from 'react'
import Leaderboard from '../lib/Leaderboard'
import { useHighScores } from '../lib/scores'
import { LEVELS, MODES, STEP_MS, WALL_LIVES, WIN_SCORE, WORLD_W, courtHeight, createGame, step } from './engine'
import { drawGame, fitWorld } from './draw'
import './pong.css'

const MODE_KEY = 'pg-mode'
const LEVEL_KEY = 'pg-level'

function load(key, options, fallback) {
  try {
    const v = localStorage.getItem(key)
    return options[v] ? v : fallback
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

function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern)
  } catch {
    // Some browsers throw when vibration isn't allowed yet; never mind.
  }
}

function hudFrom(game) {
  return {
    status: game.status,
    bottom: game.score.bottom,
    top: game.score.top,
    hits: game.hits,
    lives: game.lives,
  }
}

const HOW_TO = {
  cpu: `Slide your finger to move the bottom paddle. Hit the ball past the computer. First to ${WIN_SCORE} wins.`,
  duo: `One player at each end. Drag in your own half to move your paddle. First to ${WIN_SCORE} wins.`,
  wall: `Keep the ball bouncing off the top wall. Every hit scores and the ball gets faster. ${WALL_LIVES} lives.`,
}

export default function Pong() {
  const [mode, setMode] = useState(() => load(MODE_KEY, MODES, 'cpu'))
  const [level, setLevel] = useState(() => load(LEVEL_KEY, LEVELS, 'easy'))
  const [screen, setScreen] = useState('start') // 'start' | 'playing' | 'over'
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState(null)
  const [result, setResult] = useState(null)
  const [wins, setWins] = useState({ you: 0, cpu: 0 }) // this visit only
  const scores = useHighScores('pong', 'wall')

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const pointers = useRef(new Map()) // pointerId => 'bottom' | 'top'
  const targets = useRef({ bottom: null, top: null })
  const keys = useRef(new Set())

  // The frame loop reads these rather than closing over stale state.
  const live = useRef({})
  live.current = { screen, paused, mode, onEnd: finish, makeGame }

  // The court's height suits the stage's shape at the moment a game starts.
  function makeGame() {
    const stage = stageRef.current
    return createGame(mode, level, Math.random, courtHeight(stage?.clientWidth, stage?.clientHeight))
  }

  if (!gameRef.current) gameRef.current = createGame(mode, level)

  // A fresh, unstarted game behind the start screen whenever the choice
  // changes, so the court shows the right paddles.
  useEffect(() => {
    if (screen === 'start') gameRef.current = makeGame()
  }, [mode, level, screen])

  function start() {
    gameRef.current = makeGame()
    pointers.current.clear()
    targets.current = { bottom: null, top: null }
    setResult(null)
    setPaused(false)
    setHud(hudFrom(gameRef.current))
    setScreen('playing')
  }

  async function finish(game) {
    setScreen('over')
    if (game.mode === 'cpu') {
      setWins((w) => (game.winner === 'bottom' ? { ...w, you: w.you + 1 } : { ...w, cpu: w.cpu + 1 }))
    }
    if (game.mode !== 'wall') {
      setResult({ mode: game.mode, winner: game.winner, bottom: game.score.bottom, top: game.score.top })
      return
    }
    const hits = game.hits
    setResult({ mode: 'wall', hits, saving: hits > 0 })
    if (hits > 0) {
      const saved = await scores.submit(hits)
      setResult({ mode: 'wall', hits, saving: false, ...saved })
    }
  }

  function chooseMode(next) {
    save(MODE_KEY, next)
    setMode(next)
    if (screen === 'over') setScreen('start')
  }

  function chooseLevel(next) {
    save(LEVEL_KEY, next)
    setLevel(next)
    if (screen === 'over') setScreen('start')
  }

  // Canvas follows its box at device resolution; the world is letterboxed.
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
      // Nothing in play yet, so the waiting court can reshape freely.
      if (live.current.screen === 'start') gameRef.current = live.current.makeGame()
      if (gameRef.current) drawGame(canvas, gameRef.current)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // One loop for the life of the page, with a fixed timestep so the ball
  // moves the same on a 60Hz and a 120Hz screen.
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastHud = ''
    let endedGame = null

    function keyDir(minus, plus) {
      const k = keys.current
      return (plus.some((x) => k.has(x)) ? 1 : 0) - (minus.some((x) => k.has(x)) ? 1 : 0)
    }

    function frame(now) {
      const dt = Math.min(100, now - last)
      last = now
      const game = gameRef.current
      const { screen: scr, paused: isPaused, mode: m } = live.current
      if (game && scr === 'playing' && !isPaused && game.status !== 'over') {
        acc += dt
        // Two players on a desktop: A/D for the bottom, J/L or the arrows for
        // the top. Alone, the arrows move your own paddle too.
        const duo = m === 'duo'
        const input = {
          bottomTarget: targets.current.bottom,
          topTarget: targets.current.top,
          bottomDir: duo ? keyDir(['a'], ['d']) : keyDir(['a', 'arrowleft', 'j'], ['d', 'arrowright', 'l']),
          topDir: duo ? keyDir(['j', 'arrowleft'], ['l', 'arrowright']) : 0,
        }
        while (acc >= STEP_MS) {
          step(game, input)
          acc -= STEP_MS
        }
        if (game.events.includes('miss')) buzz(game.status === 'over' ? [40, 60, 40] : 35)
        game.events.length = 0
      } else {
        acc = 0
      }
      if (game) {
        drawGame(canvasRef.current, game)
        if (scr === 'playing') {
          const next = hudFrom(game)
          const key = JSON.stringify(next)
          if (key !== lastHud) {
            lastHud = key
            setHud(next)
          }
          if (game.status === 'over' && endedGame !== game) {
            endedGame = game
            live.current.onEnd(game)
          }
        }
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Keyboard, plus pausing when the phone is locked or the tab hidden.
  useEffect(() => {
    const MOVE = ['a', 'd', 'j', 'l', 'arrowleft', 'arrowright']
    function onKeyDown(e) {
      const k = e.key.toLowerCase()
      if (MOVE.includes(k)) {
        keys.current.add(k)
        if (live.current.screen === 'playing') e.preventDefault()
      } else if (k === ' ' || k === 'p' || k === 'escape') {
        if (live.current.screen !== 'playing') return
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    function onKeyUp(e) {
      keys.current.delete(e.key.toLowerCase())
    }
    function onBlur() {
      keys.current.clear()
    }
    function onHide() {
      if (document.hidden && live.current.screen === 'playing') setPaused(true)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Touch: each finger belongs to the half it first landed in, so two
  // players can drag at once without stealing each other's paddle.
  function toWorld(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const { scale, ox, oy } = fitWorld(rect.width, rect.height, gameRef.current.h)
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale }
  }

  function onPointerDown(e) {
    if (screen !== 'playing' || paused) return
    if (e.target !== canvasRef.current) return
    const p = toWorld(e)
    const side = mode === 'duo' && p.y < gameRef.current.h / 2 ? 'top' : 'bottom'
    pointers.current.set(e.pointerId, side)
    targets.current[side] = Math.max(0, Math.min(WORLD_W, p.x))
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-gone pointer: moves still arrive while over the canvas.
    }
  }

  function onPointerMove(e) {
    const side = pointers.current.get(e.pointerId)
    if (!side) return
    targets.current[side] = Math.max(0, Math.min(WORLD_W, toWorld(e).x))
  }

  function onPointerUp(e) {
    const side = pointers.current.get(e.pointerId)
    pointers.current.delete(e.pointerId)
    // The paddle stays where it was left until a finger comes back.
    if (side && ![...pointers.current.values()].includes(side)) targets.current[side] = null
  }

  const playing = screen === 'playing'
  const h = hud ?? hudFrom(gameRef.current)
  const best = scores.myBest

  const modeChips = (
    <div className="pg-chips" role="group" aria-label="Game mode">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} type="button" className={`pg-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )
  const levelChips = mode === 'cpu' && (
    <div className="pg-chips" role="group" aria-label="Difficulty">
      {Object.entries(LEVELS).map(([key, l]) => (
        <button
          key={key}
          type="button"
          className={`pg-chip small ${level === key ? 'active' : ''}`}
          onClick={() => chooseLevel(key)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )

  function resultLine() {
    if (!result) return null
    if (result.mode === 'cpu') {
      return `Wins this visit: you ${wins.you}, computer ${wins.cpu}`
    }
    if (result.mode === 'duo') return 'Swap ends for a rematch?'
    if (result.hits === 0) return 'Slide to meet the ball. You can do it!'
    if (result.saving) return 'Saving…'
    if (result.best) return result.rank ? `New personal best! Number ${result.rank} in the family` : 'New personal best!'
    if (result.rank) return `Number ${result.rank} in the family`
    return 'Keep rallying!'
  }

  function resultTitle() {
    if (result?.mode === 'cpu') return result.winner === 'bottom' ? 'You win!' : 'Computer wins'
    if (result?.mode === 'duo') return result.winner === 'bottom' ? 'Bottom player wins!' : 'Top player wins!'
    return 'Game over'
  }

  return (
    <div className="pg">
      <div className="pg-hud">
        {mode === 'wall' ? (
          <>
            <Stat label="Hits" value={h.hits} />
            <Stat label="Best" value={best ?? '-'} />
            <div className="pg-stat">
              <span className="pg-stat-label">Lives</span>
              <span className="pg-lives" aria-label={`${h.lives} lives left`}>
                {Array.from({ length: WALL_LIVES }, (_, i) => (
                  <span key={i} className={i < h.lives ? 'on' : ''}>
                    ♥
                  </span>
                ))}
              </span>
            </div>
          </>
        ) : mode === 'cpu' ? (
          <>
            <Stat label="You" value={h.bottom} tone="bottom" />
            <Stat label="Computer" value={h.top} tone="top" />
            <Stat label="Wins" value={`${wins.you}-${wins.cpu}`} />
          </>
        ) : (
          <>
            <Stat label="Bottom" value={h.bottom} tone="bottom" />
            <Stat label="Top" value={h.top} tone="top" />
          </>
        )}
        <button
          type="button"
          className="pg-icon-btn"
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => setPaused((p) => !p)}
          disabled={!playing}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      <div
        ref={stageRef}
        className="pg-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="pg-canvas" aria-label="Pong court" />

        {screen === 'start' && (
          <div className="pg-overlay">
            <p className="pg-title">Pong</p>
            <p className="pg-sub">{HOW_TO[mode]}</p>
            {modeChips}
            {levelChips}
            {mode === 'cpu' && level === 'easy' && <p className="pg-note">Easy is just right for little ones.</p>}
            <button type="button" className="pg-btn primary" onClick={start}>
              Start
            </button>
            {mode === 'wall' && <Leaderboard scores={scores} className="pg-board" />}
          </div>
        )}

        {screen === 'over' && result && (
          <div className="pg-overlay">
            {result.mode === 'duo' && <p className="pg-flipped">{resultTitle()}</p>}
            <p className="pg-title">{resultTitle()}</p>
            <p className="pg-score">
              {result.mode === 'wall'
                ? `${result.hits} ${result.hits === 1 ? 'hit' : 'hits'}`
                : `${result.bottom} - ${result.top}`}
            </p>
            <p className="pg-sub">{resultLine()}</p>
            <button type="button" className="pg-btn primary" onClick={start}>
              Play again
            </button>
            {modeChips}
            {levelChips}
            {mode === 'wall' && <Leaderboard scores={scores} className="pg-board" />}
          </div>
        )}

        {paused && playing && (
          <div className="pg-overlay">
            <p className="pg-title">Paused</p>
            <button type="button" className="pg-btn primary" onClick={() => setPaused(false)}>
              Resume
            </button>
            <button
              type="button"
              className="pg-btn"
              onClick={() => {
                setPaused(false)
                setScreen('start')
              }}
            >
              Quit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`pg-stat ${tone ? `pg-stat--${tone}` : ''}`}>
      <span className="pg-stat-label">{label}</span>
      <span className="pg-stat-value">{value}</span>
    </div>
  )
}
