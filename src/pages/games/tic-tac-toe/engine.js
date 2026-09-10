// src/pages/games/tic-tac-toe/engine.js
// Pure Tic Tac Toe logic. No React. Board is a flat 9-cell array, index
// 0..8 left-to-right, top-to-bottom.

export const X = 'X'
export const O = 'O'

export function createBoard() {
  return Array(9).fill(null)
}

export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],           // diagonals
]

export function getEmptyCells(board) {
  const cells = []
  for (let i = 0; i < board.length; i++) if (!board[i]) cells.push(i)
  return cells
}

export function isValidMove(board, index) {
  return index >= 0 && index < 9 && !board[index]
}

// Returns a NEW board, never mutates the input.
export function applyMove(board, index, mark) {
  if (!isValidMove(board, index)) return board
  const next = board.slice()
  next[index] = mark
  return next
}

// { winner: 'X' | 'O' | null, line: [i, i, i] | null }
export function getWinner(board) {
  for (const line of WIN_LINES) {
    const [a, b, c] = line
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line }
    }
  }
  return { winner: null, line: null }
}

export function isBoardFull(board) {
  return board.every((cell) => cell !== null)
}

export function otherMark(mark) {
  return mark === X ? O : X
}
