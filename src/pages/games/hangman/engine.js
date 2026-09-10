// src/pages/games/hangman/engine.js
// Pure Hangman logic. No React. Word lists are data (wordLists.json), not
// hardcoded here, so new themes are a data change.

export const MAX_WRONG = 6

export function pickWord(words, rng = Math.random) {
  return words[Math.floor(rng() * words.length)]
}

export function createGame(word) {
  return { word: word.toUpperCase(), guessed: [], wrong: 0 }
}

// Returns a NEW state — never mutates the input. Guessing a letter already
// guessed, or guessing after the game is already over, is a no-op.
export function guessLetter(state, letter) {
  const L = letter.toUpperCase()
  if (state.guessed.includes(L) || isWon(state) || isLost(state)) return state
  const guessed = [...state.guessed, L]
  const wrong = state.word.includes(L) ? state.wrong : state.wrong + 1
  return { ...state, guessed, wrong }
}

export function getDisplayLetters(state) {
  return state.word.split('').map((ch) => (state.guessed.includes(ch) ? ch : null))
}

export function isWon(state) {
  return state.word.split('').every((ch) => state.guessed.includes(ch))
}

export function isLost(state) {
  return state.wrong >= MAX_WRONG
}

export function isOver(state) {
  return isWon(state) || isLost(state)
}
