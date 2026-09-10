// src/pages/games/connect-four/engine.js
// Pure Connect Four logic. No React, no Supabase. Shared by the vs-AI and the
// multiplayer components so the rules live in exactly one place.

export const COLS = 7;
export const ROWS = 6;

export const EMPTY = 0;
export const SEAT_1 = 1; // red, always moves first
export const SEAT_2 = 2; // gold

// A board is a 2D array: board[row][col]. Row 0 is the TOP row, row ROWS-1 is
// the BOTTOM (the floor). Discs fall to the lowest empty row in a column.
export function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY));
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

// Lowest empty row in a column, or -1 if the column is full.
export function getDropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === EMPTY) return r;
  }
  return -1;
}

export function isValidMove(board, col) {
  return col >= 0 && col < COLS && getDropRow(board, col) !== -1;
}

export function getValidColumns(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) if (isValidMove(board, c)) cols.push(c);
  return cols;
}

// Returns { board, row } for a NEW board with the disc dropped, or null if the
// move is illegal. Never mutates the input board.
export function applyMove(board, col, player) {
  const row = getDropRow(board, col);
  if (row === -1) return null;
  const next = cloneBoard(board);
  next[row][col] = player;
  return { board: next, row };
}

export function isBoardFull(board) {
  return board[0].every((cell) => cell !== EMPTY);
}

const DIRECTIONS = [
  [0, 1],  // horizontal
  [1, 0],  // vertical
  [1, 1],  // diagonal down-right
  [1, -1], // diagonal down-left
];

// Checks only the four directions through (row, col). Returns the winning line
// as an array of [row, col] cells (length 4), or null. Cheap to call after each
// move because it only looks at lines passing through the cell that changed.
export function winningLineThrough(board, row, col) {
  const player = board[row][col];
  if (player === EMPTY) return null;

  for (const [dr, dc] of DIRECTIONS) {
    const line = [[row, col]];
    // extend forwards
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      line.push([r, c]);
      r += dr;
      c += dc;
    }
    // extend backwards
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      line.unshift([r, c]);
      r -= dr;
      c -= dc;
    }
    if (line.length >= 4) return line.slice(0, 4);
  }
  return null;
}

// Full-board winner scan. Returns { winner, line } or { winner: 0, line: null }.
export function getWinner(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === EMPTY) continue;
      const line = winningLineThrough(board, r, c);
      if (line) return { winner: board[r][c], line };
    }
  }
  return { winner: EMPTY, line: null };
}

// --- Multiplayer helper: derive the whole game from the move list ---
// moves: [{ column, seat, move_number }] in any order. Rebuilds the board by
// replaying moves in move_number order, so the database only ever stores the
// moves, never the grid or the score (same principle as AnimalPlaceThing).
export function deriveState(moves) {
  const ordered = [...moves].sort((a, b) => a.move_number - b.move_number);
  let board = createBoard();
  let lastRow = -1;
  let lastCol = -1;
  let lastSeat = EMPTY;

  for (const m of ordered) {
    const result = applyMove(board, m.column, m.seat);
    if (!result) continue; // defensively skip an illegal/duplicate row
    board = result.board;
    lastRow = result.row;
    lastCol = m.column;
    lastSeat = m.seat;
  }

  let winner = EMPTY;
  let winningLine = null;
  if (lastRow !== -1) {
    winningLine = winningLineThrough(board, lastRow, lastCol);
    if (winningLine) winner = lastSeat;
  }

  const moveCount = ordered.length;
  const isDraw = winner === EMPTY && isBoardFull(board);
  const nextSeat =
    winner || isDraw ? EMPTY : moveCount % 2 === 0 ? SEAT_1 : SEAT_2;

  return { board, winner, winningLine, isDraw, moveCount, nextSeat };
}
