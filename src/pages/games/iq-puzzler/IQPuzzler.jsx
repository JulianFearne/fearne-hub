// src/pages/games/iq-puzzler/IQPuzzler.jsx
// IQ Puzzler Pro, after SmartGames' IQ Puzzler Pro: fit the loose pieces into
// the board around the ones already fixed until every hole is filled.
//
//   Challenges  five levels (Starter: 3 pieces to place, up to Wizard: all
//               12 on an empty board), 24 challenges each, ticked off as
//               you solve them
//   Moving      drag a piece from the tray onto the board; tap a piece in
//               the tray to pick it (tap again to turn it); Turn and Flip
//               change the picked piece; tap a piece on the board to put it
//               back in the tray
//   Hint        puts the next right piece in, or takes out one of yours that
//               can't be part of any answer; each costs 30 seconds
//   Scores      the fastest time for each level goes on the family table
//
// The challenge you're part way through is kept on the phone. Rules and the
// solver are in puzzle.js.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { formatTime } from '../lib/scoreBoards'
import { CHALLENGES_PER_LEVEL, COLS, LEVELS, PIECE, PIECES, ROWS, cellsOf, fits, flip, gridOf, hint, makeChallenge, shape, turn } from './puzzle'
import './iq-puzzler.css'

const CURRENT_KEY = 'iq-current'
const PROGRESS_KEY = 'iq-progress'
const LEVEL_KEY = 'iq-level'
const HINT_PENALTY = 30
const DRAG_START_PX = 6

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not kept; only matters if the page is closed.
  }
}

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // A missing buzz is fine.
  }
}

// ---------- drawing ----------

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (v) => Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount))
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `rgb(${r},${g},${b})`
}

