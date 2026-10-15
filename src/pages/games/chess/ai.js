// src/pages/games/chess/ai.js
// The computer player: a small alpha-beta search on top of chess.js.
//
//   easy    one move deep and often careless, so children can win
//   medium  two moves deep, then follows the captures a little further
//   hard    up to four moves deep, then follows the captures
//
// Each level has a thinking-time limit: the search goes one move deeper
// at a time and keeps the best answer it finished in time, so a slow
// phone just plays a little less well rather than hanging.
//
// The position score is material plus piece-square tables (knights like
// the centre, pawns like to advance, the king likes to hide early on).
// It runs in a Web Worker (aiWorker.js) so the board never freezes.

import { Chess } from 'chess.js'

export const LEVELS = {
  easy: { label: 'Easy', depth: 1, quiesce: 0, blunder: 0.35, ms: 300 },
  medium: { label: 'Medium', depth: 2, quiesce: 2, blunder: 0.05, ms: 900 },
  hard: { label: 'Hard', depth: 4, quiesce: 3, blunder: 0, ms: 2000 },
}

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

// Tables from White's side, a8 first (index 0) to h1 (63).
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0,
    0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20,
    20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50,
    -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5,
    5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10,
    -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
}

const MATE = 100000

// Score from the point of view of the side to move.
function evaluate(chess) {
  let score = 0
  const board = chess.board()
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c]
      if (!p) continue
      const i = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c
      const v = VALUE[p.type] + PST[p.type][i]
      score += p.color === 'w' ? v : -v
    }
  }
  return chess.turn() === 'w' ? score : -score
}

// The search works on chess.js's short move names ('Nxe5', 'e8=Q+'):
// asking chess.js for full move objects is around 25 times slower.
const TARGET = /([a-h][1-8])(=[QRBN])?[+#]?$/

function moveValue(chess, san) {
  if (san.includes('=')) return 800
  if (!san.includes('x')) return san.endsWith('+') ? 5 : -1
  // Biggest victim with the smallest attacker first.
  const to = san.match(TARGET)?.[1]
  const victim = (to && chess.get(to)?.type) || 'p' // en passant lands on an empty square
  const attacker = 'NBRQK'.includes(san[0]) ? san[0].toLowerCase() : 'p'
  return VALUE[victim] * 10 - VALUE[attacker]
}

function ordered(chess, sans) {
  return sans
    .map((san) => ({ san, v: moveValue(chess, san) }))
    .sort((a, b) => b.v - a.v)
    .map((m) => m.san)
}

class OutOfTime extends Error {}
let deadline = Infinity
let nodes = 0

function tick() {
  nodes += 1
  if ((nodes & 63) === 0 && Date.now() > deadline) throw new OutOfTime()
}

function quiesce(chess, alpha, beta, depth) {
  tick()
  const stand = evaluate(chess)
  if (depth === 0 || stand >= beta) return stand
  if (stand > alpha) alpha = stand
  const captures = ordered(
    chess,
    chess.moves().filter((san) => san.includes('x')),
  )
  for (const san of captures) {
    chess.move(san)
    let score
    try {
      score = -quiesce(chess, -beta, -alpha, depth - 1)
    } finally {
      chess.undo()
    }
    if (score >= beta) return score
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(chess, depth, alpha, beta, level, ply) {
  tick()
  const moves = chess.moves()
  if (!moves.length) return chess.inCheck() ? -MATE + ply : 0
  if (depth === 0) return level.quiesce ? quiesce(chess, alpha, beta, level.quiesce) : evaluate(chess)
  let best = -Infinity
  for (const san of ordered(chess, moves)) {
    chess.move(san)
    let score
    try {
      score = -negamax(chess, depth - 1, -beta, -alpha, level, ply + 1)
    } finally {
      chess.undo()
    }
    if (score > best) best = score
    if (score > alpha) alpha = score
    if (alpha >= beta) break
  }
  return best
}

// Scores every root move at one depth, best first.
function searchRoot(chess, moves, depth, level, rng) {
  const scored = []
  let alpha = -Infinity
  for (const san of moves) {
    chess.move(san)
    let score
    try {
      score = -negamax(chess, depth - 1, -Infinity, -alpha + 10, level, 1)
    } finally {
      chess.undo()
    }
    score += rng() * 8
    scored.push({ san, score })
    if (score > alpha) alpha = score
  }
  return scored.sort((a, b) => b.score - a.score)
}

// Best move for the side to play in `fen`, as UCI ('e2e4'), or null.
export function chooseMove(fen, levelKey = 'medium', rng = Math.random) {
  const chess = new Chess(fen)
  const level = LEVELS[levelKey] ?? LEVELS.medium
  let moves = ordered(chess, chess.moves())
  if (!moves.length) return null
  const uci = (san) => {
    const m = chess.move(san)
    chess.undo()
    return m.from + m.to + (m.promotion ?? '')
  }
  if (rng() < level.blunder) return uci(moves[Math.floor(rng() * moves.length)])
  deadline = Date.now() + level.ms
  nodes = 0
  let best = moves[0]
  for (let depth = 1; depth <= level.depth; depth++) {
    try {
      const scored = searchRoot(chess, moves, depth, level, rng)
      best = scored[0].san
      // The next depth looks at the best moves first, which prunes far more.
      moves = scored.map((m) => m.san)
      if (scored[0].score > MATE / 2) break
    } catch (e) {
      if (e instanceof OutOfTime) break
      throw e
    }
  }
  deadline = Infinity
  return uci(best)
}
