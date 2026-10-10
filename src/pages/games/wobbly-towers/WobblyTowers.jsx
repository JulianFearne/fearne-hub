// src/pages/games/wobbly-towers/WobblyTowers.jsx
// Offline single-player physics stacker in the style of Tricky Towers. The
// physics and rules live in engine.js (matter-js), drawing in draw.js; this
// component owns the frame loop, input (keyboard and on-screen buttons), the
// heads-up display and the scoreboard.
//
// Endless: the score is the tallest the tower stood before three pieces fell
// off. Medals at set heights. The top 10 scores live in localStorage, so the
// scoreboard is per device, with the signed-in person's name on each entry.
//
// The route is marked `fill` in App.jsx, so the hub body is exactly one screen
// tall and the game stretches into it: no scrolling to reach the controls.

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import {
  LIVES,
  MEDALS,
  STEP_MS,
  WORLD_WIDTH,
  createGame,
  destroyGame,
  medalFor,
  startGame,
  step,
  towerHeightBlocks,
} from './engine'
import { drawGame, drawPreview } from './draw'
import './wobbly-towers.css'

const SCORES_KEY = 'wt-scores'
const MAX_SCORES = 10
const REPEAT_DELAY = 220
const REPEAT_EVERY = 90

function loadScores() {
  try {
    const scores = JSON.parse(localStorage.getItem(SCORES_KEY))
    return Array.isArray(scores) ? scores : []
  } catch {
    return []
  }
}

function saveScores(scores) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores))
  } catch {
    // Private browsing or storage full: the scoreboard just won't stick.
  }
}

// Adds a score and returns { scores, rank } with rank 0-based, or -1 if it
// didn't make the top 10.
function addScore(scores, entry) {
  const all = [...scores, entry].sort((a, b) => b.score - a.score || a.at - b.at)
  const top = all.slice(0, MAX_SCORES)
  return { scores: top, rank: top.indexOf(entry) }
}

function hudFrom(game) {
  return {
    status: game.status,
    lives: game.lives,
    height: towerHeightBlocks(game),
    best: game.best,
    next: game.next,
  }
}

function Scoreboard({ scores, highlight = -1 }) {
  if (scores.length === 0) return <p className="wt-board-empty">No scores yet. Be the first!</p>
  return (
    <ol className="wt-board">
      {scores.map((s, i) => {
        const medal = medalFor(s.score)
        return (
          <li key={`${s.at}-${i}`} className={i === highlight ? 'is-new' : ''}>
            <span className="wt-board-rank">{i + 1}</span>
            <span className="wt-board-name">{s.name}</span>
            <span className="wt-board-medal">{medal ? medal.emoji : ''}</span>
            <span className="wt-board-score">{s.score}</span>
          </li>
        )
      })}
    </ol>
  )
}

