// src/pages/games/gravity-well/GravityWell.jsx
// Gravity Well, after the 1995 Windows game by Software Engineering, Inc.
// Fly your fighter round a sector of stars and planets, land gently on
// planets to claim them, and your freighters build them up by themselves.
// The computer's Red empire is doing the same. Wipe out its buildings and
// freighters to win; lose all of yours and it's over.
//
// Rules in engine.js, the computer and the Brake button in ai.js, drawing in
// draw.js. This page runs the frame loop, the buttons and keys, the camera,
// the messages and the start, pause and end screens.
//
//   Easy    weaker gravity, a Brake button, landing allowed faster, tougher
//           shields, a slower and less accurate computer, and stars bounce
//           you off rather than burn you up
//   Normal  the full thing
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall: the view in the middle, the buttons underneath.

import { useEffect, useRef, useState } from 'react'
import { INSTALL, MODES, SECTOR, STEP, counts, createGame, fighterOf, launchPlanet, step, takeEvents } from './engine'
import { brake, thinkAI } from './ai'
import { drawGame, radarRect } from './draw'
import { formatTime } from '../lib/scoreBoards'
import './gravity-well.css'

const MODE_KEY = 'gw-mode'

function loadMode() {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return MODES[m] ? m : 'easy'
  } catch {
    return 'easy'
  }
}

function saveMode(m) {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    // Not remembered; Easy again next time.
  }
}

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // A missing buzz is fine.
  }
}

// What to tell the person about each thing that happens.
function describe(game, ev) {
  const e = (id) => game.empires[id]
  const planet = ev.planet != null ? game.planets[ev.planet].name : ''
  const what = ev.kind && INSTALL[ev.kind] ? INSTALL[ev.kind].label : ''
  const mine = ev.owner === 0
  switch (ev.type) {
    case 'claim':
      return mine
        ? { text: `${planet} is yours! Freighters are on the way.`, color: '#9dffbb' }
        : { text: `${e(ev.owner).name} claimed ${planet}.`, color: e(ev.owner).color }
    case 'built':
      return mine ? { text: `${what} built on ${planet}.`, color: '#9fd8ff' } : null
    case 'lost':
      if (mine) return { text: `Your ${what} on ${planet} was destroyed!`, color: '#ff9a8a' }
      return ev.by === 0 ? { text: `You destroyed ${e(ev.owner).name}'s ${what} on ${planet}!`, color: '#ffe08a' } : null
    case 'destroyed':
      if (ev.kind === 'fighter') {
        if (mine) return { text: 'Your fighter was destroyed!', color: '#ff9a8a' }
        return { text: `${e(ev.owner).name}'s fighter is down!`, color: '#ffe08a' }
      }
      if (mine) return { text: 'One of your freighters was shot down.', color: '#ff9a8a' }
      return ev.by === 0 ? { text: `You shot down a ${e(ev.owner).name} freighter.`, color: '#ffe08a' } : null
    case 'star':
      return mine ? { text: game.cfg.starKills ? 'Burnt up by a star!' : 'Ouch! Too close to the star.', color: '#ffb35c' } : null
    case 'bump':
      if (!mine) return null
      return ev.hostile
        ? { text: `${planet} is defended. Shoot its buildings first.`, color: '#ffb35c' }
        : { text: 'Too fast to land! Slow down first.', color: '#ffb35c' }
    case 'out':
      return mine ? null : { text: `${e(ev.owner).name} has been driven out of the sector!`, color: '#ffe08a' }
    default:
      return null
  }
}

