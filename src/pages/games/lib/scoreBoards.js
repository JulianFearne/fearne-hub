// src/pages/games/lib/scoreBoards.js
// Every family high-score board in one place. A game's scores are stored in
// the shared game_scores table (_reference/game-scores-schema.sql) under
// `game` + `board`, and this registry says how to rank and show them:
//
//   order   'high' (bigger is better) or 'low' (smaller is better, e.g. a
//           time or a number of moves)
//   format  score => text for the table
//
// The High scores page (/games/scores) lists the games in this order.

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

const points = (n) => plural(n, 'point')

export const SCORE_GAMES = {
  snake: {
    title: 'Snake',
    to: '/games/snake',
    boards: {
      kids: { label: 'Kids', order: 'high', format: (n) => plural(n, 'fruit', 'fruit') },
      classic: { label: 'Classic', order: 'high', format: (n) => plural(n, 'fruit', 'fruit') },
      maze: { label: 'Maze', order: 'high', format: (n) => plural(n, 'fruit', 'fruit') },
      rush: { label: 'Fruit rush', order: 'high', format: (n) => plural(n, 'fruit', 'fruit') },
    },
  },
  'car-dodge': {
    title: 'Car Dodge',
    to: '/games/car-dodge',
    boards: {
      easy: { label: 'Easy', order: 'high', format: points },
      normal: { label: 'Normal', order: 'high', format: points },
    },
  },
  frogger: {
    title: 'Frogger',
    to: '/games/frogger',
    boards: {
      easy: { label: 'Easy', order: 'high', format: points },
      classic: { label: 'Classic', order: 'high', format: points },
    },
  },
  'gem-clash': {
    title: 'Gem Clash',
    to: '/games/gem-clash',
    boards: {
      easy: { label: 'Easy', order: 'high', format: points },
      solo: { label: 'Solo', order: 'high', format: points },
    },
  },
  pong: {
    title: 'Pong',
    to: '/games/pong',
    boards: {
      wall: { label: 'Wall rally', order: 'high', format: (n) => plural(n, 'hit') },
    },
  },
  'wobbly-towers': {
    title: 'Wobbly Towers',
    to: '/games/wobbly-towers',
    boards: {
      classic: { label: 'Classic', order: 'high', format: (n) => plural(n, 'block') },
      powerups: { label: 'Power-ups', order: 'high', format: (n) => plural(n, 'block') },
    },
  },
  sudoku: {
    title: 'Sudoku',
    to: '/games/sudoku',
    boards: {
      easy: { label: 'Easy', order: 'low', format: formatTime },
      medium: { label: 'Medium', order: 'low', format: formatTime },
      hard: { label: 'Hard', order: 'low', format: formatTime },
    },
  },
  freecell: {
    title: 'Freecell',
    to: '/games/freecell',
    boards: {
      moves: { label: 'Fewest moves', order: 'low', format: (n) => plural(n, 'move') },
    },
  },
  hangman: {
    title: 'Hangman',
    to: '/games/hangman',
    boards: {
      streak: { label: 'Best streak', order: 'high', format: (n) => `${plural(n, 'word')} in a row` },
    },
  },
  battleship: {
    title: 'Battleship',
    to: '/games/battleship',
    boards: {
      easy: { label: 'Easy', order: 'low', format: (n) => plural(n, 'shot') },
      medium: { label: 'Medium', order: 'low', format: (n) => plural(n, 'shot') },
      hard: { label: 'Hard', order: 'low', format: (n) => plural(n, 'shot') },
    },
  },
  checkers: {
    title: 'Checkers',
    to: '/games/checkers',
    boards: {
      easy: { label: 'Easy', order: 'low', format: (n) => plural(n, 'move') },
      medium: { label: 'Medium', order: 'low', format: (n) => plural(n, 'move') },
      hard: { label: 'Hard', order: 'low', format: (n) => plural(n, 'move') },
    },
  },
  chess: {
    title: 'Chess',
    to: '/games/chess',
    boards: {
      easy: { label: 'Easy', order: 'low', format: (n) => plural(n, 'move') },
      medium: { label: 'Medium', order: 'low', format: (n) => plural(n, 'move') },
      hard: { label: 'Hard', order: 'low', format: (n) => plural(n, 'move') },
    },
  },
  'connect-four': {
    title: 'Connect Four',
    to: '/games/connect-four',
    boards: {
      easy: { label: 'Easy', order: 'low', format: (n) => plural(n, 'disc') },
      medium: { label: 'Medium', order: 'low', format: (n) => plural(n, 'disc') },
      hard: { label: 'Hard', order: 'low', format: (n) => plural(n, 'disc') },
    },
  },
}

export function boardInfo(game, board) {
  return SCORE_GAMES[game]?.boards[board] ?? { label: board, order: 'high', format: String }
}

// True when score a beats score b on this board.
export function beats(info, a, b) {
  return info.order === 'low' ? a < b : a > b
}
