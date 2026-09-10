// src/pages/games/ludo/engine.js
// Pure Ludo logic. No React. 2-4 players, 4 tokens each.
//
// A token's position is a single number:
//   -1        in the yard, not yet on the board
//   0..50     a step along the shared 52-cell ring (own step count, not the
//             global cell, see ringCell below)
//   51..55    a step along the player's own private 5-cell home stretch
//   56        home, finished
//
// The shared ring is 52 cells; each player's start is offset 13 cells apart
// (52 / 4), so a player's global ring cell for step s is
// (startOffset(player) + s) mod 52. The four start cells are safe: no
// capturing happens there.

export const RING_LENGTH = 52
export const HOME_STRETCH = 5
// Ring steps run 0..RING_LENGTH-2 (51 of them), then HOME_STRETCH more steps
// up the home column, then FINISH is the "arrived home" state.
export const FINISH = RING_LENGTH + HOME_STRETCH - 1 // 56
export const TOKENS_PER_PLAYER = 4

export function startOffset(player) {
  return player * (RING_LENGTH / 4)
}

export function ringCell(player, step) {
  return (startOffset(player) + step) % RING_LENGTH
}

export function isSafeCell(globalCell) {
  for (let p = 0; p < 4; p++) if (startOffset(p) === globalCell) return true
  return false
}

export function isOnRing(pos) {
  return pos >= 0 && pos <= RING_LENGTH - 2 // 0..50
}

export function isHome(pos) {
  return pos === FINISH
}

export function createGame(numPlayers) {
  return {
    numPlayers,
    positions: Array.from({ length: numPlayers }, () => Array(TOKENS_PER_PLAYER).fill(-1)),
    turn: 0,
    consecutiveSixes: 0,
    winner: null,
  }
}

export function rollDice(rng = Math.random) {
  return 1 + Math.floor(rng() * 6)
}

// Token indices (0-3) belonging to the current player that can legally move
// with this roll.
export function getMovableTokens(state, roll) {
  const positions = state.positions[state.turn]
  const movable = []
  for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
    const pos = positions[i]
    if (pos === -1) {
      if (roll === 6) movable.push(i)
    } else if (pos !== FINISH && pos + roll <= FINISH) {
      movable.push(i)
    }
  }
  return movable
}

function advanceTurn(state, roll, hasWinner) {
  const consecutiveSixes = roll === 6 ? state.consecutiveSixes + 1 : 0
  const forfeited = consecutiveSixes >= 3
  if (hasWinner) return { turn: state.turn, consecutiveSixes: 0 }
  const extra = roll === 6 && !forfeited
  return {
    turn: extra ? state.turn : (state.turn + 1) % state.numPlayers,
    consecutiveSixes: forfeited ? 0 : consecutiveSixes,
    forfeited,
  }
}

// Called when the current player has no legal move for this roll, the turn
// still passes (or grants an extra roll on a 6), nothing else changes.
export function passWithNoMove(state, roll) {
  const { turn, consecutiveSixes } = advanceTurn(state, roll, false)
  return { ...state, turn, consecutiveSixes }
}

// Returns { state, event }, a NEW state, never mutates the input.
export function moveToken(state, tokenIndex, roll) {
  const player = state.turn
  const positions = state.positions.map((row) => row.slice())
  const from = positions[player][tokenIndex]
  const to = from === -1 ? 0 : from + roll
  positions[player][tokenIndex] = to

  const captured = []
  if (isOnRing(to)) {
    const globalCell = ringCell(player, to)
    if (!isSafeCell(globalCell)) {
      for (let q = 0; q < state.numPlayers; q++) {
        if (q === player) continue
        for (let j = 0; j < TOKENS_PER_PLAYER; j++) {
          const otherPos = positions[q][j]
          if (isOnRing(otherPos) && ringCell(q, otherPos) === globalCell) {
            positions[q][j] = -1
            captured.push({ player: q, token: j })
          }
        }
      }
    }
  }

  const justFinished = to === FINISH
  const wonGame = positions[player].every((p) => p === FINISH)
  const winner = wonGame ? player : null
  const { turn, consecutiveSixes, forfeited } = advanceTurn(state, roll, wonGame)

  return {
    state: { ...state, positions, turn, consecutiveSixes, winner },
    event: { type: 'move', player, tokenIndex, from, to, captured, justFinished, forfeited: Boolean(forfeited) },
  }
}
