// src/pages/games/wobbly-towers/WobblyStage.jsx
// The play surface both Wobbly Towers modes share: the heads-up display, the
// canvas with its fixed-timestep physics loop, the on-screen and keyboard
// controls, and the power-up button. What sits on top of the canvas (start
// screen, results, lobby messages) comes from the parent through `overlay`.
//
// Props
//   mode          'classic' | 'powerups'
//   options       engine createGame options: { seed, goal, attacks }
//   round         bump to replace the game with a fresh one
//   personalBest  blocks, drawn as a "best" line (solo)
//   rivals        [{ name, height }] drawn up the right edge (online)
//   allowPause    false in races, where the others keep going
//   overlay       (hud, paused) => node drawn over the canvas
//   onGameEnd     (game) => void, once, when the game is over or won
//   onFrame       (game) => void, every frame (throttle it yourself)
//   onAttack      (key) => void, when the player uses an attack power-up
//
// Ref: { start(), restart(), receive(key, fromName), stop() }

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  LIVES,
  POWER_EVERY,
  POWERS,
  STEP_MS,
  WORLD_WIDTH,
  createGame,
  destroyGame,
  powerInfo,
  receiveAttack,
  startGame,
  step,
  towerHeightBlocks,
  usePower as activatePower,
} from './engine'
import { drawGame, drawPreview } from './draw'

const REPEAT_DELAY = 220
const REPEAT_EVERY = 90

let toastId = 0
function makeToast(text, tone = '') {
  toastId += 1
  return { id: toastId, text, tone }
}

function hudFrom(game) {
  return {
    status: game.status,
    lives: game.lives,
    height: towerHeightBlocks(game),
    best: game.best,
    next: game.fog > 0 ? null : game.next,
    power: game.power,
    charge: game.charge,
    ivy: game.ivy,
    slow: game.slow,
    fast: game.fast,
    fog: game.fog,
  }
}

const EMPTY_HUD = { status: 'ready', lives: LIVES, height: 0, best: 0, next: null, power: null, charge: 0, ivy: 0, slow: 0, fast: 0, fog: 0 }

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

