// src/pages/games/snakes-and-ladders/SnlTable.jsx
// The play screen every mode shares: players, the board, the dice and a
// status line. A roll is played out square by square, then the token
// slides up the ladder or down the snake.
//
//   names       display name per player (turn order)
//   canRoll     true when the person holding this device controls the
//               current player
//   onRoll      () => void, called after the dice has tumbled
//   onAnimating (bool) => void, so controllers can wait for a move to finish

import { useEffect, useRef, useState } from 'react'
import SnlBoard, { PLAYER_KEYS } from './SnlBoard'

const STEP_MS = 170
const SLIDE_MS = 650

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
}

function Dice({ value, colour, rolling, ready, onClick }) {
  return (
    <button
      type="button"
      className={`snl-dice snl-dice--${colour} ${rolling ? 'is-rolling' : ''} ${ready ? 'is-ready' : ''}`}
      onClick={onClick}
      disabled={!ready}
      aria-label={ready ? 'Roll the dice' : value ? `Dice shows ${value}` : 'Dice'}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="4" y="4" width="92" height="92" rx="18" className="snl-dice-face" />
        {PIPS[value ?? 6].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="9" className="snl-dice-pip" />
        ))}
      </svg>
    </button>
  )
}

// Plays the latest roll out step by step. Returns the positions to draw
// and whether a move is still animating.
function useAnimatedPositions(state) {
  const [anim, setAnim] = useState(null) // { positions, sliding }
  const doneSeq = useRef(state.lastEvent?.seq ?? null)
  const ev = state.lastEvent

  useEffect(() => {
    if (!ev || ev.seq === doneSeq.current || ev.type === 'blocked') return undefined
    const frames = []
    for (let sq = ev.from + 1; sq <= ev.rolled; sq++) frames.push({ square: sq, sliding: false })
    if (ev.to !== ev.rolled) frames.push({ square: ev.to, sliding: true })
    let i = 0
    let timer
    const frame = () => {
      if (i >= frames.length) {
        doneSeq.current = ev.seq
        setAnim(null)
        return
      }
      const positions = state.positions.slice()
      positions[ev.player] = frames[i].square
      setAnim({ positions, sliding: frames[i].sliding })
      timer = setTimeout(frame, frames[i].sliding ? SLIDE_MS + 150 : STEP_MS)
      i += 1
    }
    frame()
    return () => {
      clearTimeout(timer)
      setAnim(null)
    }
  }, [ev?.seq])

  return { positions: anim?.positions ?? state.positions, sliding: !!anim?.sliding, animating: anim != null }
}

function statusText(state, names, canRoll, animating) {
  if (state.winner != null && !animating) return `${names[state.winner]} wins! 🎉`
  const ev = state.lastEvent
  const bits = []
  if (ev) {
    const who = names[ev.player]
    if (ev.type === 'blocked') bits.push(`${who} rolled ${ev.roll}, too many to finish.`)
    else if (animating) bits.push(`${who} rolled ${ev.roll}…`)
    else if (ev.type === 'ladder') bits.push(`${who} climbed a ladder to ${ev.to}! 🪜`)
    else if (ev.type === 'snake') bits.push(`${who} slid down a snake to ${ev.to}. 🐍`)
    else bits.push(`${who} rolled ${ev.roll}, now on ${ev.to}.`)
  }
  if (!animating && state.winner == null) {
    const current = names[state.turn]
    bits.push(canRoll ? (current === 'You' ? 'Your roll.' : `${current}, tap the dice.`) : `${current}'s turn…`)
  }
  return bits.join(' ')
}

export default function SnlTable({ state, names, canRoll, onRoll, onAnimating, actions }) {
  const { positions, sliding, animating } = useAnimatedPositions(state)
  const [rolling, setRolling] = useState(false)
  const [face, setFace] = useState(null)

  useEffect(() => onAnimating?.(animating), [animating, onAnimating])

  const ready = canRoll && state.winner == null && !animating && !rolling
  const shownPlayer = animating && state.lastEvent ? state.lastEvent.player : state.turn

  function roll() {
    if (!ready) return
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

  return (
    <div className="snl-table">
      <div className="snl-players">
        {names.map((name, i) => (
          <span key={i} className={`snl-player-chip ${state.turn === i && state.winner == null ? 'active' : ''}`}>
            <span className={`snl-dot snl-bg-${PLAYER_KEYS[i]}`} />
            {name}
            <span className="snl-player-square">{state.positions[i] || 'start'}</span>
          </span>
        ))}
      </div>

      <div className={`snl-board-wrap ${sliding ? 'is-sliding' : ''}`}>
        <SnlBoard numPlayers={state.numPlayers} positions={positions} lastMover={state.lastEvent?.player} />
      </div>

      <div className="snl-controls">
        <div className="snl-dice-wrap">
          <Dice
            value={face ?? state.lastEvent?.roll ?? null}
            colour={PLAYER_KEYS[shownPlayer]}
            rolling={rolling}
            ready={ready}
            onClick={roll}
          />
          {/* Space is kept when hidden so the status line doesn't jump. */}
          <span className={`snl-dice-tip ${ready ? '' : 'is-hidden'}`}>Press to roll</span>
        </div>
        <p className={`snl-status ${state.winner != null && !animating ? 'is-over' : ''}`} aria-live="polite">
          {statusText(state, names, canRoll, animating)}
        </p>
      </div>

      {actions && <div className="snl-actions">{actions}</div>}
    </div>
  )
}
