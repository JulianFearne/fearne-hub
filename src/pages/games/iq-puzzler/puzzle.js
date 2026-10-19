// src/pages/games/iq-puzzler/puzzle.js
// The rules and the solver for IQ Puzzler, after SmartGames' IQ Puzzler Pro
// (the flat 2D game). Twelve pieces of three to five balls, 55 balls in all,
// fill an 11 x 5 board exactly. A challenge starts with some pieces already
// fixed in place; you fit the rest.
//
// Challenge n of a level comes from challenges.js, made once from seeded
// random solutions (generateChallenge below), so the same number is always
// the same puzzle. Any way of filling the board counts, not just the one the
// challenge was made from.

import { CHALLENGES } from './challenges'

export const COLS = 11
export const ROWS = 5

// Each piece as rows of '#'. The set is the classic one: 1 three, 3 fours
// and 8 fives.
export const PIECES = [
  { id: 'A', color: '#f08a24', rows: ['###', '#..'] },
  { id: 'B', color: '#e2384d', rows: ['###', '##.'] },
  { id: 'C', color: '#2e6fdc', rows: ['####', '#...'] },
  { id: 'D', color: '#f5a3c7', rows: ['####', '.#..'] },
  { id: 'E', color: '#2fa84f', rows: ['###.', '..##'] },
  { id: 'F', color: '#ffffff', rows: ['##', '#.'] },
  { id: 'G', color: '#59c6f2', rows: ['###', '#..', '#..'] },
  { id: 'H', color: '#d63ca8', rows: ['##.', '.##', '..#'] },
  { id: 'I', color: '#f5d332', rows: ['#.#', '###'] },
  { id: 'J', color: '#7b48c9', rows: ['####'] },
  { id: 'K', color: '#9be23c', rows: ['##', '##'] },
  { id: 'L', color: '#8c8f99', rows: ['.#.', '###', '.#.'] },
]
export const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]))

// Levels: how many pieces you have to place yourself.
export const LEVELS = {
  starter: { label: 'Starter', toPlace: 3 },
  junior: { label: 'Junior', toPlace: 5 },
  expert: { label: 'Expert', toPlace: 7 },
  master: { label: 'Master', toPlace: 9 },
  wizard: { label: 'Wizard', toPlace: 12 },
}
export const CHALLENGES_PER_LEVEL = 24

// ---------- shapes ----------

const baseCells = (p) => p.rows.flatMap((row, r) => [...row].flatMap((ch, c) => (ch === '#' ? [[r, c]] : [])))

function normalise(cells) {
  const minR = Math.min(...cells.map(([r]) => r))
  const minC = Math.min(...cells.map(([, c]) => c))
  return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

// Orientation o (0-7): o % 4 quarter turns clockwise, then flipped if o >= 4.
export function shape(id, o = 0) {
  let cells = baseCells(PIECE[id])
  if (o >= 4) cells = cells.map(([r, c]) => [r, -c])
  for (let i = 0; i < o % 4; i++) cells = cells.map(([r, c]) => [c, -r])
  return normalise(cells)
}

const key = (cells) => cells.map(([r, c]) => `${r},${c}`).join(' ')

// The distinct orientations of each piece (a square has 1, an L has 8).
export const ORIENTATIONS = Object.fromEntries(
  PIECES.map((p) => {
    const seen = new Map()
    for (let o = 0; o < 8; o++) {
      const cells = shape(p.id, o)
      if (!seen.has(key(cells))) seen.set(key(cells), o)
    }
    return [p.id, [...seen.values()]]
  }),
)

// Turning and flipping as the buttons do them.
export const turn = (o) => (o >= 4 ? 4 + ((o + 1) % 4) : (o + 1) % 4)
export const flip = (o) => (o >= 4 ? (4 - (o % 4)) % 4 : 4 + ((4 - o) % 4))

// ---------- the board ----------

// A placement: { id, o, r, c } with (r, c) the top-left of the shape's box.
export function cellsOf(pl) {
  return shape(pl.id, pl.o).map(([r, c]) => [pl.r + r, pl.c + c])
}

// grid[r][c] is the piece id there, or null.
export function gridOf(placements) {
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  for (const pl of placements) for (const [r, c] of cellsOf(pl)) if (r >= 0 && r < ROWS && c >= 0 && c < COLS) grid[r][c] = pl.id
  return grid
}

export function fits(grid, pl) {
  return cellsOf(pl).every(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < COLS && !grid[r][c])
}

export const isSolved = (placements) => placements.length === PIECES.length

// ---------- solving ----------

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(list, rand) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Every empty region must be big enough to hold something (3 balls), or
// there's no point going on.
function deadRegion(grid) {
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false))
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] || seen[r][c]) continue
      let size = 0
      const stack = [[r, c]]
      seen[r][c] = true
      while (stack.length) {
        const [y, x] = stack.pop()
        size++
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ny = y + dy
          const nx = x + dx
          if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS || seen[ny][nx] || grid[ny][nx]) continue
          seen[ny][nx] = true
          stack.push([ny, nx])
        }
      }
      if (size < 3) return true
    }
  }
  return false
}