const WobblyStage = forwardRef(function WobblyStage(
  { mode, options, round = 0, personalBest = 0, rivals = [], allowPause = true, overlay, onGameEnd, onFrame, onAttack },
  ref,
) {
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState(EMPTY_HUD)
  const [toast, setToast] = useState(null) // { id, text, tone }

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const previewRef = useRef(null)
  const gameRef = useRef(null)
  const pausedRef = useRef(false)
  const viewHeightRef = useRef(WORLD_WIDTH * 1.5)
  const input = useRef({ left: 0, right: 0, rotate: 0 })
  const autoStartRef = useRef(false) // start the next game as soon as it exists
  const [innerRound, setInnerRound] = useState(0)

  // Callbacks and fast-changing props read from refs inside the frame loop.
  const live = useRef({})
  live.current = { personalBest, rivals, onGameEnd, onFrame, onAttack }
  pausedRef.current = paused

  useImperativeHandle(ref, () => ({
    start() {
      const game = gameRef.current
      if (game?.status === 'ready') startGame(game)
      else {
        autoStartRef.current = true
        setInnerRound((r) => r + 1)
      }
      setToast(null)
      setPaused(false)
    },
    restart() {
      autoStartRef.current = true
      setInnerRound((r) => r + 1)
      setToast(null)
      setPaused(false)
    },
    receive(key, fromName) {
      const game = gameRef.current
      if (!game || game.status !== 'playing') return
      receiveAttack(game, key)
      const info = powerInfo(key)
      if (info) setToast(makeToast(`${info.emoji} ${fromName ? `${fromName}: ` : ''}${info.hit}`, 'hit'))
      if (navigator.vibrate) navigator.vibrate([30, 40, 30])
    },
    stop() {
      const game = gameRef.current
      if (game) game.frozen = true
    },
  }))

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
        drawGame(canvas, game, live.current.personalBest, live.current.rivals)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  const optionsKey = JSON.stringify(options ?? {})

  // One game per round (and per mode/options): fixed-timestep physics inside
  // a rAF loop.
  useEffect(() => {
    const game = createGame(viewHeightRef.current, mode, options ?? {})
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
    let ended = false

    function frame(now) {
      const dt = Math.min(100, now - last)
      last = now
      if (!pausedRef.current && !game.frozen && game.status !== 'ready') {
        acc += dt
        while (acc >= STEP_MS) {
          const i = input.current
          step(game, { left: i.left > 0, right: i.right > 0, rotate: i.rotate > 0 })
          if (i.left > 0) i.left -= 1
          if (i.right > 0) i.right -= 1
          if (i.rotate > 0) i.rotate -= 1
          if (game.newMedal && !game.goal) {
            const m = game.newMedal
            setToast(makeToast(`${m.emoji} ${m.label}! ${m.blocks} blocks`))
          }
          if (game.event?.type === 'earned') {
            const p = powerInfo(game.event.power)
            setToast(makeToast(`${p.emoji} ${p.label} ready. Tap it to ${game.event.power in POWERS ? 'use' : 'throw'}`))
          }
          acc -= STEP_MS
        }
      }
      drawGame(canvasRef.current, game, live.current.personalBest, live.current.rivals)
      live.current.onFrame?.(game)

      const next = hudFrom(game)
      const key = JSON.stringify(next)
      if (key !== lastHud) {
        lastHud = key
        setHud(next)
      }
      if ((game.status === 'over' || game.status === 'won') && !ended) {
        ended = true
        live.current.onGameEnd?.(game)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      destroyGame(game)
      gameRef.current = null
    }
    // optionsKey stands in for options so a new object each render doesn't
    // restart the game.
  }, [round, innerRound, mode, optionsKey])

  useEffect(() => {
    if (previewRef.current) drawPreview(previewRef.current, hud.next)
  }, [hud.next])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  function triggerPower() {
    const game = gameRef.current
    if (!game || pausedRef.current) return
    activatePower(game)
    if (game.event?.type !== 'used') return
    const p = powerInfo(game.event.power)
    if (game.event.attack) {
      live.current.onAttack?.(game.event.power)
      setToast(makeToast(`${p.emoji} ${p.label} thrown!`))
    } else {
      setToast(makeToast(`${p.emoji} ${p.hint}`))
    }
  }
  const triggerPowerRef = useRef(triggerPower)
  triggerPowerRef.current = triggerPower
  const allowPauseRef = useRef(allowPause)
  allowPauseRef.current = allowPause

  // Keyboard: left/right (or A/D) to move, up/space/W to rotate, P to pause,
  // E/Shift/Enter to use a power-up.
  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') input.current.left += 1
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') input.current.right += 1
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
        if (!e.repeat) input.current.rotate += 1
      } else if (k === 'p' || k === 'P' || k === 'Escape') {
        if (allowPauseRef.current) setPaused((p) => !p)
      } else if (k === 'e' || k === 'E' || k === 'Shift' || k === 'Enter') triggerPowerRef.current()
      else return
      e.preventDefault()
    }
    function onHide() {
      if (document.hidden && allowPauseRef.current) setPaused(true)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  const playing = hud.status === 'playing'
  const powerMode = mode === 'powerups'
  const held = hud.power ? powerInfo(hud.power) : null
  const heldIsAttack = hud.power && !(hud.power in POWERS)

  return (
    <>
      <div className="wt-hud">
        <div className="wt-stat">
          <span className="wt-stat-label">Height</span>
          <span className="wt-stat-value">
            {hud.height}
            {options?.goal ? <small className="wt-stat-goal">/{options.goal}</small> : null}
          </span>
        </div>
        {!options?.goal && (
          <div className="wt-stat">
            <span className="wt-stat-label">Best</span>
            <span className="wt-stat-value">{Math.max(personalBest, hud.best)}</span>
          </div>
        )}
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
        <canvas ref={previewRef} width={88} height={88} className={`wt-preview ${hud.fog ? 'is-fogged' : ''}`} aria-label="Next piece" />
        {powerMode && (
          <button
            type="button"
            className={`wt-power ${hud.power ? 'is-ready' : ''} ${heldIsAttack ? 'is-attack' : ''}`}
            aria-label={held ? `${heldIsAttack ? 'Throw' : 'Use'} ${held.label}` : `Power-up in ${POWER_EVERY - hud.charge} pieces`}
            onClick={triggerPower}
            disabled={!playing || !hud.power}
            style={{ '--wt-charge': `${(hud.charge / POWER_EVERY) * 100}%` }}
          >
            {held ? held.emoji : <span className="wt-power-count">{POWER_EVERY - hud.charge}</span>}
          </button>
        )}
        {allowPause && (
          <button
            type="button"
            className="wt-icon-btn"
            aria-label={paused ? 'Resume' : 'Pause'}
            onClick={() => setPaused((p) => !p)}
            disabled={!playing}
          >
            {paused ? '▶' : '❚❚'}
          </button>
        )}
      </div>

      <div ref={stageRef} className="wt-stage">
        <canvas ref={canvasRef} className="wt-canvas" />

        {toast && playing && (
          <div className={`wt-toast ${toast.tone === 'hit' ? 'is-hit' : ''}`} key={toast.id}>
            {toast.text}
          </div>
        )}

        {playing && (hud.ivy > 0 || hud.slow > 0 || hud.fast > 0 || hud.fog > 0) && (
          <div className="wt-effects">
            {hud.ivy > 0 && <span>{powerInfo('ivy').emoji} {hud.ivy}</span>}
            {hud.slow > 0 && <span>{powerInfo('slow').emoji} {hud.slow}</span>}
            {hud.fast > 0 && <span>{powerInfo('hurry').emoji} {hud.fast}</span>}
            {hud.fog > 0 && <span>{powerInfo('fog').emoji} {hud.fog}</span>}
          </div>
        )}

        {overlay?.(hud, paused)}

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
    </>
  )
})

export default WobblyStage
