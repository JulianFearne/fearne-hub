// src/pages/games/battleship/FleetRoster.jsx
// The ship list beside each board: every ship, drawn small, marked afloat
// or sunk. Your own roster also shows damage pips (you know where you've
// been hit); the enemy roster only shows what's been sunk, as in the real
// game.

import { isSunk, shipsAfloat } from './engine'
import { ShipSvg } from './Ships'

export default function FleetRoster({ title, ships, showDamage = false }) {
  return (
    <div className="bsh-roster">
      <div className="bsh-roster-head">
        <span className="bsh-roster-title">{title}</span>
        <span className="bsh-roster-count">
          {shipsAfloat(ships)}/{ships.length} afloat
        </span>
      </div>
      <ul className="bsh-roster-list">
        {ships.map((ship) => {
          const sunk = isSunk(ship)
          return (
            <li key={ship.id} className={`bsh-roster-item ${sunk ? 'is-sunk' : ''}`}>
              <span className="bsh-roster-ship" style={{ '--bsh-len': ship.length }}>
                <ShipSvg name={ship.name} length={ship.length} />
              </span>
              <span className="bsh-roster-name">{ship.name}</span>
              {showDamage && !sunk && (
                <span className="bsh-roster-pips" aria-label={`${ship.hits.filter(Boolean).length} hits`}>
                  {ship.hits.map((hit, i) => (
                    <span key={i} className={`bsh-pip ${hit ? 'is-hit' : ''}`} />
                  ))}
                </span>
              )}
              <span className={`bsh-roster-status ${sunk ? 'is-sunk' : ''}`}>{sunk ? 'Sunk' : 'Afloat'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
