// Picks a random index into a list of the given length, avoiding `exclude`
// (the current prompt) so "Next question" doesn't repeat the same one twice
// in a row. Pure so it's trivial to test/reason about.
export function randomIndex(length, exclude = -1) {
  if (length <= 1) return 0
  let i = exclude
  while (i === exclude) i = Math.floor(Math.random() * length)
  return i
}
