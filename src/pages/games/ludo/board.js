// src/pages/games/ludo/board.js
// Geometry of the classic cross-shaped 15x15 Ludo board, as [row, col]
// grid cells. Blue's yard is top left, red top right, green bottom right,
// yellow bottom left; tokens travel clockwise.

import { FINISH, RING_LENGTH, ringCell } from './engine'

export const GRID = 15

// The 52 shared track cells in travel order, starting on blue's start
// square (6, 1). Each colour's start is 13 cells on from the last.
function buildTrack() {
  const cells = []
  const run = (r0, c0, dr, dc, n) => {
    for (let i = 0; i < n; i++) cells.push([r0 + dr * i, c0 + dc * i])
  }
  run(6, 1, 0, 1, 5) // left arm, top row, heading right
  run(5, 6, -1, 0, 6) // top arm, left column, heading up
  run(0, 7, 0, 1, 1)
  run(0, 8, 1, 0, 6) // top arm, right column, heading down
  run(6, 9, 0, 1, 6) // right arm, top row, heading right
  run(7, 14, 0, 1, 1)
  run(8, 14, 0, -1, 6) // right arm, bottom row, heading left
  run(9, 8, 1, 0, 6) // bottom arm, right column, heading down
  run(14, 7, 0, 1, 1)
  run(14, 6, -1, 0, 6) // bottom arm, left column, heading up
  run(8, 5, 0, -1, 6) // left arm, bottom row, heading left
  run(7, 0, 0, 1, 1)
  run(6, 0, 0, 1, 1)
  return cells
}
export const TRACK = buildTrack()
if (TRACK.length !== RING_LENGTH) throw new Error('Ludo track must have 52 cells')

// Each colour's 5-cell home column, from the edge in towards the centre.
export const HOME_COLUMNS = [
  [1, 2, 3, 4, 5].map((c) => [7, c]), // blue, left arm middle row
  [1, 2, 3, 4, 5].map((r) => [r, 7]), // red, top arm middle column
  [13, 12, 11, 10, 9].map((c) => [7, c]), // green, right arm middle row
  [13, 12, 11, 10, 9].map((r) => [r, 7]), // yellow, bottom arm middle column
]

// Yard corners (top-left cell of each 6x6 yard) and the centres of the four
// token spots inside, in grid units from that corner.
export const YARD_ORIGINS = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
]
const YARD_SPOTS = [
  [2, 2],
  [2, 4],
  [4, 2],
  [4, 4],
]

// Where finished tokens sit: in a row inside their colour's centre
// triangle (blue left, red top, green right, yellow bottom).
const FINISH_SPOTS = [
  { x: 6.72, y: 7.5, along: 'y' },
  { x: 7.5, y: 6.72, along: 'x' },
  { x: 8.28, y: 7.5, along: 'y' },
  { x: 7.5, y: 8.28, along: 'x' },
]

// The cell each colour's home-column entry arrow sits on (the last track
// cell before turning in), and the direction it points.
export const ENTRY_ARROWS = [
  { cell: [7, 0], dir: 'right' },
  { cell: [0, 7], dir: 'down' },
  { cell: [7, 14], dir: 'left' },
  { cell: [14, 7], dir: 'up' },
]

// Centre of a token in grid units (x = col + 0.5, y = row + 0.5 for a cell).
export function tokenPoint(color, pos, tokenIndex) {
  if (pos === -1) {
    const [r0, c0] = YARD_ORIGINS[color]
    const [dr, dc] = YARD_SPOTS[tokenIndex]
    return { x: c0 + dc, y: r0 + dr }
  }
  if (pos === FINISH) {
    const spot = FINISH_SPOTS[color]
    const offset = (tokenIndex - 1.5) * 0.34
    return spot.along === 'y' ? { x: spot.x, y: spot.y + offset } : { x: spot.x + offset, y: spot.y }
  }
  const [r, c] = pos >= RING_LENGTH - 1 ? HOME_COLUMNS[color][pos - (RING_LENGTH - 1)] : TRACK[ringCell(color, pos)]
  return { x: c + 0.5, y: r + 0.5 }
}

// Every position a token passes through moving from `from` to `to`, for the
// step-by-step animation.
export function stepsBetween(from, to) {
  if (from === -1) return [0]
  const steps = []
  for (let p = from + 1; p <= to; p++) steps.push(p)
  return steps
}
