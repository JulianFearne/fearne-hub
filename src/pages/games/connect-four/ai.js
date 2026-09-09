// src/pages/games/connect-four/ai.js
// Hand-rolled minimax with alpha-beta pruning. No npm dependency. The 7x6 board
// is small enough that depth 6 evaluates in a few milliseconds.

import {
  COLS,
  ROWS,
  SEAT_1,
  SEAT_2,
  applyMove,
  getValidColumns,
  winningLineThrough,
} from './engine';

const CENTER = Math.floor(COLS / 2);

const DIFFICULTY_DEPTH = { easy: 2, medium: 4, hard: 6 };

function otherPlayer(p) {
  return p === SEAT_1 ? SEAT_2 : SEAT_1;
}

// Score one 4-cell window from the AI's point of view.
function scoreWindow(cells, ai) {
  const human = otherPlayer(ai);
  let aiCount = 0;
  let humanCount = 0;
  let empty = 0;
  for (const cell of cells) {
    if (cell === ai) aiCount++;
    else if (cell === human) humanCount++;
    else empty++;
  }
  if (aiCount === 4) return 100;
  if (aiCount === 3 && empty === 1) return 5;
  if (aiCount === 2 && empty === 2) return 2;
  if (humanCount === 3 && empty === 1) return -4; // discourage leaving a threat open
  return 0;
}

// Heuristic evaluation of a non-terminal board.
function scorePosition(board, ai) {
  let score = 0;

  // Centre control: more winning lines pass through the middle column.
  let centreCount = 0;
  for (let r = 0; r < ROWS; r++) if (board[r][CENTER] === ai) centreCount++;
  score += centreCount * 3;

  // Horizontal windows
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += scoreWindow(
        [board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]],
        ai,
      );
    }
  }
  // Vertical windows
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      score += scoreWindow(
        [board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]],
        ai,
      );
    }
  }
  // Diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      score += scoreWindow(
        [
          board[r][c],
          board[r + 1][c + 1],
          board[r + 2][c + 2],
          board[r + 3][c + 3],
        ],
        ai,
      );
    }
  }
  // Diagonal down-left
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      score += scoreWindow(
        [
          board[r][c],
          board[r + 1][c - 1],
          board[r + 2][c - 2],
          board[r + 3][c - 3],
        ],
        ai,
      );
    }
  }

  return score;
}

// Returns { col, score }. Wins are detected at the exact cell just dropped, so
// there is no full-board scan inside the search loop.
function minimax(board, depth, alpha, beta, maximizing, ai) {
  const human = otherPlayer(ai);
  const valid = getValidColumns(board);

  if (valid.length === 0) return { col: null, score: 0 }; // board full = draw
  if (depth === 0) return { col: null, score: scorePosition(board, ai) };

  // Search the centre first for better alpha-beta cut-offs.
  valid.sort((a, b) => Math.abs(a - CENTER) - Math.abs(b - CENTER));

  if (maximizing) {
    let best = { col: valid[0], score: -Infinity };
    for (const col of valid) {
      const { board: next, row } = applyMove(board, col, ai);
      const score = winningLineThrough(next, row, col)
        ? 1000000 + depth // prefer winning sooner
        : minimax(next, depth - 1, alpha, beta, false, ai).score;
      if (score > best.score) best = { col, score };
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = { col: valid[0], score: Infinity };
  for (const col of valid) {
    const { board: next, row } = applyMove(board, col, human);
    const score = winningLineThrough(next, row, col)
      ? -1000000 - depth
      : minimax(next, depth - 1, alpha, beta, true, ai).score;
    if (score < best.score) best = { col, score };
    beta = Math.min(beta, score);
    if (alpha >= beta) break;
  }
  return best;
}

// Public: pick the AI's column.
export function chooseMove(board, ai, difficulty = 'medium') {
  const valid = getValidColumns(board);
  if (valid.length === 0) return null;

  // 1) Take an immediate win.
  for (const col of valid) {
    const { board: next, row } = applyMove(board, col, ai);
    if (winningLineThrough(next, row, col)) return col;
  }
  // 2) Block the opponent's immediate win.
  const human = otherPlayer(ai);
  for (const col of valid) {
    const { board: next, row } = applyMove(board, col, human);
    if (winningLineThrough(next, row, col)) return col;
  }
  // 3) On easy, sometimes play at random so the kids can actually win.
  if (difficulty === 'easy' && Math.random() < 0.35) {
    return valid[Math.floor(Math.random() * valid.length)];
  }
  // 4) Otherwise search.
  const depth = DIFFICULTY_DEPTH[difficulty] ?? 4;
  const { col } = minimax(board, depth, -Infinity, Infinity, true, ai);
  return col ?? valid[Math.floor(Math.random() * valid.length)];
}
