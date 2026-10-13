// src/pages/games/car-dodge/CarDodge.jsx
// Car Dodge: drive up a three lane road, swap lanes to miss the traffic and
// pick up coins. The rules live in engine.js and the art in draw.js; this page
// runs the frame loop, the controls, the HUD and the overlays (start screen,
// pause, game over with the family leaderboard).
//
// Two modes, each with its own family board: Easy (slow, three lives, a crash
// just costs a heart) for the little ones, and Normal (faster, one life).
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall: HUD on top, the road in the middle, the big lane buttons underneath.

import { useEffect, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { boardInfo } from '../lib/scoreBoards'
import { MODES, STEP_MS, createGame, startGame, steer, step, takeEvents } from './engine'
import { drawGame } from './draw'
import './car-dodge.css'

const GAME_KEY = 'car-dodge'
const MODE_KEY = 'cd-mode'
const SWIPE_PX = 28 // a finger has to travel this far sideways to count as a swipe

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
    // Not remembered; Easy again next time.
  }
}

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Some browsers throw rather than ignore it; a missing buzz is fine.
  }
}

const MODE_NOTES = {
  easy: 'Three lives and gentle traffic. Great for little drivers.',
  normal: 'Faster and busier. One crash and it is over.',
}

export default function CarDodge() {
  const [mode, setMode] = useState(loadMode)
  const scores = useHighScores(GAME_KEY, mode)
  const [hud, setHud] = useState({ status: 'ready', score: 0, lives: MODES[mode].lives })
  const [paused, setPaused] = useState(false)
  const [result, setResult] = useState(null) // { score, coins, line }
  const [round, setRound] = useState(0)

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const pausedRef = useRef(false)
  const autoStartRef = useRef(false)
  const pointer = useRef(null) // { id, x, y, swiped } for the finger on the road

  // Read inside the frame loop, which only restarts per game.
  const live = useRef({})
  live.current = { submit: scores.submit, mode }
  pausedRef.current = paused

  function move(dir) {
    const game = gameRef.current
    if (!game || pausedRef.current) return
    steer(game, dir)
  }

  // Fit the canvas to the stage at full device resolution; draw.js scales the
  // fixed-size world into whatever shape it gets.
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

  // One game per round and mode, stepped on a fixed timestep inside rAF.
  useEffect(() => {
    const game = createGame(mode)
    gameRef.current = game
    if (autoStartRef.current) {
      autoStartRef.current = false
      startGame(game)
    }
    let last = performance.now()
    let acc = 0
    let raf = 0
    let lastHud = ''
    let ended = false

    function frame(now) {
      const dt = Math.min(100, now - last)
      last = now
      if (!pausedRef.current && game.status !== 'ready' && game.status !== 'over') {
        acc += dt
        while (acc >= STEP_MS) {
          step(game, STEP_MS)
          acc -= STEP_MS
        }
        for (const e of takeEvents(game)) {
          if (e === 'crash') buzz(game.lives > 0 ? 80 : [60, 40, 140])
        }
      }
      drawGame(canvasRef.current, game)

      const next = { status: game.status, score: game.score, lives: game.lives }
      const key = `${next.status}|${next.score}|${next.lives}`
      if (key !== lastHud) {
        lastHud = key
        setHud(next)
      }
      if (game.status === 'over' && !ended) {
        ended = true
        finish(game)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      gameRef.current = null
    }
  }, [mode, round])

  async function finish(game) {
    const { score, coins } = game
    setResult({ score, coins, line: score > 0 ? 'Saving your score…' : 'Have another go!' })
    if (score <= 0) return
    try {
      const { best, rank } = await live.current.submit(score)
      const line = best ? 'New personal best!' : rank ? `Number ${rank} in the family` : 'Good driving!'
      setResult((r) => (r && r.score === score ? { ...r, line } : r))
    } catch {
      setResult((r) => (r && r.score === score ? { ...r, line: 'Good driving!' } : r))
    }
  }

  // Keyboard on desktop: arrows or A/D to change lane, P, Space or Escape to
  // pause. Holding a key doesn't repeat, so it's always one lane per press.
  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key
      const status = gameRef.current?.status
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        if (!e.repeat) move(-1)
      } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        if (!e.repeat) move(1)
      } else if (k === 'p' || k === 'P' || k === 'Escape' || k === ' ') {
        if (status !== 'playing') return
        setPaused((p) => !p)
      } else return
      e.preventDefault()
    }
    function onHide() {
      if (document.hidden && gameRef.current?.status === 'playing') setPaused(true)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Finger on the road: a swipe moves as soon as it's far enough, otherwise a
  // tap moves towards whichever half of the road was tapped.
  function onPointerDown(e) {
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, swiped: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events can't be captured; the gesture still works.
    }
  }
  function onPointerMove(e) {
    const p = pointer.current
    if (!p || p.id !== e.pointerId || p.swiped) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      p.swiped = true
      move(Math.sign(dx))
    }
  }
  function onPointerUp(e) {
    const p = pointer.current
    pointer.current = null
    if (!p || p.id !== e.pointerId || p.swiped) return
    if (Math.abs(e.clientX - p.x) > SWIPE_PX || Math.abs(e.clientY - p.y) > SWIPE_PX * 2) return
    const rect = e.currentTarget.getBoundingClientRect()
    move(e.clientX < rect.left + rect.width / 2 ? -1 : 1)
  }

  function play() {
    setResult(null)
    setPaused(false)
    const game = gameRef.current
    if (game?.status === 'ready') {
      startGame(game)
    } else {
      autoStartRef.current = true
      setRound((r) => r + 1)
    }
  }

  function chooseMode(next) {
    if (next === mode) return
    saveMode(next)
    setMode(next)
    setResult(null)
    setPaused(false)
  }

  const status = hud.status
  const playing = status === 'playing'
  const info = boardInfo(GAME_KEY, mode)

  const modePicker = (
    <div className="cd-modes" role="group" aria-label="Game mode">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} type="button" className={`cd-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )

  let overlay = null
  if (status === 'ready') {
    overlay = (
      <div className="cd-overlay">
        <p className="cd-overlay-title">🚗 Car Dodge</p>
        <p className="cd-overlay-sub">Tap or swipe left and right to change lanes. Dodge the traffic and grab the coins!</p>
        {modePicker}
        <p className="cd-overlay-note">{MODE_NOTES[mode]}</p>
        <button type="button" className="cd-btn primary" onClick={play}>
          Start
        </button>
        <Leaderboard scores={scores} className="cd-board" />
      </div>
    )
  } else if (status === 'over' && result) {
    overlay = (
      <div className="cd-overlay">
        <p className="cd-overlay-title">Crash!</p>
        <p className="cd-overlay-score">{info.format(result.score)}</p>
        <p className="cd-overlay-sub">
          {result.coins > 0 && (
            <>
              {result.coins} {result.coins === 1 ? 'coin' : 'coins'} collected.{' '}
            </>
          )}
          {result.line}
        </p>
        <button type="button" className="cd-btn primary" onClick={play}>
          Play again
        </button>
        {modePicker}
        <Leaderboard scores={scores} className="cd-board" />
      </div>
    )
  } else if (paused && playing) {
    overlay = (
      <div className="cd-overlay">
        <p className="cd-overlay-title">Paused</p>
        <button type="button" className="cd-btn primary" onClick={() => setPaused(false)}>
          Resume
        </button>
      </div>
    )
  }

  const maxLives = MODES[mode].lives

  return (
    <div className="cd">
      <div className="cd-hud">
        <div className="cd-stat">
          <span className="cd-stat-label">Score</span>
          <span className="cd-stat-value">{hud.score}</span>
        </div>
        <div className="cd-stat">
          <span className="cd-stat-label">Best</span>
          <span className="cd-stat-value">{scores.myBest ?? '-'}</span>
        </div>
        {maxLives > 1 && (
          <div className="cd-stat">
            <span className="cd-stat-label">Lives</span>
            <span className="cd-lives" aria-label={`${hud.lives} lives left`}>
              {Array.from({ length: maxLives }, (_, i) => (
                <span key={i} className={i < hud.lives ? 'on' : ''}>
                  ♥
                </span>
              ))}
            </span>
          </div>
        )}
        <button
          type="button"
          className="cd-icon-btn"
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => setPaused((p) => !p)}
          disabled={!playing}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      <div ref={stageRef} className="cd-stage">
        <canvas
          ref={canvasRef}
          className="cd-canvas"
          aria-label="Road. Tap the left or right side to change lanes."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (pointer.current = null)}
          onContextMenu={(e) => e.preventDefault()}
        />
        {overlay}
      </div>

      <div className="cd-controls">
        <button
          type="button"
          className="cd-pad"
          aria-label="Move left"
          onPointerDown={(e) => {
            e.preventDefault()
            move(-1)
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          ◀
        </button>
        <button
          type="button"
          className="cd-pad"
          aria-label="Move right"
          onPointerDown={(e) => {
            e.preventDefault()
            move(1)
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          ▶
        </button>
      </div>
    </div>
  )
}
