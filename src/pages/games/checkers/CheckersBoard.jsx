// src/pages/games/checkers/CheckersBoard.jsx
// The board as one SVG, 8 x 8 squares of 1 unit. Pieces are keyed by id
// and positioned with a CSS transform, so a move slides across the board
// (and a multi-jump hops square by square, driven by CheckersTable).
// `flipped` turns the board round so the person holding the phone always
// has their own pieces at the bottom online.

import { SIZE, rowOf, colOf } from './engine'

function point(square, flipped) {
  const r = rowOf(square)
  const c = colOf(square)
  return flipped ? { x: SIZE - 1 - c + 0.5, y: SIZE - 1 - r + 0.5 } : { x: c + 0.5, y: r + 0.5 }
}

// A small crown, centred on 0,0, about 0.4 units wide.
const CROWN = 'M -0.2 0.1 L -0.22 -0.12 L -0.1 0 L 0 -0.16 L 0.1 0 L 0.22 -0.12 L 0.2 0.1 Z'

export default function CheckersBoard({
  pieces, // [{ id, side, king, square }]
  flipped = false,
  movable = new Set(), // squares holding a piece that can move
  selected = null,
  targets = new Set(), // squares the selected piece can step to next
  trail = [], // squares already chosen in a multi-jump
  last = null, // { from, to } of the last move
  onSquare,
}) {
  const squares = []
  for (let s = 0; s < SIZE * SIZE; s++) {
    const { x, y } = point(s, flipped)
    const dark = (rowOf(s) + colOf(s)) % 2 === 1
    let cls = dark ? 'ck-sq ck-sq--dark' : 'ck-sq ck-sq--light'
    if (last && (s === last.from || s === last.to)) cls += ' is-last'
    if (s === selected) cls += ' is-selected'
    if (trail.includes(s)) cls += ' is-trail'
    squares.push(
      <rect
        key={s}
        x={x - 0.5}
        y={y - 0.5}
        width="1"
        height="1"
        className={cls}
        onClick={dark ? () => onSquare?.(s) : undefined}
      />,
    )
  }

  return (
    <svg className="ck-svg" viewBox={`-0.15 -0.15 ${SIZE + 0.3} ${SIZE + 0.3}`} role="img" aria-label="Draughts board">
      <rect x="-0.15" y="-0.15" width={SIZE + 0.3} height={SIZE + 0.3} rx="0.18" className="ck-frame" />
      {squares}
      {[...targets].map((s) => {
        const { x, y } = point(s, flipped)
        return <circle key={`t${s}`} cx={x} cy={y} r="0.17" className="ck-target" onClick={() => onSquare?.(s)} />
      })}
      {pieces.map((p) => {
        const { x, y } = point(p.square, flipped)
        const can = movable.has(p.square)
        return (
          <g
            key={p.id}
            className={`ck-piece ck-piece--${p.side === 0 ? 'red' : 'white'} ${can ? 'can-move' : ''} ${p.square === selected ? 'is-selected' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => onSquare?.(p.square)}
          >
            <circle r="0.4" cy="0.05" className="ck-piece-shadow" />
            <circle r="0.4" className="ck-piece-rim" />
            <circle r="0.31" className="ck-piece-top" />
            <circle r="0.22" className="ck-piece-ring" />
            {p.king && <path d={CROWN} className="ck-crown" />}
          </g>
        )
      })}
    </svg>
  )
}
