// src/pages/games/emberdelve/Emberdelve.jsx
// Emberdelve: a pocket roguelike in 3D. You are a candle delving room by room
// into a dark keep. Your flame fires on its own at the nearest foe; you steer
// with a thumb and dash through danger. Clear a room, take a boon, choose the
// next door. Every fifth room is the Warden. One life, so every run is new.
//
// The rules live in engine.js and the three.js drawing in scene.js; this page
// runs the frame loop, the touch stick, the HUD and the overlays.
//
// The route is marked `fill` in App.jsx, so the page is exactly one screen
// tall: HUD on top and the dungeon filling the rest.

import { useEffect, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { boardInfo } from '../lib/scoreBoards'
import { BOONS, REWARDS, STEP, THEME_NAMES, WORLD, choose, createGame, dash, startGame, step, takeEvents } from './engine'
import './emberdelve.css'

const GAME_KEY = 'emberdelve'
const BOARD = 'run'
const STICK_R = 56 // px of thumb travel for full speed

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Some browsers throw rather than ignore it; a missing buzz is fine.
  }
}

function roomName(depth) {
  const theme = THEME_NAMES[Math.floor((depth - 1) / WORLD.BOSS_EVERY) % THEME_NAMES.length]
  return depth % WORLD.BOSS_EVERY === 0 ? `${theme} · The Warden` : theme
}