// A button that fires once on press and, if `repeat`, keeps firing while held.
function HoldButton({ label, children, onPress, repeat = false }) {
  const timers = useRef([])

  function stop() {
    timers.current.forEach(clearTimeout)
    timers.current = []
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
  const { profile, user } = useAuth()
  const [round, setRound] = useState(0) // bump for a fresh game
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState({ status: 'ready', lives: LIVES, height: 0, best: 0, next: null })
  const [scores, setScores] = useState(loadScores)
  const [result, setResult] = useState(null) // { score, rank } after a game
  const [toast, setToast] = useState(null) // medal just reached

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const previewRef = useRef(null)
  const gameRef = useRef(null)
  const pausedRef = useRef(false)
  const viewHeightRef = useRef(WORLD_WIDTH * 1.5)
  const scoresRef = useRef(scores)
  const nameRef = useRef('')
  const input = useRef({ left: 0, right: 0, rotate: 0 })
  const autoStartRef = useRef(false) // start the next game as soon as it exists

  pausedRef.current = paused
  scoresRef.current = scores
  nameRef.current = displayName(profile, user?.email)
  const personalBest = scores.reduce((m, s) => Math.max(m, s.score), 0)
  const bestRef = useRef(personalBest)
  bestRef.current = personalBest

  // Size the canvas to fill the stage. The world is always 12 blocks wide, so
  // a taller phone simply sees more of the tower.
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
      viewHeightRef.current = (WORLD_WIDTH * h) / w
      const game = gameRef.current
      if (game) {
        game.viewHeight = viewHeightRef.current
        drawGame(canvas, game, bestRef.current)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // One game per round: fixed-timestep physics inside a rAF loop.
  useEffect(() => {
    const game = createGame(viewHeightRef.current)
    gameRef.current = game
    if (autoStartRef.current) {
      autoStartRef.current = false
      startGame(game)
    }
    input.current = { left: 0, right: 0, rotate: 0 }
    let last = performance.now()
    let acc = 0
    let raf = 0
    let lastHud = ''
    let recorded = false

    function frame(now) {
      const dt = Math.min(100, now - last)
      last = now
      if (!pausedRef.current && game.status !== 'ready') {
        acc += dt
        while (acc >= STEP_MS) {
          const i = input.current
          step(game, { left: i.left > 0, right: i.right > 0, rotate: i.rotate > 0 })
          if (i.left > 0) i.left -= 1
          if (i.right > 0) i.right -= 1
          if (i.rotate > 0) i.rotate -= 1
          if (game.newMedal) setToast(game.newMedal)
          acc -= STEP_MS
        }
      }
      drawGame(canvasRef.current, game, bestRef.current)

      const next = hudFrom(game)
      const key = JSON.stringify(next)
      if (key !== lastHud) {
        lastHud = key
        setHud(next)
      }
      if (game.status === 'over' && !recorded) {
        recorded = true
        const score = game.best
        if (score > 0) {
          const added = addScore(scoresRef.current, { name: nameRef.current, score, at: Date.now() })
          saveScores(added.scores)
          setScores(added.scores)
          setResult({ score, rank: added.rank })
        } else {
          setResult({ score, rank: -1 })
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
  }, [round])

  useEffect(() => {
    if (previewRef.current) drawPreview(previewRef.current, hud.next)
  }, [hud.next])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  // Keyboard: left/right (or A/D) to move, up/space/W to rotate, P to pause.
  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.current.left += 1
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.current.right += 1
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
        if (!e.repeat) input.current.rotate += 1
      } else if (k === 'p' || k === 'P' || k === 'Escape') setPaused((p) => !p)
      else return
      e.preventDefault()
    }
    function onHide() {
      if (document.hidden) setPaused(true)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  function play() {
    const game = gameRef.current
    if (game?.status === 'ready') {
      startGame(game)
    } else {
      autoStartRef.current = true
      setRound((r) => r + 1)
    }
    setResult(null)
    setToast(null)
    setPaused(false)
  }

  const playing = hud.status === 'playing'
  const lifetimeMedal = medalFor(personalBest)

  return (
    <div className="wt">
      <div className="wt-hud">
        <div className="wt-stat">
          <span className="wt-stat-label">Height</span>
          <span className="wt-stat-value">{hud.height}</span>
        </div>
        <div className="wt-stat">
          <span className="wt-stat-label">Best</span>
          <span className="wt-stat-value">{Math.max(personalBest, hud.best)}</span>
        </div>
        <div className="wt-stat">
          <span className="wt-stat-label">Lives</span>
          <span className="wt-lives" aria-label={`${hud.lives} lives left`}>
            {Array.from({ length: LIVES }, (_, i) => (
              <span key={i} className={i < hud.lives ? 'on' : ''}>
                ♥
              </span>
            ))}
          </span>
        </div>
        <canvas ref={previewRef} width={88} height={88} className="wt-preview" aria-label="Next piece" />
        <button
          type="button"
          className="wt-icon-btn"
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => setPaused((p) => !p)}
          disabled={!playing}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      <div ref={stageRef} className="wt-stage">
        <canvas ref={canvasRef} className="wt-canvas" />

        {toast && playing && (
          <div className="wt-toast" key={toast.key}>
            {toast.emoji} {toast.label}! {toast.blocks} blocks
          </div>
        )}

        {hud.status === 'ready' && (
          <div className="wt-overlay">
            <p className="wt-overlay-title">Wobbly Towers</p>
            <p className="wt-overlay-sub">
              Steer and turn the falling pieces to build as high as you can. Three pieces off the edge and it's over.
            </p>
            <p className="wt-medals">
              {MEDALS.map((m) => (
                <span key={m.key} className={personalBest >= m.blocks ? 'won' : ''} title={`${m.label}: ${m.blocks} blocks`}>
                  {m.emoji}
                  <small>{m.blocks}</small>
                </span>
              ))}
            </p>
            <button className="wt-btn primary" onClick={play}>
              Start
            </button>
            <Scoreboard scores={scores} />
          </div>
        )}

        {hud.status === 'over' && result && (
          <div className="wt-overlay">
            <p className="wt-overlay-title">Timber!</p>
            <p className="wt-overlay-score">
              {result.score} {result.score === 1 ? 'block' : 'blocks'}
              {medalFor(result.score) ? ` ${medalFor(result.score).emoji}` : ''}
            </p>
            <p className="wt-overlay-sub">
              {result.rank === 0 && scores.length > 1
                ? 'New top score!'
                : result.rank >= 0
                  ? `Number ${result.rank + 1} on the scoreboard`
                  : lifetimeMedal
                    ? `Best so far: ${personalBest} ${lifetimeMedal.emoji}`
                    : 'Keep stacking!'}
            </p>
            <button className="wt-btn primary" onClick={play}>
              Play again
            </button>
            <Scoreboard scores={scores} highlight={result.rank} />
          </div>
        )}

        {paused && playing && (
          <div className="wt-overlay">
            <p className="wt-overlay-title">Paused</p>
            <button className="wt-btn primary" onClick={() => setPaused(false)}>
              Resume
            </button>
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
        <HoldButton label="Move right" repeat onPress={() => (input.current.right += 1)}>
          ▶
        </HoldButton>
      </div>
    </div>
  )
}
