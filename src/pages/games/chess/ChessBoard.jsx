// src/pages/games/chess/ChessBoard.jsx
// The board as one SVG, 8 x 8 squares of 1 unit, a8 top left. Pieces are
// keyed by the id engine.trackPieces gives them and positioned with a CSS
// transform, so moves slide (castling slides the rook too). `flipped`
// puts Black at the bottom. Highlights: the last move, the selected piece,
// where it can go (dots, or rings round pieces it can take) and a king in
// check.

import { createElement } from 'react'
import { FILES } from './engine'
import { PIECES } from './pieces'

function draw(node, key) {
  const [tag, attrs, kids] = node
  const { id, ...rest } = attrs // the source art repeats ids; drop them
  return createElement(tag, { ...rest, key }, kids?.map((k, i) => draw(k, i)))
}

// Each piece drawn once, then reused (also by ChessTable for small pieces).
export const ART = Object.fromEntries(
  Object.entries(PIECES).map(([key, nodes]) => [key, Array.isArray(nodes[0]) ? nodes.map((n, i) => draw(n, i)) : draw(nodes, 0)]),
)

function point(square, flipped) {
  const f = FILES.indexOf(square[0])
  const r = 8 - Number(square[1])
  return flipped ? { x: 7 - f, y: 7 - r } : { x: f, y: r }
}

export default function ChessBoard({
  pieces, // [{ id, type, color, square }]
  flipped = false,
  selected = null,
  targets = [], // [{ square, capture }]
  last = null, // { from, to }
  check = null, // square of a king in check
  movable = new Set(), // squares of pieces that can move now
  onSquare,
}) {
  const squares = []
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const square = FILES[f] + (8 - r)
      const { x, y } = point(square, flipped)
      const dark = (r + f) % 2 === 1
      let cls = `cs-sq ${dark ? 'cs-sq--dark' : 'cs-sq--light'}`
      if (last && (square === last.from || square === last.to)) cls += ' is-last'
      if (square === selected) cls += ' is-selected'
      squares.push(<rect key={square} x={x} y={y} width="1" height="1" className={cls} onClick={() => onSquare?.(square)} />)
    }
  }

  // File letters along the bottom edge, rank numbers up the left.
  const labels = []
  for (let i = 0; i < 8; i++) {
    const file = flipped ? FILES[7 - i] : FILES[i]
    const rank = flipped ? i + 1 : 8 - i
    labels.push(
      <text key={`f${i}`} x={i + 0.94} y={7.94} className={`cs-coord ${(i + 7) % 2 ? 'on-dark' : 'on-light'}`} textAnchor="end">
        {file}
      </text>,
      <text key={`r${i}`} x={0.05} y={i + 0.22} className={`cs-coord ${i % 2 ? 'on-dark' : 'on-light'}`}>
        {rank}
      </text>,
    )
  }

  return (
    <svg className="cs-svg" viewBox="0 0 8 8" role="img" aria-label="Chess board">
      {squares}
      {labels}
      {check && (() => {
        const { x, y } = point(check, flipped)
        return <rect x={x} y={y} width="1" height="1" className="cs-check" />
      })()}
      {pieces.map((p) => {
        const { x, y } = point(p.square, flipped)
        return (
          <g
            key={p.id}
            className={`cs-piece ${movable.has(p.square) ? 'can-move' : ''} ${p.square === selected ? 'is-selected' : ''}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            onClick={() => onSquare?.(p.square)}
          >
            <rect width="1" height="1" fill="transparent" />
            <g transform="translate(0.02 0.02) scale(0.0213)">{ART[p.color + p.type.toUpperCase()]}</g>
          </g>
        )
      })}
      {targets.map((t) => {
        const { x, y } = point(t.square, flipped)
        return t.capture ? (
          <circle key={t.square} cx={x + 0.5} cy={y + 0.5} r="0.45" className="cs-target-ring" onClick={() => onSquare?.(t.square)} />
        ) : (
          <circle key={t.square} cx={x + 0.5} cy={y + 0.5} r="0.16" className="cs-target" onClick={() => onSquare?.(t.square)} />
        )
      })}
    </svg>
  )
}
