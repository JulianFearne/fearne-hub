// src/pages/games/battleship/ai.js
// The computer's shot picker. It only uses what a human player would know:
// its own shots grid (hit / miss) and which of your ships are sunk (sunk
// ships are revealed on the board, so their cells are known too). It never
// peeks at unsunk ship positions.
//
//   easy:   fires at random.
//   medium: random until it hits, then works round the hit and along the
//           line until the ship sinks.
//   hard:   probability map. Counts every way each remaining ship could
//           still fit, weights placements that cover open hits heavily,
//           and fires at the likeliest cell.

import { SIZE, isSunk } from './engine'

function key(r, c) {
  return `${r},${c}`
}

function untried(shots) {
  const cells = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (shots[r][c] == null) cells.push([r, c])
    }
  }
  return cells
}

function pick(cells) {
  return cells[Math.floor(Math.random() * cells.length)]
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE
}

// Hits that don't belong to a ship already known to be sunk.
function openHits(shots, sunkCells) {
  const hits = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (shots[r][c] === 'hit' && !sunkCells.has(key(r, c))) hits.push([r, c])
    }
  }
  return hits
}

function targetMove(shots, hits) {
  const hitSet = new Set(hits.map(([r, c]) => key(r, c)))

  // Two or more hits in a line: carry on along that line first.
  const lineCandidates = []
  for (const [r, c] of hits) {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ]) {
      if (!hitSet.has(key(r + dr, c + dc))) continue
      // Walk to both ends of the run and try just past each end.
      let [er, ec] = [r, c]
      while (hitSet.has(key(er + dr, ec + dc))) [er, ec] = [er + dr, ec + dc]
      let [sr, sc] = [r, c]
      while (hitSet.has(key(sr - dr, sc - dc))) [sr, sc] = [sr - dr, sc - dc]
      for (const [nr, nc] of [
        [er + dr, ec + dc],
        [sr - dr, sc - dc],
      ]) {
        if (inBounds(nr, nc) && shots[nr][nc] == null) lineCandidates.push([nr, nc])
      }
    }
  }
  if (lineCandidates.length) return pick(lineCandidates)

  // Otherwise any untried neighbour of an open hit.
  const neighbours = []
  for (const [r, c] of hits) {
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr
      const nc = c + dc
      if (inBounds(nr, nc) && shots[nr][nc] == null) neighbours.push([nr, nc])
    }
  }
  return neighbours.length ? pick(neighbours) : null
}

function densityMove(shots, remainingLengths, sunkCells) {
  const weights = Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
  const blocked = (r, c) => shots[r][c] === 'miss' || sunkCells.has(key(r, c))

  for (const length of remainingLengths) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        for (const horizontal of [true, false]) {
          const cells = []
          for (let i = 0; i < length; i++) cells.push(horizontal ? [r, c + i] : [r + i, c])
          if (!cells.every(([cr, cc]) => inBounds(cr, cc) && !blocked(cr, cc))) continue
          const hitsCovered = cells.filter(([cr, cc]) => shots[cr][cc] === 'hit').length
          const weight = hitsCovered ? 40 * hitsCovered : 1
          for (const [cr, cc] of cells) {
            if (shots[cr][cc] == null) weights[cr][cc] += weight
          }
        }
      }
    }
  }

  let best = -1
  let bestCells = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (shots[r][c] != null) continue
      if (weights[r][c] > best) {
        best = weights[r][c]
        bestCells = [[r, c]]
      } else if (weights[r][c] === best) {
        bestCells.push([r, c])
      }
    }
  }
  return bestCells.length ? pick(bestCells) : null
}

// shots: the computer's grid of shots at your fleet. targetShips: your
// fleet (only the sunk ones are looked at). Returns [r, c].
export function chooseShot(shots, targetShips, difficulty = 'medium') {
  const options = untried(shots)
  if (difficulty === 'easy') return pick(options)

  const sunkCells = new Set()
  for (const ship of targetShips) {
    if (isSunk(ship)) ship.cells.forEach(([r, c]) => sunkCells.add(key(r, c)))
  }
  const hits = openHits(shots, sunkCells)

  if (difficulty === 'hard') {
    const remaining = targetShips.filter((ship) => !isSunk(ship)).map((ship) => ship.length)
    return densityMove(shots, remaining, sunkCells) ?? pick(options)
  }

  return (hits.length && targetMove(shots, hits)) || pick(options)
}
