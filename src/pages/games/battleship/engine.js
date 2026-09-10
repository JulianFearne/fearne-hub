// src/pages/games/battleship/engine.js
// Pure Battleship logic. No React. Board is `SIZE` x `SIZE`; fleets are
// placed randomly (no manual placement UI, see Battleship.jsx) so setup is
// instant and there is nothing for the placing player to get wrong.

export const SIZE = 8

export const SHIP_SPECS = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
]

function cellsFor(row, col, length, horizontal) {
  const cells = []
  for (let i = 0; i < length; i++) {
    cells.push(horizontal ? [row, col + i] : [row + i, col])
  }
  return cells
}

function fits(cells) {
  return cells.every(([r, c]) => r >= 0 && r < SIZE && c >= 0 && c < SIZE)
}

// Randomly places every ship in SHIP_SPECS with no overlaps. Retries a
// placement that collides; restarts from scratch if a ship can't find a
// spot within a bounded number of tries (never happens at this board size,
// but bails out safely rather than looping forever).
export function placeFleet(rng = Math.random) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const occupied = new Set()
    const ships = []
    let ok = true

    for (const spec of SHIP_SPECS) {
      let placed = null
      for (let tries = 0; tries < 200; tries++) {
        const horizontal = rng() < 0.5
        const row = Math.floor(rng() * SIZE)
        const col = Math.floor(rng() * SIZE)
        const cells = cellsFor(row, col, spec.length, horizontal)
        if (!fits(cells)) continue
        if (cells.some(([r, c]) => occupied.has(`${r},${c}`))) continue
        placed = cells
        break
      }
      if (!placed) {
        ok = false
        break
      }
      placed.forEach(([r, c]) => occupied.add(`${r},${c}`))
      ships.push({
        id: spec.name,
        name: spec.name,
        length: spec.length,
        cells: placed,
        hits: Array(spec.length).fill(false),
      })
    }

    if (ok) return ships
  }
  throw new Error('Could not place fleet')
}

export function createShotsGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
}

export function isFleetSunk(ships) {
  return ships.every((ship) => ship.hits.every(Boolean))
}

// Returns { ships, shotsGrid, result }, NEW arrays, never mutates the
// input. result: { alreadyFired, hit, sunkShip (ship | null), allSunk }.
export function fireAt(ships, shotsGrid, r, c) {
  if (shotsGrid[r][c] != null) {
    return { ships, shotsGrid, result: { alreadyFired: true, hit: false, sunkShip: null, allSunk: isFleetSunk(ships) } }
  }

  const shipIndex = ships.findIndex((ship) => ship.cells.some(([sr, sc]) => sr === r && sc === c))
  const nextGrid = shotsGrid.map((row) => row.slice())

  if (shipIndex === -1) {
    nextGrid[r][c] = 'miss'
    return { ships, shotsGrid: nextGrid, result: { alreadyFired: false, hit: false, sunkShip: null, allSunk: false } }
  }

  nextGrid[r][c] = 'hit'
  const ship = ships[shipIndex]
  const cellIndex = ship.cells.findIndex(([sr, sc]) => sr === r && sc === c)
  const hits = ship.hits.slice()
  hits[cellIndex] = true
  const nextShip = { ...ship, hits }
  const nextShips = ships.slice()
  nextShips[shipIndex] = nextShip

  const sunk = hits.every(Boolean)
  return {
    ships: nextShips,
    shotsGrid: nextGrid,
    result: { alreadyFired: false, hit: true, sunkShip: sunk ? nextShip : null, allSunk: isFleetSunk(nextShips) },
  }
}
