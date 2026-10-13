// src/pages/games/ludo/engine.js
// Pure Ludo logic. No React. 2-4 players, 4 tokens each.
//
// Colours sit round the board clockwise: 0 blue (top left), 1 red (top
// right), 2 green (bottom right), 3 yellow (bottom left). Players take the
// colours in turn order, using opposite corners for a 2-player game (see
// colorsFor), and play passes clockwise.
//
// A token's position is a single number:
//   -1        in the yard, not yet on the board
//   0..50     a step along the shared 52-cell ring (own step count, not the
//             global cell, see ringCell below)
//   51..55    a step along the colour's own 5-cell home column
//   56        home, finished (in the centre)
//
// The ring is 52 cells and each colour's start is 13 cells after the
// previous colour's, so a colour's global ring cell for step s is
// (startOffset(color) + s) mod 52. The four start cells are safe: no
// capturing happens there.
//
// A turn is two actions: applyRoll (the dice) then applyMove (which token).
// A roll with no legal move passes on by itself. Local games call these
// directly; online games replay a log of roll / move rows through them
// (deriveOnline), so both play by exactly the same code.

export const RING_LENGTH = 52
export const HOME_STRETCH = 5
// Ring steps run 0..RING_LENGTH-2 (51 of them), then HOME_STRETCH more steps
// up the home column, then FINISH is the "arrived home" state.
export const FINISH = RING_LENGTH + HOME_STRETCH - 1 // 56
export const TOKENS_PER_PLAYER = 4
export const COLOR_NAMES = ['Blue', 'Red', 'Green', 'Yellow']

export function colorsFor(numPlayers) {
  if (numPlayers === 2) return [0, 2]
  if (numPlayers === 3) return [0, 1, 2]
  return [0, 1, 2, 3]
}

export function startOffset(color) {
  return color * (RING_LENGTH / 4)
}

export function ringCell(color, step) {
  return (startOffset(color) + step) % RING_LENGTH
}

