// src/pages/games/battleship/BattleView.jsx
// The in-battle screen every mode shares: the enemy's waters on top (the
// board you fire at, with their sunk ships revealed), your own fleet below
// with where they've hit you, and a ship list under each.
//
// `reveal` shows the enemy's whole fleet, used once the game is over.

import { isSunk } from './engine'
import Board from './Board'
import FleetRoster from './FleetRoster'

export default function BattleView({
  enemyName,
  enemyShips,
  myShots,
  myShips,
  theirShots,
  onFire,
  canFire,
  lastMine,
  lastTheirs,
  reveal = false,
}) {
  return (
    <div className="bsh-battle">
      <section className="bsh-side">
        <Board
          label={`${enemyName}'s waters`}
          ships={reveal ? enemyShips : enemyShips.filter(isSunk)}
          shots={myShots}
          onFire={onFire}
          disabled={!canFire}
          lastShot={lastMine}
          size="lg"
        />
        <FleetRoster title={`${enemyName}'s fleet`} ships={enemyShips} />
      </section>

      <section className="bsh-side">
        <Board label="Your fleet" ships={myShips} shots={theirShots} lastShot={lastTheirs} size="sm" />
        <FleetRoster title="Your fleet" ships={myShips} showDamage />
      </section>
    </div>
  )
}

