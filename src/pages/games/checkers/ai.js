// src/pages/games/checkers/ai.js
// The computer player: alpha-beta search over engine.js moves.
//
//   easy    looks one move ahead and often just picks something at random,
//           so small children can win
//   medium  4 plies, with a little randomness between equal moves
//   hard    6 plies
//
// The score is material (a king is worth 1.6 men) plus small nudges for
// pushing men forwards, keeping the back row and holding the centre.

import { RED, applyMove, legalMoves, rowOf, colOf } from './engine'

const LEVELS = {
  easy: { depth: 1, blunder: 0.45 },
  medium: { depth: 4, blunder: 0.05 },
  hard: { depth: 6, blunder: 0 },
}

function evaluate(state, me) {
  if (state.winner != null) return state.winner === me ? 100000 : -100000
  if (state.draw) return 0
  let score = 0
  state.board.forEach((p, s) => {
    if (!p) return
    const r = rowOf(s)
    const c = colOf(s)
    let v = p.king ? 160 : 100
    if (!p.king) {
      const advanced = p.side === RED ? 7 - r : r
      v += advanced * 3
      if (advanced === 0) v += 6 // guarding the back row
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 4
    score += p.side === me ? v : -v
  })
  return score
}

function search(state, depth, alpha, beta, me) {
  const moves = legalMoves(state)
  if (depth === 0 || moves.length === 0 || state.winner != null || state.draw) return evaluate(state, me)
  const maximising = state.turn === me
  // Captures first: better pruning.
  moves.sort((a, b) => b.captures.length - a.captures.length)
  if (maximising) {
    let best = -Infinity
    for (const m of moves) {
      best = Math.max(best, search(applyMove(state, m), depth - 1, alpha, beta, me))
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const m of moves) {
    best = Math.min(best, search(applyMove(state, m), depth - 1, alpha, beta, me))
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

export function chooseMove(state, level = 'medium', rng = Math.random) {
  const moves = legalMoves(state)
  if (!moves.length) return null
  const { depth, blunder } = LEVELS[level] ?? LEVELS.medium
  if (rng() < blunder) return moves[Math.floor(rng() * moves.length)]
  const me = state.turn
  let bestScore = -Infinity
  let best = []
  for (const m of moves) {
    const score = search(applyMove(state, m), depth - 1, -Infinity, Infinity, me) + rng() * 2
    if (score > bestScore + 1) {
      bestScore = score
      best = [m]
    } else if (score > bestScore - 1) {
      best.push(m)
      bestScore = Math.max(bestScore, score)
    }
  }
  return best[Math.floor(rng() * best.length)]
}
