// src/pages/games/gravity-well/GravityWell.jsx
// Gravity Well, after the 1995 Windows game by Software Engineering, Inc.
// Fly your fighter round a sector of stars and planets, land gently on
// planets to claim them, and your freighters build them up by themselves.
// One to three computer empires (Red, Purple, Yellow) are doing the same.
// Wipe out their buildings and freighters to win; lose all of yours and it's
// over. Your labs invent rockets, homing missiles and stronger shields,
// fitted when you land at one of your bases.
//
// The game in progress is kept on the phone, so you can stop and carry on
// later. A win goes on the family high-score table as the time it took
// (fastest is best), one board per difficulty and number of opponents.
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
import { INSTALL, MODES, SECTOR, STEP, UPGRADES, counts, createGame, fighterOf, launchPlanet, loadGame, saveGame, step, takeEvents, weaponOf } from './engine'
import { brake, thinkAI } from './ai'
import { drawGame, radarRect } from './draw'
import { formatTime } from '../lib/scoreBoards'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import './gravity-well.css'

const MODE_KEY = 'gw-mode'
const RIVALS_KEY = 'gw-rivals'
const SAVE_KEY = 'gw-save'
const SAVE_EVERY_S = 5

function loadRivals() {
  try {
    const n = Number(localStorage.getItem(RIVALS_KEY))
    return n >= 1 && n <= 3 ? n : 3
  } catch {
    return 3
  }
}

function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not kept; only matters if the page is closed.
  }
}

function loadSaved() {
  try {
    return loadGame(localStorage.getItem(SAVE_KEY))
  } catch {
    return null
  }
}

