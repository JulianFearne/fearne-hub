// src/pages/games/bingo/engine.js
// Pure 75-ball Bingo (US-style, 5x5 card, B-I-N-G-O columns, free centre)
// logic. No React. One device acts as the caller for everyone at the table
// "Tombola" and "Bingo" are the same call-and-mark game to most families,
// so this one screen covers both.

export const LETTERS = ['B', 'I', 'N', 'G', 'O']
export const COLUMN_RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
]
export const POOL_SIZE = 75

function shuffledRange(min, max, rng) {
  const arr = []
  for (let n = min; n <= max; n++) arr.push(n)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// A card is a 5x5 grid of { value, marked }. Column c's values come from
// COLUMN_RANGES[c]; the centre cell (row 2, col 2) is a free space, already
// marked.
export function createCard(rng = Math.random) {
  const grid = Array.from({ length: 5 }, () => Array(5).fill(null))
  for (let c = 0; c < 5; c++) {
    const [min, max] = COLUMN_RANGES[c]
    const needed = c === 2 ? 4 : 5 // N column skips the free centre
    const values = shuffledRange(min, max, rng).slice(0, needed)
    let vi = 0
    for (let r = 0; r < 5; r++) {
      if (r === 2 && c === 2) {
        grid[r][c] = { value: 'FREE', marked: true }
      } else {
        grid[r][c] = { value: values[vi], marked: false }
        vi++
      }
    }
  }
  return grid
}

export function markNumber(card, number) {
  return card.map((row) =>
    row.map((cell) => (cell.value === number ? { ...cell, marked: true } : cell)),
  )
}

export function hasLine(card) {
  for (let r = 0; r < 5; r++) if (card[r].every((cell) => cell.marked)) return true
  for (let c = 0; c < 5; c++) if (card.every((row) => row[c].marked)) return true
  if ([0, 1, 2, 3, 4].every((i) => card[i][i].marked)) return true
  if ([0, 1, 2, 3, 4].every((i) => card[i][4 - i].marked)) return true
  return false
}

export function hasFullHouse(card) {
  return card.every((row) => row.every((cell) => cell.marked))
}

export function createGame(numCards, rng = Math.random) {
  return {
    cards: Array.from({ length: numCards }, () => createCard(rng)),
    queue: shuffledRange(1, POOL_SIZE, rng),
    drawn: [],
    lineWinners: [],
    fullHouseWinners: [],
    over: false,
  }
}

// Returns { state, number, newly }, a NEW state, never mutates the input.
// `newly` lists card indices that just achieved a line / full house on this
// draw. `number` is null once the pool is exhausted or the game is over.
export function drawNumber(state) {
  if (state.over || state.queue.length === 0) {
    return { state, number: null, newly: { line: [], fullHouse: [] } }
  }
  const [number, ...queue] = state.queue
  const cards = state.cards.map((card) => markNumber(card, number))
  const drawn = [...state.drawn, number]

  const lineWinners = [...state.lineWinners]
  const fullHouseWinners = [...state.fullHouseWinners]
  const newly = { line: [], fullHouse: [] }
  cards.forEach((card, i) => {
    if (!lineWinners.includes(i) && hasLine(card)) {
      lineWinners.push(i)
      newly.line.push(i)
    }
    if (!fullHouseWinners.includes(i) && hasFullHouse(card)) {
      fullHouseWinners.push(i)
      newly.fullHouse.push(i)
    }
  })

  const over = fullHouseWinners.length > 0
  return { state: { ...state, cards, queue, drawn, lineWinners, fullHouseWinners, over }, number, newly }
}
