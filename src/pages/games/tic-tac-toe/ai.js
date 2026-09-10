// src/pages/games/tic-tac-toe/ai.js
// Minimax with alpha-beta pruning. The board is 9 cells, so an exhaustive
// search is instant, no depth limiting needed.

import { WIN_LINES, applyMove, getEmptyCells, otherMark } from './engine'

function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  }
  return null
}

function minimax(board, mark, ai, depth, alpha, beta) {
  const winner = checkWinner(board)
  if (winner === ai) return 10 - depth
  if (winner && winner !== ai) return depth - 10
  const empty = getEmptyCells(board)
  if (empty.length === 0) return 0

  const maximizing = mark === ai
  let best = maximizing ? -Infinity : Infinity

  for (const index of empty) {
    const next = applyMove(board, index, mark)
    const score = minimax(next, otherMark(mark), ai, depth + 1, alpha, beta)
    if (maximizing) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, score)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, score)
    }
    if (beta <= alpha) break
  }
  return best
}

// Public: pick the AI's cell index.
export function chooseMove(board, ai, human, difficulty = 'medium') {
  const empty = getEmptyCells(board)
  if (empty.length === 0) return null

  // Easy: mostly random, so kids can actually win.
  if (difficulty === 'easy' && Math.random() < 0.7) {
    return empty[Math.floor(Math.random() * empty.length)]
  }

  // Medium: take an immediate win, block an immediate loss, otherwise random.
  if (difficulty === 'medium') {
    for (const index of empty) {
      if (checkWinner(applyMove(board, index, ai)) === ai) return index
    }
    for (const index of empty) {
      if (checkWinner(applyMove(board, index, human)) === human) return index
    }
    return empty[Math.floor(Math.random() * empty.length)]
  }

  // Hard: perfect play via full-depth minimax.
  let best = { index: empty[0], score: -Infinity }
  for (const index of empty) {
    const next = applyMove(board, index, ai)
    const score = minimax(next, human, ai, 0, -Infinity, Infinity)
    if (score > best.score) best = { index, score }
  }
  return best.index
}
