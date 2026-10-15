// src/pages/games/checkers/engine.js
// English draughts rules, no React. The board is 64 squares (index r * 8 + c,
// row 0 at the top); pieces only ever sit on the dark squares ((r + c) odd).
// Red starts at the bottom and moves up, White at the top moving down, and
// Red goes first.
//
//   - Men move one square diagonally forwards; kings one square any way.
//   - A capture jumps an enemy piece to the empty square beyond, and a piece
//     that can keep jumping must keep going (a multi-jump is one move).
//   - With mustJump on (the proper rule, always on online), if any capture
//     is available you have to take one. Kids can switch it off offline.
//   - A man reaching the far row is crowned and its move ends there.
//   - You lose when you have no pieces or no legal move. 40 moves each with
//     no capture and no man moving is a draw.
//
// A move is { path: [from, to, to...], captures: [square...] }. Online it's
// stored as its path, "21-14-5" (see moveKey / deriveOnline).

export const SIZE = 8
export const RED = 0
export const WHITE = 1
export const SIDE_NAMES = ['Red', 'White']
const QUIET_LIMIT = 80 // plies, so 40 moves each

const sq = (r, c) => r * SIZE + c
export const rowOf = (s) => Math.floor(s / SIZE)
export const colOf = (s) => s % SIZE
const onBoard = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

export function createGame({ mustJump = true } = {}) {
  const board = Array(64).fill(null)
  let id = 0
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 0) continue
      if (r < 3) board[sq(r, c)] = { id: id++, side: WHITE, king: false }
      else if (r > 4) board[sq(r, c)] = { id: id++, side: RED, king: false }
    }
  }
  return { board, turn: RED, mustJump, winner: null, draw: false, quiet: 0, moves: [0, 0], lastMove: null, seq: 0 }
}

function directions(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  return piece.side === RED ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
}

const crownRow = (side) => (side === RED ? 0 : SIZE - 1)

// Every full capture sequence starting from `from`. `board` already has the
// piece lifted off (so it can't block its own path round a loop).
function jumpsFrom(board, piece, from, path, captures, out) {
  const r = rowOf(from)
  const c = colOf(from)
  let extended = false
  for (const [dr, dc] of directions(piece)) {
    const mr = r + dr
    const mc = c + dc
    const tr = r + dr * 2
    const tc = c + dc * 2
    if (!onBoard(tr, tc)) continue
    const mid = sq(mr, mc)
    const to = sq(tr, tc)
    const victim = board[mid]
    if (!victim || victim.side === piece.side || captures.includes(mid) || board[to]) continue
    extended = true
    const nextPath = [...path, to]
    const nextCaptures = [...captures, mid]
    // Crowning ends the move.
    if (!piece.king && rowOf(to) === crownRow(piece.side)) out.push({ path: nextPath, captures: nextCaptures })
    else jumpsFrom(board, piece, to, nextPath, nextCaptures, out)
  }
  if (!extended && captures.length) out.push({ path, captures })
}

function movesFor(board, from) {
  const piece = board[from]
  const jumps = []
  const lifted = board.slice()
  lifted[from] = null
  jumpsFrom(lifted, piece, from, [from], [], jumps)
  const steps = []
  for (const [dr, dc] of directions(piece)) {
    const r = rowOf(from) + dr
    const c = colOf(from) + dc
    if (onBoard(r, c) && !board[sq(r, c)]) steps.push({ path: [from, sq(r, c)], captures: [] })
  }
  return { jumps, steps }
}

// All legal moves for the side to play.
export function legalMoves(state) {
  if (state.winner != null || state.draw) return []
  const jumps = []
  const steps = []
  state.board.forEach((p, s) => {
    if (!p || p.side !== state.turn) return
    const m = movesFor(state.board, s)
    jumps.push(...m.jumps)
    steps.push(...m.steps)
  })
  if (state.mustJump && jumps.length) return jumps
  return [...jumps, ...steps]
}

export const moveKey = (move) => move.path.join('-')

export function applyMove(state, move) {
  const board = state.board.slice()
  const from = move.path[0]
  const to = move.path[move.path.length - 1]
  const piece = { ...board[from] }
  board[from] = null
  for (const s of move.captures) board[s] = null
  let crowned = false
  if (!piece.king && rowOf(to) === crownRow(piece.side)) {
    piece.king = true
    crowned = true
  }
  board[to] = piece

  const quiet = move.captures.length || !state.board[from].king ? 0 : state.quiet + 1
  const moves = state.moves.slice()
  moves[state.turn] += 1
  const next = {
    ...state,
    board,
    turn: 1 - state.turn,
    quiet,
    moves,
    seq: state.seq + 1,
    lastMove: { ...move, side: state.turn, crowned, pieceId: piece.id, seq: state.seq + 1 },
  }
  if (legalMoves(next).length === 0) next.winner = state.turn
  else if (quiet >= QUIET_LIMIT) next.draw = true
  return next
}

// Plays a move given as its path key; returns null if it isn't legal.
export function applyMoveKey(state, key) {
  const move = legalMoves(state).find((m) => moveKey(m) === key)
  return move ? applyMove(state, move) : null
}

// Online: the game is the replay of every stored move. An illegal row (a
// race between two devices) is skipped.
export function deriveOnline(rows) {
  let state = createGame({ mustJump: true })
  for (const row of rows) {
    const next = applyMoveKey(state, row.path)
    if (next) state = next
  }
  return state
}

export function pieceCounts(board) {
  const counts = [0, 0]
  for (const p of board) if (p) counts[p.side] += 1
  return counts
}
