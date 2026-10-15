// src/pages/games/gem-clash/GemStage.jsx
// The play surface every Gem Clash mode shares: the canvas (your well and
// the side panel), the overlay on top of it, the buttons underneath, swipes
// on the well and the keyboard. The modes own the rules of the match; each
// frame the stage calls onTick(dt, now, feedback) and they move their games
// on there, passing their own game's events to feedback() for the sparks,
// pop-up messages, shake and buzz.
//
// Props
//   worldRef   ref to { game, rivals: [{ key, name, game }] } (read every frame)
//   active     true while the player's game is running (controls work)
//   onTick     (dt, now, feedback) => void, only called while active
//   onPauseKey () => void, P / Space / Escape on a keyboard
//   onHidden   () => void, the page was hidden (switch apps, lock phone)
//   overlay    node drawn over the canvas

import { useCallback, useEffect, useRef } from 'react'
import { hardDrop, move, rotate, setSoftDrop } from './engine'
import { burst, createFx, drawGame, layout } from './draw'

const REPEAT_DELAY = 200
const REPEAT_EVERY = 75

// A button that fires on press and, if `repeat`, keeps firing while held.
function Pad({ label, children, onPress, onRelease, repeat = false, className = '' }) {
  const timers = useRef([])
  function stop() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    onRelease?.()
  }
  function start(e) {
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Older browsers: the hold just ends if the finger slides off.
    }
    onPress()
    if (!repeat) return
    const again = () => {
      onPress()
      timers.current.push(setTimeout(again, REPEAT_EVERY))
    }
    timers.current.push(setTimeout(again, REPEAT_DELAY))
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return (
    <button
      type="button"
      className={`gc-pad ${className}`}
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

export default function GemStage({ worldRef, active, onTick, onPauseKey, onHidden, overlay }) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const fxRef = useRef({ game: null, fx: createFx(), rivals: new Map() })
  const popsRef = useRef([])
  const shakeRef = useRef(0)
  const activeRef = useRef(active)
  const tickRef = useRef(onTick)
  activeRef.current = active
  tickRef.current = onTick

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

  // ---------- frame loop ----------

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last)
      last = now
      const world = worldRef.current
      const game = world?.game
      if (!game) return
      // A new game gets fresh effects.
      const store = fxRef.current
      if (store.game !== game) {
        store.game = game
        store.fx = createFx()
        store.rivals = new Map()
        popsRef.current = []
      }
      const rivals = (world.rivals ?? []).map((r) => {
        if (!store.rivals.has(r.key)) store.rivals.set(r.key, createFx())
        return { ...r, fx: store.rivals.get(r.key) }
      })

      if (activeRef.current) {
        const feedback = (events) => {
          for (const ev of events) {
            if (ev.type === 'clear') {
              const { w, h } = sizeRef.current
              burst(store.fx, game, w, h, rivals.length > 0, now)
              const text = ev.chain > 1 ? `Chain ×${ev.chain}!` : ev.count >= 8 ? 'Smash!' : `+${ev.damage * 10}`
              popsRef.current.push({ at: now, text, big: ev.chain > 1 })
              if (navigator.vibrate) navigator.vibrate(ev.chain > 1 ? [20, 40, 20] : 15)
            } else if (ev.type === 'junk') {
              shakeRef.current = 6
              if (navigator.vibrate) navigator.vibrate(30)
            }
          }
        }
        tickRef.current?.(dt, now, feedback)
      }
      shakeRef.current = Math.max(0, shakeRef.current - dt * 0.03)
      popsRef.current = popsRef.current.filter((p) => now - p.at < 1100)

      const { w, h, dpr } = sizeRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx && w > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawGame(ctx, w, h, { game, rivals, fx: store.fx, pops: popsRef.current, now, shake: shakeRef.current })
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [worldRef])

  // ---------- controls ----------

  const act = useCallback(
    (fn) => {
      const game = worldRef.current?.game
      if (activeRef.current && game) fn(game)
    },
    [worldRef],
  )
  const release = useCallback(() => {
    const game = worldRef.current?.game
    if (game) setSoftDrop(game, false)
  }, [worldRef])

  const pauseKeyRef = useRef(onPauseKey)
  const hiddenRef = useRef(onHidden)
  pauseKeyRef.current = onPauseKey
  hiddenRef.current = onHidden

  useEffect(() => {
    function onKey(e) {
      const k = e.key
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') act((g) => move(g, -1))
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') act((g) => move(g, 1))
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'x' || k === 'X') act((g) => rotate(g, 1))
      else if (k === 'z' || k === 'Z') act((g) => rotate(g, -1))
      else if (k === 'ArrowDown' || k === 's' || k === 'S') act((g) => setSoftDrop(g, true))
      else if (k === ' ') act((g) => hardDrop(g))
      else if (k === 'p' || k === 'P' || k === 'Escape') pauseKeyRef.current?.()
      else return
      e.preventDefault()
    }
    function onKeyUp(e) {
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') release()
    }
    function onHide() {
      if (document.hidden) hiddenRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [act, release])

  // Gestures on the well: drag sideways to slide the pair a column at a
  // time, tap to turn it, flick down to drop it.
  const touch = useRef(null)
  function onPointerDown(e) {
    if (!activeRef.current) return
    const { w, h } = sizeRef.current
    const cell = layout(w, h, (worldRef.current?.rivals ?? []).length > 0).cell
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, at: performance.now(), cell, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Older browsers: the drag just stops at the edge.
    }
  }
  function onPointerMove(e) {
    const t = touch.current
    if (!t || t.id !== e.pointerId) return
    const step = Math.max(18, t.cell * 0.8)
    while (e.clientX - t.lastX >= step) {
      act((g) => move(g, 1))
      t.lastX += step
      t.moved = true
    }
    while (t.lastX - e.clientX >= step) {
      act((g) => move(g, -1))
      t.lastX -= step
      t.moved = true
    }
  }
  function onPointerUp(e) {
    const t = touch.current
    touch.current = null
    if (!t || t.id !== e.pointerId) return
    const dy = e.clientY - t.y
    const dx = e.clientX - t.x
    const quick = performance.now() - t.at < 350
    if (dy > 50 && Math.abs(dy) > Math.abs(dx) * 1.5 && quick) act((g) => hardDrop(g))
    else if (!t.moved && Math.abs(dx) < 10 && Math.abs(dy) < 10) act((g) => rotate(g, 1))
  }

  return (
    <>
      <div
        ref={stageRef}
        className="gc-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (touch.current = null)}
      >
        <canvas ref={canvasRef} className="gc-canvas" />
        {overlay}
      </div>

      <div className="gc-controls">
        <Pad label="Left" repeat onPress={() => act((g) => move(g, -1))}>
          ◀
        </Pad>
        <Pad label="Right" repeat onPress={() => act((g) => move(g, 1))}>
          ▶
        </Pad>
        <Pad label="Down" onPress={() => act((g) => setSoftDrop(g, true))} onRelease={release}>
          ▼
        </Pad>
        <Pad label="Turn" onPress={() => act((g) => rotate(g, 1))} className="gc-pad--turn">
          ⟳
        </Pad>
      </div>
    </>
  )
}
