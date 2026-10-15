// src/pages/games/gem-clash/ai.js
// The computer opponent. When a new pair appears it tries every column and
// every way round (engine.simulate), scores each landing, then steers the
// pair there a step at a time like a person would.
//
// A landing scores for damage done, for putting gems next to their own
// colour (building towards big smashes and power gems), and loses points
// for a tall stack, especially in the middle where new pairs appear. The
// levels differ in how often they just pick something at random, how
// patiently they save breakers for a bigger smash, and how fast they move.

import { COLS, ROWS, simulate, stackHeight } from './engine'

export const AI_LEVELS = {
  easy: { label: 'Easy', random: 0.4, patience: 0, stepMs: 420 },
  medium: { label: 'Medium', random: 0.12, patience: 4, stepMs: 230 },
  hard: { label: 'Hard', random: 0, patience: 8, stepMs: 120 },
}

function columnHeights(grid) {
  const h = []
  for (let c = 0; c < COLS; c++) {
    let r = 0
    while (r < ROWS && !grid[r * COLS + c]) r++
    h.push(ROWS - r)
  }
  return h
}

function scoreLanding(result, level, danger) {
  const { grid, damage, cells } = result
  let score = 0
  // Damage is good, but a careful player waits to smash a big group
  // unless the stack is getting dangerous.
  if (damage > 0) score += damage >= level.patience || danger ? damage * 12 : damage * 2 - 6
  for (const { r, c, gem } of cells) {
    if (gem.breaker) continue
    for (const [dr, dc] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
      const rr = r + dr
      const cc = c + dc
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue
      const n = grid[rr * COLS + cc]
      if (n && n.colour === gem.colour) score += 3
    }
  }
  const heights = columnHeights(grid)
  const tallest = Math.max(...heights)
  score -= tallest * tallest * 0.35
  score -= (heights[2] + heights[3]) * 1.5
  return score
}

// Picks { c, o } for the falling pair, or null if nothing fits.
export function plan(game, levelKey = 'medium', rng = Math.random) {
  const level = AI_LEVELS[levelKey] ?? AI_LEVELS.medium
  const gems = game.piece?.gems
  if (!gems) return null
  const danger = stackHeight(game.grid) > ROWS - 5
  const options = []
  for (let o = 0; o < 4; o++) {
    for (let c = 0; c < COLS; c++) {
      const result = simulate(game.grid, gems, c, o)
      if (result) options.push({ c, o, score: scoreLanding(result, level, danger) })
    }
  }
  if (!options.length) return null
  if (rng() < level.random) return options[Math.floor(rng() * options.length)]
  options.sort((a, b) => b.score - a.score)
  return options[0]
}