export default function Emberdelve() {
  const scores = useHighScores(GAME_KEY, BOARD)
  const [hud, setHud] = useState({ status: 'ready', score: 0, hp: 5, maxHp: 5, depth: 1, boss: null })
  const [paused, setPaused] = useState(false)
  const [choice, setChoice] = useState(null)
  const [result, setResult] = useState(null)
  const [banner, setBanner] = useState(null) // { key, title, sub }
  const [round, setRound] = useState(0)
  const [webgl, setWebgl] = useState(true)

  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const flashRef = useRef(null)
  const stickRef = useRef(null)
  const knobRef = useRef(null)
  const gameRef = useRef(null)
  const pausedRef = useRef(false)
  const autoStartRef = useRef(false)
  const input = useRef({ x: 0, z: 0 })
  const keys = useRef(new Set())
  const stick = useRef(null) // { id, x, y }
  const live = useRef({})
  live.current = { submit: scores.submit }
  pausedRef.current = paused

  // One three.js scene for the life of the page, one game per round.
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    let sceneApi = null
    let disposed = false
    let raf = 0
    let ro = null

    import('./scene')
      .then(({ createScene }) => {
        if (disposed) return
        try {
          sceneApi = createScene(canvas)
        } catch {
          setWebgl(false)
          return
        }
        const resize = () => {
          const { clientWidth: w, clientHeight: h } = stage
          if (w && h) sceneApi.resize(w, h)
        }
        resize()
        ro = new ResizeObserver(resize)
        ro.observe(stage)
        loop()
      })
      .catch(() => setWebgl(false))

    let last = performance.now()
    let acc = 0
    let lastHud = ''
    let ended = null

    function loop() {
      raf = requestAnimationFrame(frame)
    }

    function frame(now) {
      const game = gameRef.current
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (game) {
        if (!pausedRef.current) {
          acc += dt
          let steps = 0
          while (acc >= STEP && steps < 6) {
            step(game, input.current)
            acc -= STEP
            steps++
          }
          if (steps === 6) acc = 0
          handleEvents(game)
        }
        sceneApi.render(game, now)
        if (flashRef.current) flashRef.current.style.opacity = String(game.flash * 0.55)

        const boss = game.enemies.find((e) => e.kind === 'boss')
        const p = game.player
        const next = {
          status: game.status,
          score: game.score,
          hp: p.hp,
          maxHp: p.maxHp,
          depth: game.depth,
          boss: boss ? Math.max(0, boss.hp / boss.maxHp) : null,
          doors: game.room.doors.length,
        }
        const key = `${next.status}|${next.score}|${next.hp}|${next.maxHp}|${next.depth}|${next.boss?.toFixed(2)}|${next.doors}`
        if (key !== lastHud) {
          lastHud = key
          setHud(next)
        }
        if (game.status === 'choosing' && game.choice) setChoice((c) => (c === game.choice ? c : game.choice))
        if (game.status === 'over' && ended !== game) {
          ended = game
          finish(game)
        }
      }
      raf = requestAnimationFrame(frame)
    }

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
      sceneApi?.dispose()
    }
  }, [])

  useEffect(() => {
    const game = createGame()
    gameRef.current = game
    if (import.meta.env.DEV) window.__emberdelve = game // for poking at runs in the console
    setChoice(null)
    if (autoStartRef.current) {
      autoStartRef.current = false
      startGame(game)
      showBanner(game.depth)
    }
  }, [round])

  function showBanner(depth) {
    setBanner({ key: `${depth}-${Date.now()}`, title: `Room ${depth}`, sub: roomName(depth) })
  }

  function handleEvents(game) {
    for (const e of takeEvents(game)) {
      if (e.type === 'hurt') buzz(game.player.hp > 0 ? 60 : [80, 50, 160])
      else if (e.type === 'room' && game.status === 'playing') showBanner(e.depth)
      else if (e.type === 'clear') buzz(25)
      else if (e.type === 'kill' && e.kind === 'boss') buzz([40, 30, 40, 30, 120])
    }
  }

  async function finish(game) {
    const { score, depth, kills } = game
    const taken = Object.entries(game.player.taken)
    setResult({ score, depth, kills, taken, line: score > 0 ? 'Saving your score…' : 'Have another go!' })
    if (score <= 0) return
    try {
      const { best, rank } = await live.current.submit(score)
      const line = best ? 'New personal best!' : rank ? `Number ${rank} in the family` : 'A brave delve.'
      setResult((r) => (r && r.score === score ? { ...r, line } : r))
    } catch {
      setResult((r) => (r && r.score === score ? { ...r, line: 'A brave delve.' } : r))
    }
  }

  // Keyboard: WASD or arrows to move, Space or Shift to dash, P or Escape to pause.
  useEffect(() => {
    const dirs = {
      ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
      ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
      ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
      ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    }
    function recompute() {
      if (stick.current) return
      let x = 0
      let z = 0
      for (const k of keys.current) {
        x += dirs[k][0]
        z += dirs[k][1]
      }
      const l = Math.hypot(x, z) || 1
      input.current = { x: x / l, z: z / l }
    }
    function onKeyDown(e) {
      const k = e.key
      const game = gameRef.current
      if (dirs[k]) {
        keys.current.add(k)
        recompute()
      } else if (k === ' ' || k === 'Shift') {
        if (game && !pausedRef.current) dash(game, input.current)
      } else if (k === 'p' || k === 'P' || k === 'Escape') {
        if (game?.status === 'playing') setPaused((p) => !p)
      } else return
      e.preventDefault()
    }
    function onKeyUp(e) {
      if (dirs[e.key]) {
        keys.current.delete(e.key)
        recompute()
      }
    }
    function onHide() {
      if (document.hidden && gameRef.current?.status === 'playing') setPaused(true)
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

  // The floating stick: put a thumb down anywhere and drag. A second finger
  // tapping anywhere dashes, as does the dash button.
  function onPointerDown(e) {
    const game = gameRef.current
    if (!game || game.status !== 'playing' || pausedRef.current) return
    if (stick.current) {
      dash(game, input.current)
      return
    }
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic events can't be captured; the stick still works.
    }
    const rect = stageRef.current.getBoundingClientRect()
    const el = stickRef.current
    el.style.left = `${e.clientX - rect.left}px`
    el.style.top = `${e.clientY - rect.top}px`
    el.classList.add('on')
    knobRef.current.style.transform = 'translate(-50%, -50%)'
  }
  function onPointerMove(e) {
    const s = stick.current
    if (!s || s.id !== e.pointerId) return
    let dx = e.clientX - s.x
    let dy = e.clientY - s.y
    const d = Math.hypot(dx, dy)
    if (d > STICK_R) {
      // Drag the base along behind the thumb so it never runs out of room.
      const over = d - STICK_R
      s.x += (dx / d) * over
      s.y += (dy / d) * over
      const rect = stageRef.current.getBoundingClientRect()
      stickRef.current.style.left = `${s.x - rect.left}px`
      stickRef.current.style.top = `${s.y - rect.top}px`
      dx = e.clientX - s.x
      dy = e.clientY - s.y
    }
    const k = Math.min(1, Math.hypot(dx, dy) / STICK_R)
    const l = Math.hypot(dx, dy) || 1
    input.current = { x: (dx / l) * (k < 0.12 ? 0 : k), z: (dy / l) * (k < 0.12 ? 0 : k) }
    knobRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }
  function onPointerUp(e) {
    const s = stick.current
    if (!s || s.id !== e.pointerId) return
    stick.current = null
    input.current = { x: 0, z: 0 }
    stickRef.current.classList.remove('on')
  }

  function onDash(e) {
    e.preventDefault()
    e.stopPropagation()
    const game = gameRef.current
    if (game && !pausedRef.current) dash(game, input.current)
  }

  function play() {
    setResult(null)
    setPaused(false)
    const game = gameRef.current
    if (game?.status === 'ready') {
      startGame(game)
      showBanner(game.depth)
    } else {
      autoStartRef.current = true
      setRound((r) => r + 1)
    }
  }

  function pick(key) {
    const game = gameRef.current
    if (!game) return
    choose(game, key)
    setChoice(null)
    buzz(20)
  }

  const status = hud.status
  const playing = status === 'playing'
  const info = boardInfo(GAME_KEY, BOARD)

  let overlay = null
  if (!webgl) {
    overlay = (
      <div className="ed-overlay">
        <p className="ed-title">Emberdelve</p>
        <p className="ed-sub">This device can't draw 3D graphics in the browser, so the game can't start here. Try another phone, tablet or computer.</p>
      </div>
    )
  } else if (status === 'ready') {
    overlay = (
      <div className="ed-overlay">
        <p className="ed-title">🕯️ Emberdelve</p>
        <p className="ed-sub">Delve into the dark keep as a little candle. Your flame fires on its own: just keep moving.</p>
        <ul className="ed-howto">
          <li>
            <b>Move</b> put a thumb down anywhere and drag
          </li>
          <li>
            <b>Dash</b> tap the dash button or a second finger to zip through danger
          </li>
          <li>
            <b>Grow</b> clear a room, take a boon, then pick your next door
          </li>
        </ul>
        <button type="button" className="ed-btn primary" onClick={play}>
          Begin the delve
        </button>
        <Leaderboard scores={scores} className="ed-board" />
      </div>
    )
  } else if (status === 'choosing' && choice) {
    overlay = (
      <div className="ed-overlay ed-overlay--choice">
        <p className="ed-title small">{choice.title}</p>
        <p className="ed-sub">Choose a boon</p>
        <div className="ed-cards">
          {choice.boons.map((k) => {
            const b = BOONS[k]
            const have = gameRef.current?.player.taken[k] || 0
            return (
              <button key={k} type="button" className={`ed-card ${b.rare ? 'rare' : ''}`} onClick={() => pick(k)}>
                <span className="ed-card-icon" aria-hidden="true">
                  {b.icon}
                </span>
                <span className="ed-card-text">
                  <span className="ed-card-name">
                    {b.name}
                    {have > 0 && <span className="ed-card-have"> ×{have + 1}</span>}
                  </span>
                  <span className="ed-card-desc">{b.text}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  } else if (status === 'over' && result) {
    overlay = (
      <div className="ed-overlay">
        <p className="ed-title">Snuffed out</p>
        <p className="ed-score">{info.format(result.score)}</p>
        <p className="ed-sub">
          Reached room {result.depth}, {result.kills} {result.kills === 1 ? 'foe' : 'foes'} burnt. {result.line}
        </p>
        {result.taken.length > 0 && (
          <p className="ed-taken" aria-label="Boons this run">
            {result.taken.map(([k, n]) => (
              <span key={k} title={BOONS[k].name}>
                {BOONS[k].icon}
                {n > 1 && <small>×{n}</small>}
              </span>
            ))}
          </p>
        )}
        <button type="button" className="ed-btn primary" onClick={play}>
          Delve again
        </button>
        <Leaderboard scores={scores} className="ed-board" />
      </div>
    )
  } else if (paused && playing) {
    overlay = (
      <div className="ed-overlay">
        <p className="ed-title">Paused</p>
        <button type="button" className="ed-btn primary" onClick={() => setPaused(false)}>
          Resume
        </button>
      </div>
    )
  }

  const hearts = Array.from({ length: hud.maxHp }, (_, i) => i < hud.hp)
  const showDoorsHint = playing && hud.doors > 0

  return (
    <div className="ed">
      <div className="ed-hud">
        <div className="ed-hearts" aria-label={`${hud.hp} of ${hud.maxHp} hearts`}>
          {hud.maxHp <= 8 ? (
            hearts.map((on, i) => (
              <span key={i} className={on ? 'on' : ''}>
                ♥
              </span>
            ))
          ) : (
            <span className="ed-hearts-count">
              <span className="on">♥</span> {hud.hp}/{hud.maxHp}
            </span>
          )}
        </div>
        <div className="ed-stat">
          <span className="ed-stat-label">Room</span>
          <span className="ed-stat-value">{hud.depth}</span>
        </div>
        <div className="ed-stat">
          <span className="ed-stat-label">Score</span>
          <span className="ed-stat-value">{hud.score}</span>
        </div>
        <button
          type="button"
          className="ed-icon-btn"
          aria-label={paused ? 'Resume' : 'Pause'}
          onClick={() => setPaused((p) => !p)}
          disabled={!playing}
        >
          {paused ? '▶' : '❚❚'}
        </button>
      </div>

      <div
        ref={stageRef}
        className="ed-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="ed-canvas" aria-label="The dungeon. Drag anywhere to move." />
        <div ref={flashRef} className="ed-flash" aria-hidden="true" />
        <div ref={stickRef} className="ed-stick" aria-hidden="true">
          <div ref={knobRef} className="ed-knob" />
        </div>
        {hud.boss != null && (
          <div className="ed-bossbar" aria-label="The Warden's health">
            <span className="ed-bossbar-name">The Warden</span>
            <span className="ed-bossbar-track">
              <span className="ed-bossbar-fill" style={{ width: `${hud.boss * 100}%` }} />
            </span>
          </div>
        )}
        {banner && playing && !showDoorsHint && (
          <div key={banner.key} className="ed-banner" aria-live="polite">
            <span className="ed-banner-title">{banner.title}</span>
            <span className="ed-banner-sub">{banner.sub}</span>
          </div>
        )}
        {showDoorsHint && (
          <div className="ed-hint">
            {gameRef.current?.room.doors.map((d) => REWARDS[d.reward].label + ': ' + REWARDS[d.reward].note).join('  ·  ')}
            <br />
            Walk through a door to go deeper
          </div>
        )}
        {(playing || paused) && (
          <button
            type="button"
            className="ed-dash"
            aria-label="Dash"
            onPointerDown={onDash}
            onContextMenu={(e) => e.preventDefault()}
          >
            Dash
          </button>
        )}
        {overlay}
      </div>
    </div>
  )
}
