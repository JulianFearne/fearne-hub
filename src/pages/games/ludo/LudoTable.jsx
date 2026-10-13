// src/pages/games/ludo/LudoTable.jsx
// The play screen every Ludo mode shares: who's playing, the board, the
// dice and a status line. Moves are played out one square at a time so you
// can follow a token round the board.
//
//   names       display name per player (turn order)
//   canAct      true when the person holding this device controls the
//               current player (their turn to roll / pick a token)
//   onRoll      () => void, called when the dice is tapped
//   onPick      (tokenIndex) => void
//   onAnimating (bool) => void, so controllers can wait for a move to finish

import { useEffect, useRef, useState } from 'react'
import { getMovableTokens } from './engine'
import { stepsBetween } from './board'
import LudoBoard, { COLOR_KEYS } from './LudoBoard'

const STEP_MS = 130
const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
}

export function Dice({ value, color, rolling, onClick, disabled }) {
  const shown = value ?? 6
  return (
    <button
      type="button"
      className={`ludo-dice ludo-dice--${color} ${rolling ? 'is-rolling' : ''} ${disabled ? '' : 'is-ready'}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={value ? `Dice shows ${value}` : 'Roll the dice'}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="4" y="4" width="92" height="92" rx="18" className="ludo-dice-face" />
        {PIPS[shown].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="9" className="ludo-dice-pip" />
        ))}
      </svg>
    </button>
  )
}

// Plays the latest move out square by square. Returns the positions to
// draw right now and whether a move is still animating.
function useAnimatedPositions(state) {
  const [anim, setAnim] = useState(null)
  const doneSeq = useRef(state.lastEvent?.seq ?? null)
  const ev = state.lastEvent

  useEffect(() => {
    if (!ev || ev.type !== 'move' || ev.seq === doneSeq.current) return undefined
    const steps = stepsBetween(ev.from, ev.to)
    // Start from the finished positions, but with captured tokens still on
    // the board until the mover lands on them.
    const base = state.positions.map((row) => row.slice())
    ev.captured.forEach((c) => (base[c.player][c.token] = c.from))
    let i = 0
    let timer
    const frame = () => {
      if (i >= steps.length) {
        doneSeq.current = ev.seq
        setAnim(null)
        return
      }
      const positions = base.map((row) => row.slice())
      positions[ev.player][ev.tokenIndex] = steps[i]
      setAnim(positions)
      i += 1
      timer = setTimeout(frame, STEP_MS)
    }
    frame()
    return () => {
      clearTimeout(timer)
      setAnim(null)
    }
    // Keyed on the event's sequence number, not the state object, so a
    // re-render (or an online refetch) doesn't replay the move.
  }, [ev?.seq])

  return { positions: anim ?? state.positions, animating: anim != null }
}

function statusText(state, names, canAct) {
  if (state.winner != null) return `${names[state.winner]} wins! 🎉`
  const ev = state.lastEvent
  const bits = []
  if (ev?.type === 'move') {
    const who = names[ev.player]
    if (ev.captured.length) bits.push(`${who} sent ${ev.captured.map((c) => names[c.player]).join(' and ')} back home!`)
    else if (ev.justFinished) bits.push(`${who} got a token home!`)
    if (ev.forfeited) bits.push('Three sixes in a row, turn over.')
  } else if (ev?.type === 'nomove') {
    bits.push(ev.forfeited ? `${names[ev.player]} rolled three sixes, turn over.` : `${names[ev.player]} rolled ${ev.roll}, no move.`)
  }
  const current = names[state.turn]
  if (state.roll != null) bits.push(canAct ? `${current} rolled ${state.roll}. Tap a glowing token.` : `${current} rolled ${state.roll}…`)
  else if (canAct) bits.push(current === 'You' ? 'Your roll. Tap the dice.' : `${current}, tap the dice.`)
  else bits.push(`${current}'s turn…`)
  return bits.join(' ')
}

export default function LudoTable({ state, names, canAct, onRoll, onPick, onAnimating, actions }) {
  const { positions, animating } = useAnimatedPositions(state)
  const [rolling, setRolling] = useState(false)
  const [face, setFace] = useState(null)

  useEffect(() => onAnimating?.(animating), [animating, onAnimating])

  const color = COLOR_KEYS[state.colors[state.turn]]
  const movable = state.roll != null && canAct && !animating ? getMovableTokens(state, state.roll) : []
  const canRoll = canAct && state.roll == null && state.winner == null && !animating && !rolling

  function roll() {
    if (!canRoll) return
    setRolling(true)
    let n = 0
    const flick = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 6))
      n += 1
      if (n >= 6) {
        clearInterval(flick)
        setRolling(false)
        setFace(null)
        onRoll()
      }
    }, 70)
  }

  const diceValue = face ?? state.roll ?? state.lastRoll?.value ?? null

  // Only one token can move: move it for them after a beat.
  useEffect(() => {
    if (movable.length !== 1) return undefined
    const timer = setTimeout(() => onPick(movable[0]), 500)
    return () => clearTimeout(timer)
    // movable is rebuilt each render; key on what it's made from.
  }, [state.seq, movable.length === 1 ? movable[0] : -1])

  return (
    <div className="ludo-table">
      <div className="ludo-players">
        {names.map((name, i) => (
          <span
            key={i}
            className={`ludo-player-chip ludo-chip--${COLOR_KEYS[state.colors[i]]} ${state.turn === i && state.winner == null ? 'active' : ''}`}
          >
            <span className={`ludo-dot ludo-bg-${COLOR_KEYS[state.colors[i]]}`} />
            {name}
            <span className="ludo-home-count">{state.positions[i].filter((p) => p === 56).length}/4</span>
          </span>
        ))}
      </div>

      <div className="ludo-board-wrap">
        <LudoBoard
          state={state}
          positions={positions}
          movable={movable}
          onPick={canAct ? onPick : undefined}
          lastMoved={state.lastEvent?.type === 'move' ? state.lastEvent : null}
        />
      </div>

      <div className="ludo-controls">
        <div className="ludo-dice-wrap">
          <Dice value={diceValue} color={color} rolling={rolling} onClick={roll} disabled={!canRoll} />
          {/* Space is kept when hidden so the status line doesn't jump. */}
          <span className={`ludo-dice-tip ${canRoll ? '' : 'is-hidden'}`}>Press to roll</span>
        </div>
        <p className={`ludo-status ${state.winner != null ? 'is-over' : ''}`} aria-live="polite">
          <span className={`ludo-dot ludo-bg-${color}`} /> {statusText(state, names, canAct)}
        </p>
      </div>

      {actions && <div className="ludo-actions">{actions}</div>}
    </div>
  )
}
