// src/pages/games/ludo/LudoBoard.jsx
// The classic cross-shaped board drawn as one SVG in 15x15 grid units:
// four coloured yards, the white track with coloured start squares and home
// columns, entry arrows, and the four-colour centre. Tokens slide between
// cells (a CSS transition on their transform), and the ones you can move
// pulse and are tappable.

import { TOKENS_PER_PLAYER } from './engine'
import { ENTRY_ARROWS, GRID, HOME_COLUMNS, TRACK, YARD_ORIGINS, tokenPoint } from './board'

export const COLOR_KEYS = ['blue', 'red', 'green', 'yellow']

const ARROW_ROTATE = { right: 0, down: 90, left: 180, up: 270 }

function Arrow({ cell, dir, color }) {
  const [r, c] = cell
  return (
    <g transform={`translate(${c + 0.5} ${r + 0.5}) rotate(${ARROW_ROTATE[dir]})`} className={`ludo-fill-${COLOR_KEYS[color]}`}>
      <path d="M -0.34 -0.05 L 0.12 -0.05 L 0.12 -0.18 L 0.36 0 L 0.12 0.18 L 0.12 0.05 L -0.34 0.05 Z" />
    </g>
  )
}

export default function LudoBoard({ state, positions, movable = [], onPick, lastMoved }) {
  const shown = positions ?? state.positions

  // Group tokens by where they stand so a shared cell can fan them out.
  const tokens = []
  const byPoint = new Map()
  for (let p = 0; p < state.numPlayers; p++) {
    const color = state.colors[p]
    for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
      const pt = tokenPoint(color, shown[p][t], t)
      const key = `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`
      if (!byPoint.has(key)) byPoint.set(key, [])
      const entry = { p, t, color, ...pt, pos: shown[p][t] }
      byPoint.get(key).push(entry)
      tokens.push(entry)
    }
  }
  for (const group of byPoint.values()) {
    if (group.length < 2) continue
    group.forEach((tok, i) => {
      const angle = (i / group.length) * Math.PI * 2
      tok.x += Math.cos(angle) * 0.17
      tok.y += Math.sin(angle) * 0.17
      tok.small = true
    })
  }

  const canPick = (p, t) => p === state.turn && movable.includes(t) && !!onPick

  return (
    <svg className="ludo-svg" viewBox={`-0.1 -0.1 ${GRID + 0.2} ${GRID + 0.2}`} role="img" aria-label="Ludo board">
      <rect x="0" y="0" width={GRID} height={GRID} className="ludo-board-bg" />

      {/* yards */}
      {YARD_ORIGINS.map(([r0, c0], color) => (
        <g key={`yard-${color}`}>
          <rect x={c0} y={r0} width="6" height="6" className={`ludo-fill-${COLOR_KEYS[color]}`} />
          <rect x={c0 + 1} y={r0 + 1} width="4" height="4" className="ludo-yard-inner" />
          {[
            [2, 2],
            [2, 4],
            [4, 2],
            [4, 4],
          ].map(([dr, dc]) => (
            <rect
              key={`${dr}-${dc}`}
              x={c0 + dc - 0.55}
              y={r0 + dr - 0.55}
              width="1.1"
              height="1.1"
              rx="0.08"
              className={`ludo-fill-${COLOR_KEYS[color]}`}
            />
          ))}
        </g>
      ))}

      {/* track, with each colour's start square filled in */}
      {TRACK.map(([r, c], i) => (
        <rect
          key={`t-${i}`}
          x={c}
          y={r}
          width="1"
          height="1"
          className={i % 13 === 0 ? `ludo-cell ludo-fill-${COLOR_KEYS[i / 13]}` : 'ludo-cell'}
        />
      ))}

      {/* home columns */}
      {HOME_COLUMNS.map((cells, color) =>
        cells.map(([r, c], i) => (
          <rect key={`h-${color}-${i}`} x={c} y={r} width="1" height="1" className={`ludo-cell ludo-fill-${COLOR_KEYS[color]}`} />
        )),
      )}

      {ENTRY_ARROWS.map((a, color) => (
        <Arrow key={`arrow-${color}`} cell={a.cell} dir={a.dir} color={color} />
      ))}

      {/* centre: blue left, red top, green right, yellow bottom */}
      <polygon points="6,6 6,9 7.5,7.5" className="ludo-fill-blue ludo-centre" />
      <polygon points="6,6 9,6 7.5,7.5" className="ludo-fill-red ludo-centre" />
      <polygon points="9,6 9,9 7.5,7.5" className="ludo-fill-green ludo-centre" />
      <polygon points="6,9 9,9 7.5,7.5" className="ludo-fill-yellow ludo-centre" />

      {/* tokens */}
      {tokens.map((tok) => {
        const pickable = canPick(tok.p, tok.t)
        const isLast = lastMoved && lastMoved.player === tok.p && lastMoved.tokenIndex === tok.t
        const r = tok.pos === 56 ? 0.16 : tok.small ? 0.27 : 0.36
        return (
          <g
            key={`tok-${tok.p}-${tok.t}`}
            className={`ludo-token ${pickable ? 'is-pickable' : ''} ${isLast ? 'is-last' : ''}`}
            style={{ transform: `translate(${tok.x}px, ${tok.y}px)` }}
            onClick={pickable ? () => onPick(tok.t) : undefined}
            role={pickable ? 'button' : undefined}
            aria-label={pickable ? `Move ${COLOR_KEYS[tok.color]} token ${tok.t + 1}` : undefined}
          >
            {pickable && <circle r={r + 0.14} className="ludo-token-halo" />}
            <circle r={r} className={`ludo-token-body ludo-fill-${COLOR_KEYS[tok.color]}`} />
            <circle r={r * 0.5} className="ludo-token-top" />
            {pickable && <circle r="0.62" className="ludo-token-hit" />}
          </g>
        )
      })}
    </svg>
  )
}
