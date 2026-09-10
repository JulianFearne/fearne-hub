// src/pages/games/pictionary/engine.js
// Picks a random index into a list of the given length, avoiding `exclude`
// (the current word) so "New word" doesn't repeat the same one twice in a
// row. Pure so it's trivial to test/reason about. Same pattern as Would You
// Rather's randomIndex.
export function randomIndex(length, exclude = -1) {
  if (length <= 1) return 0
  let i = exclude
  while (i === exclude) i = Math.floor(Math.random() * length)
  return i
}

// Formats whole seconds as m:ss for the countdown display.
export function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}:${String(rem).padStart(2, '0')}`
}
