// src/pages/games/snakes-and-ladders/engine.js
// Pure Snakes and Ladders logic. No React. Squares are numbered 1..100;
// position 0 means "not yet on the board". Classic rule: a roll that would
// take a player past square 100 is wasted, they stay put.

export const BOARD_SIZE = 100

// Ladder entries (start < end) and snake entries (start > end) on one map.
export const CHUTES_AND_LADDERS = {
  4: 25,
  13: 46,
  33: 49,
  42: 63,
  50: 69,
  62: 81,
  74: 92,
  27: 5,
  40: 3,
  43: 18,
  54: 31,
  66: 45,
  76: 58,
  89: 53,
  99: 41,
}

export function createGame(numPlayers) {
  return {
    numPlayers,
    positions: Array(numPlayers).fill(0),
    turn: 0,
    winner: null,
  }
}

export function rollDice(rng = Math.random) {
  return 1 + Math.floor(rng() * 6)
}

// Returns { state, event }, a NEW state, never mutates the input. `event`
// describes what happened so the UI can narrate it.
export function applyRoll(state, roll) {
  if (state.winner != null) return { state, event: { type: 'over' } }

  const player = state.turn
  const from = state.positions[player]
  const tentative = from + roll

  let to
  let event
  if (tentative > BOARD_SIZE) {
    to = from
    event = { type: 'blocked', player, from, roll }
  } else if (CHUTES_AND_LADDERS[tentative] != null) {
    const target = CHUTES_AND_LADDERS[tentative]
    to = target
    event = { type: target > tentative ? 'ladder' : 'snake', player, from, rolled: tentative, to: target, roll }
  } else {
    to = tentative
    event = { type: 'move', player, from, to: tentative, roll }
  }

  const positions = state.positions.slice()
  positions[player] = to
  const winner = to === BOARD_SIZE ? player : null
  const turn = winner != null ? state.turn : (state.turn + 1) % state.numPlayers

  return { state: { ...state, positions, turn, winner }, event }
}
