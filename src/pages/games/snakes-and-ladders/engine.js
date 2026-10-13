// src/pages/games/snakes-and-ladders/engine.js
// Pure Snakes and Ladders logic. No React. Squares are numbered 1..100;
// position 0 means "not yet on the board". Classic rule: a roll that would
// take a player past square 100 is wasted, they stay put.
//
// There are no choices in this game, so a turn is just a roll: applyRoll.
// Local games call it directly; online games replay their log of rolls
// through it (deriveOnline), so both play by exactly the same code.

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
    lastEvent: null,
    seq: 0, // counts rolls, so views can tell a new roll from a re-render
  }
}

export function rollDice(rng = Math.random) {
  return 1 + Math.floor(rng() * 6)
}

// Returns a NEW state, never mutates the input. state.lastEvent describes
// what happened so the UI can narrate and animate it:
//   { type: 'move' | 'ladder' | 'snake' | 'blocked', player, from, roll,
//     rolled (square the dice took them to), to (where they ended), seq }
export function applyRoll(state, roll) {
  if (state.winner != null) return state

  const player = state.turn
  const from = state.positions[player]
  const rolled = from + roll
  const seq = state.seq + 1

  let to
  let type
  if (rolled > BOARD_SIZE) {
    to = from
    type = 'blocked'
  } else if (CHUTES_AND_LADDERS[rolled] != null) {
    to = CHUTES_AND_LADDERS[rolled]
    type = to > rolled ? 'ladder' : 'snake'
  } else {
    to = rolled
    type = 'move'
  }

  const positions = state.positions.slice()
  positions[player] = to
  const winner = to === BOARD_SIZE ? player : null
  const turn = winner != null ? state.turn : (state.turn + 1) % state.numPlayers

  return {
    ...state,
    positions,
    turn,
    winner,
    seq,
    lastEvent: { type, player, from, roll, rolled: Math.min(rolled, BOARD_SIZE), to, seq },
  }
}

// Replays an online game's rolls ([{ seat, value, roll_number }]). Rolls
// from the wrong seat are skipped, so a stray row can't desync anyone.
export function deriveOnline(numPlayers, rolls) {
  let state = createGame(numPlayers)
  const ordered = [...(rolls ?? [])].sort((a, b) => a.roll_number - b.roll_number)
  for (const r of ordered) {
    if (state.winner != null) break
    if (r.seat !== state.turn || !(r.value >= 1 && r.value <= 6)) continue
    state = applyRoll(state, r.value)
  }
  return state
}