// One gradient per piece colour, so the balls look round and shiny.
function BallGradients() {
  return (
    <defs>
      {PIECES.map((p) => (
        <radialGradient key={p.id} id={`iq-ball-${p.id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={shade(p.color, 0.65)} />
          <stop offset="45%" stopColor={p.color} />
          <stop offset="100%" stopColor={shade(p.color, -0.35)} />
        </radialGradient>
      ))}
    </defs>
  )
}

// A piece's balls and the bridges joining them, in board units (10 a cell).
function PieceArt({ id, cells, opacity = 1, outline = false }) {
  const set = new Set(cells.map(([r, c]) => `${r},${c}`))
  const color = PIECE[id].color
  const bridges = []
  for (const [r, c] of cells) {
    if (set.has(`${r},${c + 1}`)) bridges.push(<rect key={`h${r}-${c}`} x={c * 10 + 5} y={r * 10 + 2.6} width={10} height={4.8} fill={shade(color, -0.15)} />)
    if (set.has(`${r + 1},${c}`)) bridges.push(<rect key={`v${r}-${c}`} x={c * 10 + 2.6} y={r * 10 + 5} width={4.8} height={10} fill={shade(color, -0.15)} />)
  }
  return (
    <g opacity={opacity}>
      {bridges}
      {cells.map(([r, c]) => (
        <circle
          key={`${r}-${c}`}
          cx={c * 10 + 5}
          cy={r * 10 + 5}
          r={4.5}
          fill={`url(#iq-ball-${id})`}
          stroke={outline ? '#fff' : shade(color, -0.45)}
          strokeWidth={outline ? 0.9 : 0.35}
        />
      ))}
    </g>
  )
}

// A loose piece in the tray, drawn at its own small size.
function TrayPiece({ id, o, selected, onPointerDown }) {
  const cells = shape(id, o)
  const h = Math.max(...cells.map(([r]) => r)) + 1
  const w = Math.max(...cells.map(([, c]) => c)) + 1
  return (
    <button
      type="button"
      className={`iq-tray-piece ${selected ? 'is-selected' : ''}`}
      aria-label={`Piece ${id}${selected ? ', picked' : ''}`}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox={`-1 -1 ${w * 10 + 2} ${h * 10 + 2}`} width={w * 22} height={h * 22} aria-hidden="true">
        <BallGradients />
        <PieceArt id={id} cells={cells} />
      </svg>
    </button>
  )
}

// ---------- the page ----------

export default function IQPuzzler() {
  const [saved] = useState(() => read(CURRENT_KEY, null))
  const [level, setLevel] = useState(() => (LEVELS[saved?.level] ? saved.level : read(LEVEL_KEY, 'starter')))
  const [progress, setProgress] = useState(() => read(PROGRESS_KEY, {}))
  const [screen, setScreen] = useState('menu') // 'menu' | 'play'
  const [n, setN] = useState(1)
  const [placed, setPlaced] = useState([])
  const [orient, setOrient] = useState({})
  const [selected, setSelected] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [hints, setHints] = useState(0)
  const [started, setStarted] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [note, setNote] = useState(null)
  const [result, setResult] = useState(null)
  const [drag, setDrag] = useState(null) // { id, o, x, y, at: {r, c} | null }
  const family = useHighScores('iq-puzzler', level)

  const challenge = useMemo(() => makeChallenge(level, n), [level, n])
  const boardRef = useRef(null)
  const dragRef = useRef(null)
  const stateRef = useRef({})
  stateRef.current = { challenge, placed, orient, screen, result, selected }

  const all = useMemo(() => [...challenge.fixed, ...placed], [challenge, placed])
  const grid = useMemo(() => gridOf(all), [all])
  const onBoard = new Set(placed.map((p) => p.id))
  const tray = challenge.loose.filter((id) => !onBoard.has(id))
  const solved = all.length === PIECES.length
  const total = seconds + hints * HINT_PENALTY

  // ---------- clock ----------

  useEffect(() => {
    if (screen !== 'play' || !started || solved) return
    const t = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [screen, started, solved])

  // Keep the challenge you're on, so leaving the page doesn't lose it.
  useEffect(() => {
    if (screen !== 'play') return
    if (solved) write(CURRENT_KEY, null)
    else write(CURRENT_KEY, { level, n, placed, orient, seconds, hints })
  }, [screen, level, n, placed, orient, seconds, hints, solved])

  // ---------- finishing ----------

  useEffect(() => {
    if (screen !== 'play' || !solved || result) return
    const time = Math.max(1, total)
    buzz([30, 50, 30, 50, 80])
    const keyName = `${level}-${n}`
    setProgress((prev) => {
      const next = { ...prev, [keyName]: prev[keyName] ? Math.min(prev[keyName], time) : time }
      write(PROGRESS_KEY, next)
      return next
    })
    setResult({ time, pending: true })
    family.submit(time).then((r) => setResult((prev) => (prev ? { ...prev, ...r, pending: false } : prev)))
    // Once per solve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, screen])

  // ---------- starting ----------

  function open(nextLevel, nextN) {
    const resume = read(CURRENT_KEY, null)
    const same = resume && resume.level === nextLevel && resume.n === nextN
    setLevel(nextLevel)
    setN(nextN)
    setPlaced(same ? resume.placed : [])
    setOrient(same ? resume.orient : {})
    setSeconds(same ? resume.seconds : 0)
    setHints(same ? resume.hints : 0)
    setStarted(!!same)
    setSelected(null)
    setNote(null)
    setResult(null)
    setScreen('play')
    write(LEVEL_KEY, nextLevel)
  }

  function restart() {
    if (placed.length && !window.confirm('Take all your pieces off and start this challenge again?')) return
    setPlaced([])
    setSeconds(0)
    setHints(0)
    setStarted(false)
    setSelected(null)
    setNote(null)
    setResult(null)
  }

  // ---------- moving pieces ----------

  const oOf = (id) => orient[id] ?? 0

  function changeSelected(fn) {
    if (!selected) return
    setOrient((prev) => ({ ...prev, [selected]: fn(prev[selected] ?? 0) }))
    setStarted(true)
  }

  // Where on the board the dragged piece would go: its top-left cell, found
  // from the ghost's top-left corner.
  function dropSpot(id, o, x, y) {
    const board = boardRef.current?.getBoundingClientRect()
    if (!board) return null
    const cell = board.width / COLS
    const cells = shape(id, o)
    const h = Math.max(...cells.map(([r]) => r)) + 1
    const w = Math.max(...cells.map(([, c]) => c)) + 1
    // The ghost floats above the finger so you can see it.
    const left = x - (w * cell) / 2
    const top = y - h * cell - cell * 0.6
    const r = Math.round((top - board.top) / cell)
    const c = Math.round((left - board.left) / cell)
    const { challenge: ch, placed: pl } = stateRef.current
    const others = gridOf([...ch.fixed, ...pl.filter((p) => p.id !== id)])
    const spot = { id, o, r, c }
    return fits(others, spot) ? spot : null
  }

  function beginDrag(e, id, fromBoard) {
    if (solved) return
    e.preventDefault()
    const o = fromBoard ? placed.find((p) => p.id === id).o : oOf(id)
    dragRef.current = { id, o, x0: e.clientX, y0: e.clientY, moving: false, fromBoard, pointerId: e.pointerId }
  }

  useEffect(() => {
    function move(e) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      if (!d.moving && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START_PX) return
      if (!d.moving) {
        d.moving = true
        // Lift it off the board while it's being moved.
        if (d.fromBoard) setPlaced((prev) => prev.filter((p) => p.id !== d.id))
        setSelected(d.id)
        setStarted(true)
      }
      setDrag({ id: d.id, o: d.o, x: e.clientX, y: e.clientY, at: dropSpot(d.id, d.o, e.clientX, e.clientY) })
    }
    function up(e) {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      dragRef.current = null
      setDrag(null)
      if (!d.moving) {
        // A tap: on the board it puts the piece back in the tray; in the
        // tray it picks the piece, or turns it if it's already picked.
        if (d.fromBoard) {
          setPlaced((prev) => prev.filter((p) => p.id !== d.id))
          setOrient((prev) => ({ ...prev, [d.id]: d.o }))
          setSelected(d.id)
        } else {
          if (stateRef.current.selected === d.id) setOrient((prev) => ({ ...prev, [d.id]: turn(prev[d.id] ?? 0) }))
          setSelected(d.id)
        }
        setStarted(true)
        return
      }
      const spot = dropSpot(d.id, d.o, e.clientX, e.clientY)
      if (spot) {
        setPlaced((prev) => [...prev.filter((p) => p.id !== spot.id), spot])
        setSelected(null)
        setNote(null)
        buzz(12)
      } else {
        setOrient((prev) => ({ ...prev, [d.id]: d.o }))
      }
    }
    function cancel() {
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keys on a computer: R to turn, F to flip the picked piece.
  useEffect(() => {
    function onKey(e) {
      if (stateRef.current.screen !== 'play') return
      if (e.key === 'r' || e.key === 'R') changeSelected(turn)
      else if (e.key === 'f' || e.key === 'F') changeSelected(flip)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function boardPointerDown(e) {
    const board = boardRef.current.getBoundingClientRect()
    const cell = board.width / COLS
    const c = Math.floor((e.clientX - board.left) / cell)
    const r = Math.floor((e.clientY - board.top) / cell)
    const id = grid[r]?.[c]
    if (id && placed.some((p) => p.id === id)) beginDrag(e, id, true)
  }

  // ---------- hints ----------

  function askHint() {
    if (thinking || solved) return
    setThinking(true)
    setStarted(true)
    // Let "Thinking…" show before the solver runs.
    setTimeout(() => {
      const { challenge: ch, placed: pl } = stateRef.current
      const h = hint(ch, pl)
      setThinking(false)
      if (!h) return
      setHints((k) => k + 1)
      if (h.place) {
        setPlaced((prev) => [...prev.filter((p) => p.id !== h.place.id), h.place])
        setNote({ text: 'A piece has been put in for you (+30 s).', id: h.place.id })
      } else {
        setPlaced((prev) => prev.filter((p) => p.id !== h.remove.id))
        setOrient((prev) => ({ ...prev, [h.remove.id]: h.remove.o }))
        setSelected(h.remove.id)
        setNote({ text: "That piece can't be in the right place, so it's back in the tray (+30 s).", id: h.remove.id })
      }
    }, 30)
  }

  // ---------- render: menu ----------

  if (screen === 'menu') {
    const resume = read(CURRENT_KEY, null)
    const doneCount = (lv) => Object.keys(progress).filter((k) => k.startsWith(`${lv}-`)).length
    return (
      <div className="iq iq--menu">
        <div className="iq-intro">
          <p className="iq-title">🧩 IQ Puzzler Pro</p>
          <p className="iq-sub">Fit the loose pieces into the board until every hole is filled. Drag them on, tap to pick one, then turn and flip it.</p>
        </div>
        {resume && LEVELS[resume.level] && (
          <button type="button" className="iq-btn primary" onClick={() => open(resume.level, resume.n)}>
            Carry on: {LEVELS[resume.level].label} {resume.n}
          </button>
        )}
        <div className="iq-chips" role="group" aria-label="Level">
          {Object.entries(LEVELS).map(([key, lv]) => (
            <button key={key} type="button" className={`iq-chip ${level === key ? 'active' : ''}`} onClick={() => setLevel(key)}>
              {lv.label}
              <span className="iq-chip-count">
                {doneCount(key)}/{CHALLENGES_PER_LEVEL}
              </span>
            </button>
          ))}
        </div>
        <p className="iq-note">
          {LEVELS[level].toPlace === PIECES.length ? 'An empty board: place all 12 pieces.' : `${LEVELS[level].toPlace} pieces to place.`}
        </p>
        <div className="iq-grid" role="list" aria-label={`${LEVELS[level].label} challenges`}>
          {Array.from({ length: CHALLENGES_PER_LEVEL }, (_, i) => {
            const best = progress[`${level}-${i + 1}`]
            return (
              <button
                key={i}
                type="button"
                role="listitem"
                className={`iq-cell ${best ? 'is-done' : ''}`}
                onClick={() => open(level, i + 1)}
                aria-label={`Challenge ${i + 1}${best ? `, solved in ${formatTime(best)}` : ''}`}
              >
                <span className="iq-cell-n">{i + 1}</span>
                {best ? <span className="iq-cell-time">✓ {formatTime(best)}</span> : null}
              </button>
            )
          })}
        </div>
        <Leaderboard scores={family} title={`Fastest · ${LEVELS[level].label}`} />
      </div>
    )
  }

  // ---------- render: playing ----------

  const preview = drag?.at ? cellsOf(drag.at) : null
  let ghost = null
  if (drag) {
    const board = boardRef.current?.getBoundingClientRect()
    const cell = board ? board.width / COLS : 30
    const cells = shape(drag.id, drag.o)
    const h = Math.max(...cells.map(([r]) => r)) + 1
    const w = Math.max(...cells.map(([, c]) => c)) + 1
    ghost = (
      <svg
        className="iq-ghost"
        style={{ left: drag.x - (w * cell) / 2, top: drag.y - h * cell - cell * 0.6, width: w * cell, height: h * cell }}
        viewBox={`0 0 ${w * 10} ${h * 10}`}
        aria-hidden="true"
      >
        <BallGradients />
        <PieceArt id={drag.id} cells={cells} opacity={0.85} />
      </svg>
    )
  }

  return (
    <div className="iq">
      <div className="iq-top">
        <button type="button" className="iq-back" onClick={() => setScreen('menu')}>
          ‹ Challenges
        </button>
        <span className="iq-which">
          {LEVELS[level].label} {n}
        </span>
        <span className="iq-clock" aria-label="Time">
          {formatTime(total)}
        </span>
      </div>

      <div className="iq-board-wrap">
        <svg
          ref={boardRef}
          className="iq-board"
          viewBox={`0 0 ${COLS * 10} ${ROWS * 10}`}
          onPointerDown={boardPointerDown}
          onContextMenu={(e) => e.preventDefault()}
          role="img"
          aria-label={`Board with ${all.length} of 12 pieces in`}
        >
          <BallGradients />
          <rect x="-1" y="-1" width={COLS * 10 + 2} height={ROWS * 10 + 2} rx="4" className="iq-board-bg" />
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (_, c) => <circle key={`${r}-${c}`} cx={c * 10 + 5} cy={r * 10 + 5} r={3.6} className="iq-hole" />),
          )}
          {challenge.fixed.map((p) => (
            <PieceArt key={p.id} id={p.id} cells={cellsOf(p)} />
          ))}
          {placed.map((p) => (
            <PieceArt key={p.id} id={p.id} cells={cellsOf(p)} outline={note?.id === p.id} />
          ))}
          {preview && drag && <PieceArt id={drag.id} cells={preview} opacity={0.45} />}
        </svg>
        {result && (
          <div className="iq-done">
            <p className="iq-title">Solved! 🎉</p>
            <p className="iq-sub">
              {formatTime(result.time)}
              {hints ? ` (with ${hints} ${hints === 1 ? 'hint' : 'hints'})` : ''}
            </p>
            <p className="iq-note">
              {result.pending
                ? 'Saving your time…'
                : result.saved === false
                  ? "Saved on this phone. It'll go on the family table when you're back online."
                  : result.best && result.rank === 1
                    ? 'Fastest in the family! 👑'
                    : result.best
                      ? `New personal best! Number ${result.rank} in the family.`
                      : ''}
            </p>
            <div className="iq-actions">
              {n < CHALLENGES_PER_LEVEL && (
                <button type="button" className="iq-btn primary" onClick={() => open(level, n + 1)}>
                  Next challenge
                </button>
              )}
              <button type="button" className="iq-btn" onClick={() => setScreen('menu')}>
                All challenges
              </button>
            </div>
          </div>
        )}
      </div>

      {!result && (
        <>
          <div className="iq-tools">
            <button type="button" className="iq-tool" onClick={() => changeSelected(turn)} disabled={!selected || !tray.includes(selected)}>
              ⟳ Turn
            </button>
            <button type="button" className="iq-tool" onClick={() => changeSelected(flip)} disabled={!selected || !tray.includes(selected)}>
              ⇋ Flip
            </button>
            <button type="button" className="iq-tool" onClick={askHint} disabled={thinking}>
              {thinking ? 'Thinking…' : '💡 Hint'}
            </button>
            <button type="button" className="iq-tool" onClick={restart} disabled={!placed.length}>
              ↺ Restart
            </button>
          </div>
          <p className="iq-status" aria-live="polite">
            {note?.text ?? (tray.length ? (selected && tray.includes(selected) ? 'Drag it onto the board, or Turn and Flip it first.' : 'Drag a piece onto the board.') : '')}
          </p>
          <div className="iq-tray" aria-label="Pieces to place">
            {tray.map((id) => (
              <TrayPiece key={id} id={id} o={oOf(id)} selected={selected === id} onPointerDown={(e) => beginDrag(e, id, false)} />
            ))}
          </div>
        </>
      )}
      {ghost}
    </div>
  )
}
