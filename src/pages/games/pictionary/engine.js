// src/pages/games/pictionary/engine.js
// Word selection for Pictionary/Charades. Pure functions only; the component
// owns persistence.

export const DIFFICULTIES = ['easy', 'medium', 'hard']

// Builds the pool of words for a category ('all' or a key) and a difficulty
// ('mixed' or one of DIFFICULTIES).
export function buildPool(words, categoryKey, difficulty) {
  const cats = categoryKey === 'all' ? Object.keys(words) : [categoryKey]
  const diffs = difficulty === 'mixed' ? DIFFICULTIES : [difficulty]
  const pool = []
  for (const c of cats) for (const d of diffs) pool.push(...(words[c][d] || []))
  return pool
}

// Shuffle-bag pick: returns a word from `pool` that is not in `used`, so no
// word repeats until every word in the current pool has been seen. When the
// pool is exhausted, that pool's words are cleared from history and the bag
// refills (still avoiding `current` so the same word never comes up twice in
// a row). Returns { word, used } where `used` is the new history array.
export function pickWord(pool, used, current = null) {
  const usedSet = new Set(used)
  let candidates = pool.filter((w) => !usedSet.has(w))
  let history = used
  if (candidates.length === 0) {
    const poolSet = new Set(pool)
    history = used.filter((w) => !poolSet.has(w))
    candidates = pool.length > 1 ? pool.filter((w) => w !== current) : pool
  }
  const word = candidates[Math.floor(Math.random() * candidates.length)] ?? null
  return { word, used: word ? [...history, word] : history }
}

// Number of words in the pool not yet seen.
export function remainingCount(pool, used) {
  const usedSet = new Set(used)
  return pool.filter((w) => !usedSet.has(w)).length
}

// Formats whole seconds as m:ss for the countdown display.
export function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${String(rem).padStart(2, '0')}`
}
