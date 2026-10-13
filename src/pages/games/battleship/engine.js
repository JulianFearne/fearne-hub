// src/pages/games/battleship/engine.js
// Pure Battleship logic. No React. Board is `SIZE` x `SIZE`; fleets are
// placed randomly (a "Shuffle" button on the deploy screen re-rolls them,
// there is no drag-and-drop placement) so setup is quick and there is
// nothing for the placing player to get wrong.
//
// A ship is { id, name, length, cells: [[r, c], ...], hits: [bool, ...] }.
// Online games store a "bare" fleet (no hits, see bareFleet) and rebuild
// the hits by replaying the shot log through fireAt (see deriveOnline).

export const SIZE = 8
export const COL_LABELS = 'ABCDEFGH'

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

export function isSunk(ship) {
  return ship.hits.every(Boolean)
}

export function isFleetSunk(ships) {
  return ships.every(isSunk)
}

export function shipsAfloat(ships) {
  return ships.filter((ship) => !isSunk(ship)).length
}

export function isHorizontal(ship) {
  return ship.cells.length < 2 || ship.cells[0][0] === ship.cells[1][0]
}

export function shipAt(ships, r, c) {
  return ships.find((ship) => ship.cells.some(([sr, sc]) => sr === r && sc === c)) ?? null
}

// "C4" style label for a cell, used in status lines.
export function cellLabel(r, c) {
  return `${COL_LABELS[c]}${r + 1}`
}

// Returns { ships, shotsGrid, result }, NEW arrays, never mutates the
// input. result: { alreadyFired, hit, ship (ship hit | null), sunkShip
// (ship | null), allSunk }.
export function fireAt(ships, shotsGrid, r, c) {
  if (shotsGrid[r][c] != null) {
    return {
      ships,
      shotsGrid,
      result: { alreadyFired: true, hit: false, ship: null, sunkShip: null, allSunk: isFleetSunk(ships) },
    }
  }

  const shipIndex = ships.findIndex((ship) => ship.cells.some(([sr, sc]) => sr === r && sc === c))
  const nextGrid = shotsGrid.map((row) => row.slice())

  if (shipIndex === -1) {
    nextGrid[r][c] = 'miss'
    return {
      ships,
      shotsGrid: nextGrid,
      result: { alreadyFired: false, hit: false, ship: null, sunkShip: null, allSunk: false },
    }
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
    result: {
      alreadyFired: false,
      hit: true,
      ship: nextShip,
      sunkShip: sunk ? nextShip : null,
      allSunk: isFleetSunk(nextShips),
    },
  }
}

// ---------- online ----------

// What gets stored in bs_players.fleet: positions only, no hits.
export function bareFleet(ships) {
  return ships.map(({ name, length, cells }) => ({ name, length, cells }))
}

export function hydrateFleet(bare) {
  return (bare ?? []).map((ship) => ({
    id: ship.name,
    name: ship.name,
    length: ship.length,
    cells: ship.cells,
    hits: Array(ship.length).fill(false),
  }))
}

export function otherSeat(seat) {
  return seat === 1 ? 2 : 1
}

// Rebuilds a whole online game from both bare fleets plus the shot log.
// Seat 1 fires first and turns strictly alternate, so shot N belongs to
// seat 1 when N is odd. Rows that break that (or repeat a cell) are skipped
// rather than trusted, so a stray row can't corrupt the board.
//
// Returns {
//   ships: { 1, 2 }   each seat's OWN fleet, with hits applied
//   shots: { 1, 2 }   the grid each seat has fired into (at the other fleet)
//   shotCount, nextSeat, winner (1 | 2 | null),
//   lastShot: { seat, r, c, result } | null
// }
export function deriveOnline(bareFleets, shotRows) {
  const ships = { 1: hydrateFleet(bareFleets[1]), 2: hydrateFleet(bareFleets[2]) }
  const shots = { 1: createShotsGrid(), 2: createShotsGrid() }
  let shotCount = 0
  let winner = null
  let lastShot = null

  const ordered = [...(shotRows ?? [])].sort((a, b) => a.shot_number - b.shot_number)
  for (const row of ordered) {
    if (winner) break
    const expectedSeat = shotCount % 2 === 0 ? 1 : 2
    if (row.shot_number !== shotCount + 1 || row.seat !== expectedSeat) continue
    const target = otherSeat(row.seat)
    const out = fireAt(ships[target], shots[row.seat], row.cell_row, row.cell_col)
    if (out.result.alreadyFired) continue
    ships[target] = out.ships
    shots[row.seat] = out.shotsGrid
    shotCount += 1
    lastShot = { seat: row.seat, r: row.cell_row, c: row.cell_col, result: out.result }
    if (out.result.allSunk) winner = row.seat
  }

  return {
    ships,
    shots,
    shotCount,
    nextSeat: shotCount % 2 === 0 ? 1 : 2,
    winner,
    lastShot,
  }
}

// One-line description of a shot for status lines. `who` fired at the
// `target` side: 'you' (your ships, so the ship can be named) or 'them'.
export function describeShot(who, target, r, c, result) {
  if (!result) return ''
  const at = cellLabel(r, c)
  if (target === 'you') {
    if (result.sunkShip) return `${who} sank your ${result.sunkShip.name} at ${at}!`
    if (result.hit) return `${who} hit your ${result.ship.name} at ${at}`
    return `${who} missed at ${at}`
  }
  if (result.sunkShip) return `${who} sank their ${result.sunkShip.name}!`
  if (result.hit) return `Hit at ${at}!`
  return `Miss at ${at}`
}
