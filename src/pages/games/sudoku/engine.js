// src/pages/games/sudoku/engine.js
// Pure Sudoku logic: generation (backtracking fill), a uniqueness-checking
// solver (backtracking with a minimum-remaining-values heuristic, capped at
// 2 solutions), and validity/conflict checking. No React, no dependency.

const idx = (r, c) => r * 9 + c

export function emptyGrid() {
  return Array(81).fill(0)
}

// Is `val` legal at (r, c), ignoring the cell's own current contents?
export function isValidPlacement(grid, r, c, val) {
  for (let i = 0; i < 9; i++) {
    if (i !== c && grid[idx(r, i)] === val) return false
    if (i !== r && grid[idx(i, c)] === val) return false
  }
  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      const rr = br + dr
      const cc = bc + dc
      if ((rr !== r || cc !== c) && grid[idx(rr, cc)] === val) return false
    }
  }
  return true
}

function shuffled(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function fillCell(grid, pos, rng) {
  if (pos === 81) return true
  if (grid[pos] !== 0) return fillCell(grid, pos + 1, rng)
  const r = Math.floor(pos / 9)
  const c = pos % 9
  for (const val of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)) {
    if (isValidPlacement(grid, r, c, val)) {
      grid[pos] = val
      if (fillCell(grid, pos + 1, rng)) return true
      grid[pos] = 0
    }
  }
  return false
}

// A fully solved, randomised 9x9 grid (flat, length 81).
export function generateSolved(rng = Math.random) {
  const grid = emptyGrid()
  fillCell(grid, 0, rng)
  return grid
}

// Picks the empty cell with the fewest legal candidates (falls back fast on
// dead ends), which keeps the uniqueness-check solver below tractable even
// for sparse (hard-difficulty) grids.
function findMRVCell(grid) {
  let best = -1
  let bestCands = null
  let bestCount = 10
  for (let pos = 0; pos < 81; pos++) {
    if (grid[pos] !== 0) continue
    const r = Math.floor(pos / 9)
    const c = pos % 9
    const cands = []
    for (let val = 1; val <= 9; val++) {
      if (isValidPlacement(grid, r, c, val)) cands.push(val)
    }
    if (cands.length < bestCount) {
      best = pos
      bestCands = cands
      bestCount = cands.length
      if (bestCount === 0) break // dead end — nothing beats this, bail early
    }
  }
  return best === -1 ? null : { pos: best, cands: bestCands }
}

// Counts solutions up to `limit` (default 2 — callers only need to know
// "exactly one" vs "not exactly one", never the true count).
export function countSolutions(grid, limit = 2) {
  const g = grid.slice()
  let count = 0
  function solve() {
    if (count >= limit) return
    const cell = findMRVCell(g)
    if (!cell) {
      count++
      return
    }
    if (cell.cands.length === 0) return
    for (const val of cell.cands) {
      if (count >= limit) return
      g[cell.pos] = val
      solve()
      g[cell.pos] = 0
    }
  }
  solve()
  return count
}

// Clues remaining after removal, per difficulty tier — not exact (removal
// stops early if uniqueness can't be preserved), but a reliable ceiling.
export const DIFFICULTY_REMOVALS = { easy: 38, medium: 46, hard: 54 }

// Builds a puzzle by carving cells out of a solved grid one at a time, only
// keeping a removal if the puzzle still has exactly one solution.
export function generatePuzzle(difficulty = 'medium', rng = Math.random) {
  const solution = generateSolved(rng)
  const puzzle = solution.slice()
  const targetRemovals = DIFFICULTY_REMOVALS[difficulty] ?? DIFFICULTY_REMOVALS.medium
  const order = shuffled(
    Array.from({ length: 81 }, (_, i) => i),
    rng
  )
  let removed = 0
  for (const pos of order) {
    if (removed >= targetRemovals) break
    if (puzzle[pos] === 0) continue
    const backup = puzzle[pos]
    puzzle[pos] = 0
    if (countSolutions(puzzle, 2) === 1) {
      removed++
    } else {
      puzzle[pos] = backup
    }
  }
  const given = puzzle.map((v) => v !== 0)
  return { puzzle, solution, given }
}

// Cell indices whose current value conflicts with a peer — for UI highlighting.
export function findConflicts(grid) {
  const conflicts = new Set()
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const pos = idx(r, c)
      const val = grid[pos]
      if (!val) continue
      if (!isValidPlacement(grid, r, c, val)) conflicts.add(pos)
    }
  }
  return conflicts
}

export function isSolved(grid, solution) {
  return grid.every((v, i) => v === solution[i])
}