// One button that stays pressed while a finger is on it.
function Pad({ label, children, control, input, className = '' }) {
  const set = (on) => (e) => {
    if (on) {
      e.preventDefault()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Older browsers: the press ends if the finger slides off.
      }
    }
    input.current[control] = on
  }
  return (
    <button
      type="button"
      className={`gw-pad ${className}`}
      aria-label={label}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onLostPointerCapture={set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export default function GravityWell() {
  const [mode, setMode] = useState(loadMode)
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'paused' | 'over'
  const [hud, setHud] = useState({ time: 0, counts: [1, 1] })
  const [result, setResult] = useState(null)
  const [round, setRound] = useState(0)

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const gameRef = useRef(null)
  const inputRef = useRef({ left: false, right: false, thrust: false, fire: false, brake: false })
  const viewRef = useRef({ cam: { x: 0, y: 0 }, waypoint: null, toasts: [], hint: null })
  const phaseRef = useRef(phase)
  phaseRef.current = phase

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

  // ---------- the frame loop ----------

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let lastHud = ''
    const view = viewRef.current
    const g0 = gameRef.current
    const start = fighterOf(g0, 0) ?? g0.planets[g0.empires[0].home]
    view.cam = { x: start.x, y: start.y }

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last) / 1000
      last = now
      const game = gameRef.current
      if (!game) return

      if (phaseRef.current === 'playing') {
        acc += dt
        while (acc >= STEP) {
          acc -= STEP
          const me = fighterOf(game, 0)
          const input = inputRef.current
          if (me) {
            if (input.brake && game.cfg.brake && !me.landed) brake(game, me)
            else {
              me.turn = (input.right ? 1 : 0) - (input.left ? 1 : 0)
              me.thrust = input.thrust
            }
            me.fire = input.fire
          }
          for (const e of game.empires) if (!e.human && !e.out) thinkAI(game, e, STEP)
          step(game, STEP)
          for (const ev of takeEvents(game)) {
            const msg = describe(game, ev)
            if (msg) view.toasts.push({ ...msg, at: now })
            if (ev.owner === 0 && (ev.type === 'destroyed' || ev.type === 'star')) buzz([60, 40, 90])
            else if (ev.type === 'claim' && ev.owner === 0) buzz(30)
            else if (ev.type === 'over') finish(game)
          }
        }
        view.toasts = view.toasts.filter((m) => now - m.at < 3400)
      } else {
        acc = 0
      }

      // The camera eases after your fighter, looking a little ahead.
      const me = fighterOf(game, 0)
      const e0 = game.empires[0]
      const follow = me ? { x: me.x + me.vx * 0.35, y: me.y + me.vy * 0.35 } : launchPlanet(game, e0) ?? view.cam
      const k = Math.min(1, dt * (me ? 6 : 2))
      view.cam.x += (follow.x - view.cam.x) * k
      view.cam.y += (follow.y - view.cam.y) * k

      view.hint = null
      if (phaseRef.current === 'playing') {
        if (!me) {
          const p = launchPlanet(game, e0)
          const wait = Math.ceil(e0.respawnAt - game.time)
          view.hint = p ? (wait > 0 ? `New fighter launching from ${p.name} in ${wait}…` : null) : 'No base left to launch from!'
        } else if (me.landed) {
          const p = game.planets[me.landed.planet]
          const repairing = p.owner === 0 && (p.base || p.port) && (me.hull < me.hullMax || me.shield < me.shieldMax)
          view.hint = repairing ? 'Repairing… Thrust to take off.' : 'Hold Thrust to take off.'
        }
      }

      const { w, h, dpr } = sizeRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && w > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawGame(ctx, w, h, game, view, now)
      }

      const c = counts(game)
      const key = `${Math.floor(game.time)}|${c.join(',')}`
      if (key !== lastHud) {
        lastHud = key
        setHud({ time: Math.floor(game.time), counts: c })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  function finish(game) {
    setTimeout(() => {
      setResult({
        won: game.status === 'won',
        time: Math.floor(game.time),
        planets: counts(game)[0],
      })
      setPhase('over')
    }, 1400)
  }

  // ---------- keyboard ----------

  useEffect(() => {
    const keys = {
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowUp: 'thrust',
      w: 'thrust',
      W: 'thrust',
      ' ': 'fire',
      ArrowDown: 'fire',
      s: 'fire',
      S: 'fire',
      b: 'brake',
      B: 'brake',
      Shift: 'brake',
    }
    function onDown(e) {
      if (keys[e.key]) {
        inputRef.current[keys[e.key]] = true
        e.preventDefault()
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))
        e.preventDefault()
      }
    }
    function onUp(e) {
      if (keys[e.key]) inputRef.current[keys[e.key]] = false
    }
    function onHide() {
      if (document.hidden) setPhase((p) => (p === 'playing' ? 'paused' : p))
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  // Letting go of everything when the game stops, so nothing sticks on.
  useEffect(() => {
    if (phase !== 'playing') {
      const input = inputRef.current
      for (const k of Object.keys(input)) input[k] = false
    }
  }, [phase])

  // Tap a planet on the radar to get an arrow pointing to it; tap it again
  // to clear it.
  function onStageTap(e) {
    if (phaseRef.current !== 'playing') return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const r = radarRect(rect.width)
    if (x < r.x || y < r.y || x > r.x + r.size || y > r.y + r.size) return
    const game = gameRef.current
    const wx = ((x - r.x) / r.size) * SECTOR
    const wy = ((y - r.y) / r.size) * SECTOR
    let best = null
    for (const p of game.planets) {
      const d = Math.hypot(p.x - wx, p.y - wy)
      if (!best || d < best.d) best = { id: p.id, d }
    }
    const view = viewRef.current
    view.waypoint = view.waypoint === best.id ? null : best.id
  }

  // ---------- starting ----------

  function play(nextMode = mode) {
    gameRef.current = createGame(nextMode)
    viewRef.current.waypoint = null
    viewRef.current.toasts = [{ text: 'Find a planet nobody owns and land on it gently.', at: performance.now(), color: '#9dffbb' }]
    setResult(null)
    setRound((r) => r + 1)
    setPhase('playing')
  }

  function chooseMode(next) {
    if (next === mode) return
    saveMode(next)
    setMode(next)
    gameRef.current = createGame(next)
    setRound((r) => r + 1)
  }

  // ---------- render ----------

  const modePicker = (
    <div className="gw-chips" role="group" aria-label="Difficulty">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} type="button" className={`gw-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )
  const modeNote = {
    easy: 'Gentle gravity, a Brake button for landing, tougher shields and a slower Red empire.',
    normal: 'Full gravity, stars burn you up, and Red plays to win.',
  }[mode]

  let overlay = null
  if (phase === 'ready') {
    overlay = (
      <div className="gw-overlay">
        <div className="gw-card">
          <p className="gw-title">🪐 Gravity Well</p>
          <ul className="gw-rules">
            <li>
              <strong>Fly:</strong> turn with ⟲ ⟳ and push with Thrust. You keep drifting, so turn round and thrust to slow
              down. Stay away from the stars!
            </li>
            <li>
              <strong>Claim:</strong> land gently on a planet nobody owns. When the speed bar turns blue you're slow enough.
            </li>
            <li>
              <strong>Build:</strong> your freighters then fly out by themselves to build a Base, a Colony and a High Port.
            </li>
            <li>
              <strong>Win:</strong> shoot Red's buildings and freighters until it has none left. Land on your own bases to
              repair.
            </li>
          </ul>
          {modePicker}
          <p className="gw-note">{modeNote}</p>
          <button type="button" className="gw-btn primary" onClick={() => play()}>
            Start
          </button>
        </div>
      </div>
    )
  } else if (phase === 'paused') {
    overlay = (
      <div className="gw-overlay">
        <div className="gw-card">
          <p className="gw-title">Paused</p>
          <button type="button" className="gw-btn primary" onClick={() => setPhase('playing')}>
            Resume
          </button>
          <button type="button" className="gw-link" onClick={() => setPhase('ready')}>
            New game
          </button>
        </div>
      </div>
    )
  } else if (phase === 'over' && result) {
    overlay = (
      <div className="gw-overlay">
        <div className="gw-card">
          <p className="gw-title">{result.won ? 'Sector conquered! 🎉' : 'Red took the sector'}</p>
          <p className="gw-sub">
            {result.won
              ? `You drove Red out in ${formatTime(result.time)}, holding ${result.planets} ${result.planets === 1 ? 'planet' : 'planets'}.`
              : `You held on for ${formatTime(result.time)}. Have another go!`}
          </p>
          <button type="button" className="gw-btn primary" onClick={() => play()}>
            Play again
          </button>
          {modePicker}
        </div>
      </div>
    )
  }

  const game = gameRef.current
  const easy = MODES[mode].brake

  return (
    <div className="gw">
      <div className="gw-hud">
        <div className="gw-stat">
          <span className="gw-stat-label">Time</span>
          <span className="gw-stat-value">{formatTime(hud.time)}</span>
        </div>
        <div className="gw-stat">
          <span className="gw-stat-label">Planets</span>
          <span className="gw-stat-value gw-tally">
            {game.empires.map((e, i) => (
              <span key={e.id} style={{ color: e.color }} aria-label={`${e.name} ${hud.counts[i] ?? 0}`}>
                ● {hud.counts[i] ?? 0}
              </span>
            ))}
          </span>
        </div>
        <button
          type="button"
          className="gw-icon-btn"
          aria-label={phase === 'paused' ? 'Resume' : 'Pause'}
          onClick={() => setPhase((p) => (p === 'playing' ? 'paused' : p === 'paused' ? 'playing' : p))}
          disabled={phase !== 'playing' && phase !== 'paused'}
        >
          {phase === 'paused' ? '▶' : '❚❚'}
        </button>
      </div>

      <div ref={stageRef} className="gw-stage" onPointerDown={onStageTap}>
        <canvas ref={canvasRef} className="gw-canvas" aria-label="Space. Tap a planet on the radar to be pointed at it." />
        {overlay}
      </div>

      <div className={`gw-controls ${easy ? 'gw-controls--brake' : ''}`}>
        <Pad label="Turn left" control="left" input={inputRef}>
          ⟲
        </Pad>
        <Pad label="Turn right" control="right" input={inputRef}>
          ⟳
        </Pad>
        {easy && (
          <Pad label="Brake" control="brake" input={inputRef} className="gw-pad--brake">
            Brake
          </Pad>
        )}
        <Pad label="Fire" control="fire" input={inputRef} className="gw-pad--fire">
          Fire
        </Pad>
        <Pad label="Thrust" control="thrust" input={inputRef} className="gw-pad--thrust">
          Thrust
        </Pad>
      </div>
    </div>
  )
}

