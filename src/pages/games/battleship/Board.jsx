// src/pages/games/battleship/Board.jsx
// One sea grid with A-H / 1-8 labels. Three stacked layers share the same
// CSS grid: the water, the ship drawings (each spanning its cells), then the
// cells themselves carrying the hit / miss markers on top.
//
//   ships     ships to draw (your whole fleet, or just the enemy's sunk ones)
//   shots     SIZE x SIZE grid of 'hit' | 'miss' | null
//   onFire    (r, c) => void, makes untried cells tappable
//   lastShot  [r, c] to highlight (and animate) the most recent shot
//   size      'lg' (the board you fire at) | 'sm' (your own fleet)

import { COL_LABELS, SIZE, cellLabel, isHorizontal, isSunk } from './engine'
import { HitMarker, MissMarker, ShipSvg } from './Ships'

export default function Board({ ships = [], shots, onFire, disabled = false, lastShot = null, size = 'lg', label }) {
  const interactive = !!onFire && !disabled

  return (
    <div className={`bsh-board bsh-board--${size} ${interactive ? 'is-live' : ''}`}>
      {label && <div className="bsh-board-label">{label}</div>}
      <div className="bsh-grid" style={{ '--bsh-size': SIZE }}>
        {Array.from({ length: SIZE }, (_, c) => (
          <span key={`col-${c}`} className="bsh-axis" style={{ gridRow: 1, gridColumn: c + 2 }}>
            {COL_LABELS[c]}
          </span>
        ))}
        {Array.from({ length: SIZE }, (_, r) => (
          <span key={`row-${r}`} className="bsh-axis" style={{ gridRow: r + 2, gridColumn: 1 }}>
            {r + 1}
          </span>
        ))}

        <div className="bsh-sea" style={{ gridRow: `2 / span ${SIZE}`, gridColumn: `2 / span ${SIZE}` }} />

        {ships.map((ship) => {
          const [r, c] = ship.cells[0]
          const horizontal = isHorizontal(ship)
          return (
            <div
              key={ship.id}
              className={`bsh-ship ${isSunk(ship) ? 'is-sunk' : ''}`}
              style={{
                gridRow: `${r + 2} / span ${horizontal ? 1 : ship.length}`,
                gridColumn: `${c + 2} / span ${horizontal ? ship.length : 1}`,
              }}
            >
              <ShipSvg name={ship.name} length={ship.length} vertical={!horizontal} />
            </div>
          )
        })}

        {Array.from({ length: SIZE }, (_, r) =>
          Array.from({ length: SIZE }, (_, c) => {
            const mark = shots?.[r]?.[c] ?? null
            const isLast = lastShot && lastShot[0] === r && lastShot[1] === c
            const canFire = interactive && mark == null
            const marker = mark === 'hit' ? <HitMarker /> : mark === 'miss' ? <MissMarker /> : null
            const style = { gridRow: r + 2, gridColumn: c + 2 }
            const cls = `bsh-cell ${mark ?? ''} ${isLast ? 'is-last' : ''}`
            return canFire ? (
              <button
                key={`${r}-${c}`}
                type="button"
                className={cls}
                style={style}
                onClick={() => onFire(r, c)}
                aria-label={`Fire at ${cellLabel(r, c)}`}
              />
            ) : (
              <div key={`${r}-${c}`} className={cls} style={style}>
                {marker}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