// Fill the rest of the board with the pieces not yet placed. Returns the
// extra placements, or null if it can't be done (or `limit` tries run out,
// in which case `out.gaveUp` is set).
export function solve(placements, { rand = null, limit = 400000, out = {} } = {}) {
  const grid = gridOf(placements)
  const used = new Set(placements.map((p) => p.id))
  let left = PIECES.map((p) => p.id).filter((id) => !used.has(id))
  if (rand) left = shuffled(left, rand)
  const options = Object.fromEntries(
    left.map((id) => [id, (rand ? shuffled(ORIENTATIONS[id], rand) : ORIENTATIONS[id]).map((o) => ({ o, cells: shape(id, o) }))]),
  )
  const result = []
  let tries = 0

  function go() {
    // The first empty cell, reading along the rows.
    let er = -1
    let ec = -1
    find: for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) {
          er = r
          ec = c
          break find
        }
      }
    }
    if (er < 0) return true
    if (++tries > limit) {
      out.gaveUp = true
      return false
    }
    for (let i = 0; i < left.length; i++) {
      const id = left[i]
      if (!id) continue
      for (const { o, cells } of options[id]) {
        // The shape's first cell has to land on the empty cell (it's the
        // first in reading order, so nothing can sit before it).
        const r0 = er - cells[0][0]
        const c0 = ec - cells[0][1]
        let ok = true
        for (const [r, c] of cells) {
          const y = r0 + r
          const x = c0 + c
          if (y < 0 || y >= ROWS || x < 0 || x >= COLS || grid[y][x]) {
            ok = false
            break
          }
        }
        if (!ok) continue
        for (const [r, c] of cells) grid[r0 + r][c0 + c] = id
        if (!deadRegion(grid)) {
          left[i] = null
          result.push({ id, o, r: r0, c: c0 })
          if (go()) return true
          result.pop()
          left[i] = id
        }
        for (const [r, c] of cells) grid[r0 + r][c0 + c] = null
        if (out.gaveUp) return false
      }
    }
    return false
  }

  return go() ? result : null
}

// Challenge n (1-based) of a level: the fixed pieces and the full solution.
export function makeChallenge(level, n) {
  const [sol, loose] = CHALLENGES[level][n - 1].split('|')
  const solution = []
  for (let i = 0; i < sol.length; i += 4) {
    solution.push({ id: sol[i], o: Number(sol[i + 1]), r: Number(sol[i + 2]), c: parseInt(sol[i + 3], 36) })
  }
  const looseSet = new Set(loose)
  return {
    level,
    n,
    solution,
    fixed: solution.filter((p) => !looseSet.has(p.id)),
    loose: PIECES.map((p) => p.id).filter((id) => looseSet.has(id)),
  }
}

// How challenges.js was made (run in node to regenerate it).
export function generateChallenge(level, n) {
  const toPlace = LEVELS[level].toPlace
  const seed = 7919 * n + 104729 * Object.keys(LEVELS).indexOf(level) + 13
  const rand = mulberry32(seed)
  const solution = solve([], { rand })
  const loose = new Set(shuffled(PIECES.map((p) => p.id), rand).slice(0, toPlace))
  return {
    level,
    n,
    solution,
    fixed: solution.filter((p) => !loose.has(p.id)),
    loose: PIECES.map((p) => p.id).filter((id) => loose.has(id)),
  }
}

// What a hint should do from here: put a piece in ({ place }), or take one
// of yours out because it can't be part of any answer ({ remove }).
export function hint(challenge, placed) {
  const all = [...challenge.fixed, ...placed]
  const out = {}
  const rest = solve(all, { limit: 40000, out })
  if (rest && rest.length) return { place: rest[0] }
  if (rest) return null // already full
  if (!out.gaveUp) {
    // Stuck: find one of your pieces that, taken out, lets it be finished.
    for (const p of placed) {
      const o2 = {}
      const without = [...challenge.fixed, ...placed.filter((q) => q !== p)]
      if (solve(without, { limit: 12000, out: o2 })) return { remove: p }
    }
  }
  // Fall back on the answer the challenge was made from.
  const wrong = placed.find((p) => {
    const s = challenge.solution.find((q) => q.id === p.id)
    return key(cellsOf(s)) !== key(cellsOf(p))
  })
  if (wrong) return { remove: wrong }
  const next = challenge.solution.find((s) => !all.some((p) => p.id === s.id))
  return next ? { place: next } : null
}
