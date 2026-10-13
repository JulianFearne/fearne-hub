// src/pages/games/snakes-and-ladders/SnlBoard.jsx
// The board as one SVG in 10x10 square units: a chequered grid numbered
// 1-100 (boustrophedon, square 1 bottom left), every ladder drawn as two
// rails and rungs from its foot to its top, and every snake drawn whole as
// a wiggling, tapering body from head to tail. Tokens sit on top and slide
// between squares (a CSS transition on their transform).

import { BOARD_SIZE, CHUTES_AND_LADDERS } from './engine'

export const PLAYER_KEYS = ['red', 'blue', 'green', 'yellow']
const SNAKE_COLOURS = ['green', 'purple', 'orange', 'teal', 'red', 'olive', 'pink', 'blue']

// Centre of a square in board units (x right, y down).
export function squarePoint(square) {
  const row = Math.floor((square - 1) / 10)
  const within = (square - 1) % 10
  const col = row % 2 === 0 ? within : 9 - within
  return { x: col + 0.5, y: 9 - row + 0.5 }
}

// Where a token waiting to start (position 0) sits: in the margin beside
// square 1, stacked upwards.
function startPoint(player) {
  return { x: -0.42, y: 9.65 - player * 0.6 }
}

export function tokenSpot(player, position) {
  return position === 0 ? startPoint(player) : squarePoint(position)
}

const fmt = (n) => Math.round(n * 1000) / 1000

function Ladder({ from, to }) {
  const a = squarePoint(from)
  const b = squarePoint(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const nx = -uy * 0.2
  const ny = ux * 0.2
  // Pull the ends in a little so the ladder sits inside its squares.
  const sx = a.x - ux * 0.15
  const sy = a.y - uy * 0.15
  const ex = b.x + ux * 0.15
  const ey = b.y + uy * 0.15
  const total = len + 0.3
  const rungs = []
  for (let d = 0.3; d < total - 0.15; d += 0.36) {
    const px = sx + ux * d
    const py = sy + uy * d
    rungs.push(<line key={d} x1={fmt(px + nx)} y1={fmt(py + ny)} x2={fmt(px - nx)} y2={fmt(py - ny)} className="snl-rung" />)
  }
  return (
    <g className="snl-ladder">
      <line x1={fmt(sx + nx)} y1={fmt(sy + ny)} x2={fmt(ex + nx)} y2={fmt(ey + ny)} className="snl-rail-shadow" />
      <line x1={fmt(sx - nx)} y1={fmt(sy - ny)} x2={fmt(ex - nx)} y2={fmt(ey - ny)} className="snl-rail-shadow" />
      {rungs}
      <line x1={fmt(sx + nx)} y1={fmt(sy + ny)} x2={fmt(ex + nx)} y2={fmt(ey + ny)} className="snl-rail" />
      <line x1={fmt(sx - nx)} y1={fmt(sy - ny)} x2={fmt(ex - nx)} y2={fmt(ey - ny)} className="snl-rail" />
    </g>
  )
}

// A snake from its head (the higher square) down to its tail: a centreline
// that wiggles side to side, outlined as a body that tapers to the tail.
function Snake({ head, tail, colour, index }) {
  const a = squarePoint(head)
  const b = squarePoint(tail)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux
  const waves = Math.max(1.5, Math.round(len / 1.6) + 0.5)
  const amp = Math.min(0.42, 0.18 + len * 0.04)
  const phase = index % 2 === 0 ? 1 : -1
  const N = 48

  const centre = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    // Wiggle fades in just behind the head and out at the tail tip.
    const envelope = Math.sin(Math.min(1, t * 1.6) * (Math.PI / 2)) * (1 - 0.35 * t)
    const off = phase * amp * envelope * Math.sin(t * waves * Math.PI * 2)
    centre.push({ x: a.x + dx * t + px * off, y: a.y + dy * t + py * off, t })
  }

  const left = []
  const right = []
  for (let i = 0; i <= N; i++) {
    const p = centre[i]
    const q = centre[Math.min(N, i + 1)]
    const o = centre[Math.max(0, i - 1)]
    let tx = q.x - o.x
    let ty = q.y - o.y
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const w = 0.17 * (1 - 0.85 * p.t) + 0.015
    left.push(`${fmt(p.x - ty * w)},${fmt(p.y + tx * w)}`)
    right.push(`${fmt(p.x + ty * w)},${fmt(p.y - tx * w)}`)
  }
  const body = `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`
  const spine = `M ${centre.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' L ')}`

  // Head: an oval pointing back up the body, with eyes and a tongue.
  const h0 = centre[0]
  const h1 = centre[3]
  const angle = (Math.atan2(h0.y - h1.y, h0.x - h1.x) * 180) / Math.PI

  return (
    <g className={`snl-snake snl-snake--${colour}`}>
      <path d={body} className="snl-snake-body" />
      <path d={spine} className="snl-snake-spots" />
      <g transform={`translate(${fmt(h0.x)} ${fmt(h0.y)}) rotate(${fmt(angle)})`}>
        <path d="M 0.2 0 L 0.38 0 M 0.38 0 L 0.45 -0.05 M 0.38 0 L 0.45 0.05" className="snl-snake-tongue" />
        <ellipse cx="0.02" cy="0" rx="0.25" ry="0.2" className="snl-snake-head" />
        <circle cx="0.09" cy="-0.09" r="0.055" className="snl-snake-eye" />
        <circle cx="0.09" cy="0.09" r="0.055" className="snl-snake-eye" />
        <circle cx="0.11" cy="-0.09" r="0.025" className="snl-snake-pupil" />
        <circle cx="0.11" cy="0.09" r="0.025" className="snl-snake-pupil" />
      </g>
    </g>
  )
}

