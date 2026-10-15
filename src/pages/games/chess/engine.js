// src/pages/games/chess/engine.js
// Chess rules come from chess.js (checks, castling, en passant, promotion,
// and every kind of draw), so nothing here re-implements them. A game is
// just its list of moves in UCI form ('e2e4', 'e7e8q'); the position is
// rebuilt by replaying them, the same way the online games replay their
// move log. On top of that this file works out what the board needs:
// pieces with stable ids (so they can slide), the result, and the
// material each side has taken.

import { Chess } from 'chess.js'

export const FILES = 'abcdefgh'
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export function uciOf(move) {
  return move.from + move.to + (move.promotion ?? '')
}

// Replays moves; an illegal one (a race online) stops the replay there.
export function replay(moves) {
  const chess = new Chess()
  for (const uci of moves) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch {
      break
    }
  }
  return chess
}

// { over, winner: 'w' | 'b' | null, reason } for the position.
export function resultOf(chess) {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'b' : 'w'
    return { over: true, winner, reason: 'checkmate' }
  }
  if (chess.isStalemate()) return { over: true, winner: null, reason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { over: true, winner: null, reason: 'material' }
  if (chess.isThreefoldRepetition()) return { over: true, winner: null, reason: 'repetition' }
  if (chess.isDraw()) return { over: true, winner: null, reason: 'fifty' }
  return { over: false, winner: null, reason: null }
}

export const DRAW_TEXT = {
  stalemate: "Stalemate: no legal move, but not in check. It's a draw.",
  material: "Draw: neither side has enough pieces left to checkmate.",
  repetition: 'Draw: the same position came up three times.',
  fifty: 'Draw: 50 moves each with no capture or pawn move.',
}

// Every piece on the board with an id that follows it from move to move,
// so the board can slide it rather than redraw it.
export function trackPieces(chess) {
  const history = chess.history({ verbose: true })
  const start = new Chess()
  const at = new Map() // square -> { id, type, color }
  let id = 0
  for (const row of start.board()) {
    for (const p of row) if (p) at.set(p.square, { id: id++, type: p.type, color: p.color })
  }
  for (const m of history) {
    const piece = at.get(m.from)
    at.delete(m.from)
    if (m.flags.includes('e')) at.delete(m.to[0] + m.from[1]) // en passant
    at.set(m.to, { ...piece, type: m.promotion ?? piece.type })
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1]
      const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd']
      const rook = at.get(rf + rank)
      at.delete(rf + rank)
      at.set(rt + rank, rook)
    }
  }
  return [...at.entries()].map(([square, p]) => ({ ...p, square }))
}

// Pieces each side has captured, and who's ahead on material.
export function captured(chess) {
  const taken = { w: [], b: [] } // pieces taken BY white / black
  for (const m of chess.history({ verbose: true })) {
    if (m.captured) taken[m.color].push(m.captured)
  }
  const order = 'qrbnp'
  for (const side of ['w', 'b']) taken[side].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  const score = (list) => list.reduce((s, t) => s + VALUE[t], 0)
  return { taken, lead: score(taken.w) - score(taken.b) }
}

export function kingSquare(chess, color) {
  for (const row of chess.board()) {
    for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square
  }
  return null
}