export function isSafeCell(globalCell) {
  return globalCell % (RING_LENGTH / 4) === 0
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
    colors: colorsFor(numPlayers),
    positions: Array.from({ length: numPlayers }, () => Array(TOKENS_PER_PLAYER).fill(-1)),
    turn: 0,
    roll: null, // the current player's roll, waiting for them to pick a token
    consecutiveSixes: 0,
    winner: null,
    lastRoll: null, // { player, value }
    lastEvent: null, // see applyRoll / applyMove
    seq: 0, // counts every roll and move, so views can tell a new event from a re-render
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

// A six earns another roll, but three sixes in a row forfeits the turn.
function advanceTurn(state, roll, hasWinner) {
  if (hasWinner) return { turn: state.turn, consecutiveSixes: 0, forfeited: false }
  const consecutiveSixes = roll === 6 ? state.consecutiveSixes + 1 : 0
  const forfeited = consecutiveSixes >= 3
  const extra = roll === 6 && !forfeited
  return {
    turn: extra ? state.turn : (state.turn + 1) % state.numPlayers,
    consecutiveSixes: forfeited || !extra ? 0 : consecutiveSixes,
    forfeited,
  }
}

// The current player rolls. Returns a NEW state: either waiting for a token
// choice (state.roll set), or, with nothing movable, already passed on.
export function applyRoll(state, value) {
  if (state.winner != null || state.roll != null) return state
  const player = state.turn
  const lastRoll = { player, value }
  if (getMovableTokens(state, value).length === 0) {
    const { turn, consecutiveSixes, forfeited } = advanceTurn(state, value, false)
    const seq = state.seq + 1
    return { ...state, turn, consecutiveSixes, lastRoll, seq, lastEvent: { type: 'nomove', player, roll: value, forfeited, seq } }
  }
  return { ...state, roll: value, lastRoll, seq: state.seq + 1 }
}

// Moves one of the current player's tokens by the pending roll. Returns a
// NEW state (unchanged if the move isn't legal).
export function applyMove(state, tokenIndex) {
  const roll = state.roll
  if (roll == null || !getMovableTokens(state, roll).includes(tokenIndex)) return state
  const player = state.turn
  const color = state.colors[player]
  const positions = state.positions.map((row) => row.slice())
  const from = positions[player][tokenIndex]
  const to = from === -1 ? 0 : from + roll
  positions[player][tokenIndex] = to

  const captured = []
  if (isOnRing(to)) {
    const globalCell = ringCell(color, to)
    if (!isSafeCell(globalCell)) {
      for (let q = 0; q < state.numPlayers; q++) {
        if (q === player) continue
        for (let j = 0; j < TOKENS_PER_PLAYER; j++) {
          const otherPos = positions[q][j]
          if (isOnRing(otherPos) && ringCell(state.colors[q], otherPos) === globalCell) {
            positions[q][j] = -1
            captured.push({ player: q, token: j, from: otherPos })
          }
        }
      }
    }
  }

  const justFinished = to === FINISH
  const wonGame = positions[player].every((p) => p === FINISH)
  const { turn, consecutiveSixes, forfeited } = advanceTurn(state, roll, wonGame)
  const seq = state.seq + 1

  return {
    ...state,
    seq,
    positions,
    turn,
    roll: null,
    consecutiveSixes,
    winner: wonGame ? player : null,
    lastEvent: { type: 'move', player, tokenIndex, from, to, roll, captured, justFinished, forfeited, seq },
  }
}

// ---------- online ----------

// Replays the event log ([{ seat, type: 'roll' | 'move', value, event_number }],
// value = dice value for a roll, token index for a move). Rows from the
// wrong seat or that aren't legal right now are skipped, so a stray or
// duplicate row can never desync a replaying client.
export function deriveOnline(numPlayers, events) {
  let state = createGame(numPlayers)
  const ordered = [...(events ?? [])].sort((a, b) => a.event_number - b.event_number)
  for (const ev of ordered) {
    if (state.winner != null) break
    if (ev.seat !== state.turn) continue
    if (ev.type === 'roll' && state.roll == null && ev.value >= 1 && ev.value <= 6) state = applyRoll(state, ev.value)
    else if (ev.type === 'move' && state.roll != null) state = applyMove(state, ev.value)
  }
  return state
}

// ---------- computer player ----------

// Distance (in ring cells) from cell a forward to cell b.
function ringDistance(a, b) {
  return (b - a + RING_LENGTH) % RING_LENGTH
}

// Is an opponent token sitting 1-6 cells behind this ring cell?
function threatened(state, player, globalCell) {
  if (isSafeCell(globalCell)) return false
  for (let q = 0; q < state.numPlayers; q++) {
    if (q === player) continue
    for (const pos of state.positions[q]) {
      if (!isOnRing(pos)) continue
      const d = ringDistance(ringCell(state.colors[q], pos), globalCell)
      if (d >= 1 && d <= 6) return true
    }
  }
  return false
}

// Picks a token for the current player's pending roll: capture if it can,
// then get tokens home or into the home column, leave the yard, step out
// of danger and avoid stopping in front of an opponent.
export function chooseToken(state) {
  const movable = getMovableTokens(state, state.roll)
  if (movable.length <= 1) return movable[0] ?? null
  const player = state.turn
  const color = state.colors[player]
  let best = movable[0]
  let bestScore = -Infinity
  for (const t of movable) {
    const next = applyMove(state, t)
    const ev = next.lastEvent
    let score = ev.to / 100
    if (ev.captured.length) score += 100
    if (ev.justFinished) score += 80
    else if (ev.to > RING_LENGTH - 2 && ev.from <= RING_LENGTH - 2) score += 50
    if (ev.from === -1) score += 40
    if (isOnRing(ev.from) && threatened(state, player, ringCell(color, ev.from))) score += 30
    if (isOnRing(ev.to)) {
      const cell = ringCell(color, ev.to)
      if (isSafeCell(cell)) score += 15
      else if (threatened(next, player, cell)) score -= 35
    }
    score += Math.random() * 0.5 // break ties without always picking token 1
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}