export default function SnlBoard({ numPlayers, positions, lastMover }) {
  const squares = []
  for (let n = 1; n <= BOARD_SIZE; n++) {
    const { x, y } = squarePoint(n)
    const row = Math.floor((n - 1) / 10)
    const shade = (row + Math.floor(x)) % 2 === 0 ? 'a' : 'b'
    squares.push(
      <g key={n}>
        <rect x={x - 0.5} y={y - 0.5} width="1" height="1" className={`snl-sq snl-sq--${shade} ${n === 100 ? 'snl-sq--finish' : ''}`} />
        <text x={x - 0.42} y={y - 0.27} className="snl-sq-num">
          {n}
        </text>
      </g>,
    )
  }

  const entries = Object.entries(CHUTES_AND_LADDERS).map(([from, to]) => [Number(from), to])
  const ladders = entries.filter(([from, to]) => to > from)
  const snakes = entries.filter(([from, to]) => to < from)

  // Fan out tokens that share a square.
  const tokens = []
  const groups = new Map()
  for (let p = 0; p < numPlayers; p++) {
    const spot = tokenSpot(p, positions[p])
    const key = positions[p] === 0 ? `start-${p}` : `sq-${positions[p]}`
    if (!groups.has(key)) groups.set(key, [])
    const tok = { p, ...spot }
    groups.get(key).push(tok)
    tokens.push(tok)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.forEach((tok, i) => {
      const ang = (i / group.length) * Math.PI * 2 + Math.PI / 4
      tok.x += Math.cos(ang) * 0.2
      tok.y += Math.sin(ang) * 0.2
    })
  }

  return (
    <svg className="snl-svg" viewBox="-0.85 -0.05 10.9 10.1" role="img" aria-label="Snakes and ladders board">
      <rect x="0" y="0" width="10" height="10" rx="0.12" className="snl-board-bg" />
      {squares}
      <text x={squarePoint(100).x + 0.2} y={squarePoint(100).y + 0.32} className="snl-finish-flag">
        🏁
      </text>
      {ladders.map(([from, to]) => (
        <Ladder key={`l-${from}`} from={from} to={to} />
      ))}
      {snakes.map(([head, tail], i) => (
        <Snake key={`s-${head}`} head={head} tail={tail} colour={SNAKE_COLOURS[i % SNAKE_COLOURS.length]} index={i} />
      ))}
      {tokens.map((tok) => (
        <g
          key={tok.p}
          className={`snl-token-g ${lastMover === tok.p ? 'is-last' : ''}`}
          style={{ transform: `translate(${tok.x}px, ${tok.y}px)` }}
        >
          <circle r="0.27" className={`snl-token-body snl-fill-${PLAYER_KEYS[tok.p]}`} />
          <circle r="0.12" cy="-0.05" className="snl-token-shine" />
        </g>
      ))}
    </svg>
  )
}