const boardOf = (mode, rivals) => `${mode}-${rivals}`

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
    case 'invented':
      return mine
        ? { text: `Your labs invented ${UPGRADES[ev.level - 1].label}! Land at a base to fit them.`, color: '#e3b8ff' }
        : null
    case 'fitted':
      if (!mine) return null
      return {
        text: ['', 'Rockets fitted! Tap Rocket to fire one.', 'Homing missiles fitted!', 'Shields made stronger!'][ev.level],
        color: '#e3b8ff',
      }
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
  const [saved] = useState(loadSaved)
  const [mode, setMode] = useState(() => saved?.mode ?? loadMode())
  const [rivals, setRivals] = useState(() => (saved ? saved.empires.length - 1 : loadRivals()))
  const [phase, setPhase] = useState('ready') // 'ready' | 'playing' | 'paused' | 'over'
  const [hud, setHud] = useState({ time: 0, counts: [], out: [], weapon: null, ammo: 0 })
  const scores = useHighScores('gravity-well', boardOf(mode, rivals))
  const submitRef = useRef(scores.submit)
  submitRef.current = scores.submit
  const [result, setResult] = useState(null)
  const [round, setRound] = useState(0)

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const gameRef = useRef(null)
  const inputRef = useRef({ left: false, right: false, thrust: false, fire: false, brake: false, launch: false })
  const viewRef = useRef({ cam: { x: 0, y: 0 }, waypoint: null, toasts: [], hint: null, upgrade: null })
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  if (!gameRef.current) gameRef.current = saved ?? createGame(mode, { empires: rivals + 1 })
  // A game already under way, to offer to carry on with.
  const inProgress = () => gameRef.current.status === 'playing' && gameRef.current.time > 1

  const keep = () => store(SAVE_KEY, inProgress() ? saveGame(gameRef.current) : null)

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
    let savedAt = gameRef.current.time
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
            me.launch = input.launch
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
        if (game.status === 'playing' && game.time - savedAt > SAVE_EVERY_S) {
          savedAt = game.time
          store(SAVE_KEY, saveGame(game))
        }
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
      // Labs have something new that this fighter hasn't got yet.
      view.upgrade = me && game.empires[0].ready > me.tech ? UPGRADES[game.empires[0].ready - 1].label : null

      const { w, h, dpr } = sizeRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && w > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawGame(ctx, w, h, game, view, now)
      }

      const c = counts(game)
      const out = game.empires.map((e) => e.out)
      const weapon = me ? weaponOf(me) : null
      const ammo = me?.ammo ?? 0
      const key = `${Math.floor(game.time)}|${c.join(',')}|${out.join(',')}|${weapon}|${ammo}`
      if (key !== lastHud) {
        lastHud = key
        setHud({ time: Math.floor(game.time), counts: c, out, weapon, ammo })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  function finish(game) {
    store(SAVE_KEY, null)
    const won = game.status === 'won'
    const time = Math.max(1, Math.floor(game.time))
    // Whoever holds the most planets at the end gets the blame.
    const c = counts(game)
    const rivalsLeft = game.empires.filter((e) => !e.human && !e.out)
    const victor = rivalsLeft.sort((a, b) => c[b.id] - c[a.id])[0]
    setTimeout(async () => {
      setResult({ won, time, planets: c[0], victor: victor?.name, pending: won })
      setPhase('over')
      if (!won) return
      const r = await submitRef.current(time)
      setResult((prev) => (prev && prev.time === time ? { ...prev, ...r, pending: false } : prev))
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
      r: 'launch',
      R: 'launch',
      Enter: 'launch',
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
      if (!document.hidden) return
      setPhase((p) => (p === 'playing' ? 'paused' : p))
      keep()
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

  // Letting go of everything when the game stops, so nothing sticks on, and
  // keeping the game whenever it stops or the page is left.
  useEffect(() => {
    if (phase !== 'playing') {
      const input = inputRef.current
      for (const k of Object.keys(input)) input[k] = false
      if (phase !== 'over') keep()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])
  useEffect(() => () => keep(), [])

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

  function play() {
    gameRef.current = createGame(mode, { empires: rivals + 1 })
    store(SAVE_KEY, null)
    viewRef.current.waypoint = null
    viewRef.current.toasts = [{ text: 'Find a planet nobody owns and land on it gently.', at: performance.now(), color: '#9dffbb' }]
    setResult(null)
    setRound((r) => r + 1)
    setPhase('playing')
  }

  function carryOn() {
    viewRef.current.toasts = []
    setPhase('playing')
  }

  // Changing the settings starts afresh, so check first if a game's on.
  function okToDrop() {
    return !inProgress() || window.confirm('Start a new game? The one you were playing will be lost.')
  }

  function fresh(nextMode, nextRivals) {
    gameRef.current = createGame(nextMode, { empires: nextRivals + 1 })
    store(SAVE_KEY, null)
    setResult(null)
    setPhase('ready')
    setRound((r) => r + 1)
  }

  function chooseMode(next) {
    if (next === mode || !okToDrop()) return
    saveMode(next)
    setMode(next)
    fresh(next, rivals)
  }

  function chooseRivals(next) {
    if (next === rivals || !okToDrop()) return
    store(RIVALS_KEY, String(next))
    setRivals(next)
    fresh(mode, next)
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
  const rivalsPicker = (
    <div className="gw-chips" role="group" aria-label="Computer empires">
      {[1, 2, 3].map((n) => (
        <button key={n} type="button" className={`gw-chip small ${rivals === n ? 'active' : ''}`} onClick={() => chooseRivals(n)}>
          {n} {n === 1 ? 'rival' : 'rivals'}
        </button>
      ))}
    </div>
  )
  const modeNote = {
    easy: 'Gentle gravity, a Brake button for landing, tougher shields and slower rivals.',
    normal: 'Full gravity, stars burn you up, and the rivals play to win.',
  }[mode]
  const rivalNames = ['Red', 'Red and Purple', 'Red, Purple and Yellow'][rivals - 1]
  const board = (
    <div className="gw-board">
      <Leaderboard scores={scores} title={`Fastest wins · ${MODES[mode].label}, ${rivals} ${rivals === 1 ? 'rival' : 'rivals'}`} />
    </div>
  )

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
              <strong>Win:</strong> shoot your rivals' buildings and freighters until they have none left. Land on your own
              bases to repair, reload and pick up new inventions from your labs.
            </li>
          </ul>
          {inProgress() && (
            <button type="button" className="gw-btn primary" onClick={carryOn}>
              Carry on ({formatTime(Math.floor(gameRef.current.time))})
            </button>
          )}
          {modePicker}
          {rivalsPicker}
          <p className="gw-note">
            {modeNote} Against {rivalNames}.
          </p>
          <button type="button" className={`gw-btn ${inProgress() ? '' : 'primary'}`} onClick={() => play()}>
            {inProgress() ? 'New game' : 'Start'}
          </button>
          {board}
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
            Settings and new game
          </button>
        </div>
      </div>
    )
  } else if (phase === 'over' && result) {
    overlay = (
      <div className="gw-overlay">
        <div className="gw-card">
          <p className="gw-title">{result.won ? 'Sector conquered! 🎉' : `${result.victor ?? 'The rivals'} took the sector`}</p>
          <p className="gw-sub">
            {result.won
              ? `You drove out every rival in ${formatTime(result.time)}, holding ${result.planets} ${result.planets === 1 ? 'planet' : 'planets'}.`
              : `You held on for ${formatTime(result.time)}. Have another go!`}
          </p>
          {result.won && (
            <p className="gw-note">
              {result.pending
                ? 'Saving your time…'
                : result.saved === false
                  ? "Saved on this phone. It'll go on the family table when you're back online."
                  : result.best && result.rank === 1
                    ? 'Fastest in the family! 👑'
                    : result.best
                      ? `New personal best! Number ${result.rank} in the family.`
                      : null}
            </p>
          )}
          <button type="button" className="gw-btn primary" onClick={() => play()}>
            Play again
          </button>
          {modePicker}
          {rivalsPicker}
          {board}
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
              <span
                key={e.id}
                className={hud.out[i] ? 'is-out' : ''}
                style={{ color: e.color }}
                aria-label={hud.out[i] ? `${e.name} is out` : `${e.name} ${hud.counts[i] ?? 0}`}
              >
                {hud.out[i] ? '✕' : `● ${hud.counts[i] ?? 0}`}
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

      <div className="gw-controls" style={{ '--gw-pads': 4 + (easy ? 1 : 0) + (hud.weapon ? 1 : 0) }}>
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
        {hud.weapon && (
          <Pad label={hud.weapon === 'missile' ? 'Missile' : 'Rocket'} control="launch" input={inputRef} className="gw-pad--rocket">
            {hud.weapon === 'missile' ? 'Missile' : 'Rocket'}
            <span className="gw-ammo">{hud.ammo}</span>
          </Pad>
        )}
        <Pad label="Thrust" control="thrust" input={inputRef} className="gw-pad--thrust">
          Thrust
        </Pad>
      </div>
    </div>
  )
}

