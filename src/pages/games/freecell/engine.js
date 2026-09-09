// src/pages/games/freecell/engine.js
// Pure Freecell logic. No React. Built on the shared deck module
// (src/pages/games/lib/deck.js) so Go Fish and Freecell never duplicate
// card/shuffle code.
//
// State shape:
//   {
//     tableau: [ [card, ...] x8 ],  // index 0 = first dealt (top of cascade),
//                                    // last index = accessible/movable card
//     free:    [card|null x4],
//     foundations: { S: 0..13, H: 0..13, D: 0..13, C: 0..13 },  // rank built up to
//   }
// Standard rules: 4 free cells, 4 foundations (build up by suit from Ace),
// 8 tableau columns dealt with the full deck (no stock pile), tableau
// sequences move by descending rank with alternating colour.

import { makeDeck, shuffle, isRed } from '../lib/deck'

const SUITS = ['S', 'H', 'D', 'C']

export function dealGame(rng = Math.random) {
  const deck = shuffle(makeDeck(), rng)
  const tableau = Array.from({ length: 8 }, () => [])
  deck.forEach((card, i) => tableau[i % 8].push(card))
  return {
    tableau,
    free: [null, null, null, null],
    foundations: { S: 0, H: 0, D: 0, C: 0 },
  }
}

// Can `upper` legally sit directly on top of `lower` in a tableau column?
export function canStack(upper, lower) {
  return lower.rank === upper.rank + 1 && isRed(lower.suit) !== isRed(upper.suit)
}

// Cards ordered bottom-to-top (as stored in a tableau column). True if every
// consecutive pair is a legal descending, alternating-colour run.
export function isValidSequence(cards) {
  for (let i = 1; i < cards.length; i++) {
    if (!canStack(cards[i], cards[i - 1])) return false
  }
  return true
}

// Length of the valid movable run sitting at the top (accessible end) of a
// column — the cards a player could pick up together as a supermove.
export function movableRunLength(column) {
  if (column.length === 0) return 0
  let len = 1
  for (let i = column.length - 1; i > 0; i--) {
    if (canStack(column[i], column[i - 1])) len++
    else break
  }
  return len
}

// Classic Freecell supermove formula: (free cells open + 1) * 2^(empty
// tableau columns), excluding the destination column from that count if it's
// itself empty (it doesn't help move cards into itself).
export function maxSupermoveSize(state, targetColIndex = -1) {
  const emptyFree = state.free.filter((c) => c === null).length
  const emptyCols = state.tableau.filter((col, i) => col.length === 0 && i !== targetColIndex).length
  return (emptyFree + 1) * Math.pow(2, emptyCols)
}

export function canDropOnTableau(state, movingCards, targetColIndex) {
  const target = state.tableau[targetColIndex]
  if (target.length === 0) return true
  const top = target[target.length - 1]
  return canStack(movingCards[0], top)
}

export function canMoveToFoundation(card, foundations) {
  return foundations[card.suit] === card.rank - 1
}

// ---------- moves (each returns a NEW state, or null if illegal) ----------

export function moveTableauToTableau(state, fromCol, cardIndex, toCol) {
  if (fromCol === toCol) return null
  const col = state.tableau[fromCol]
  if (cardIndex < 0 || cardIndex >= col.length) return null
  const moving = col.slice(cardIndex)
  if (!isValidSequence(moving)) return null
  if (moving.length > maxSupermoveSize(state, toCol)) return null
  if (!canDropOnTableau(state, moving, toCol)) return null
  const tableau = state.tableau.map((c, i) => {
    if (i === fromCol) return c.slice(0, cardIndex)
    if (i === toCol) return [...c, ...moving]
    return c
  })
  return { ...state, tableau }
}

export function moveTableauToFree(state, fromCol, freeIndex) {
  if (state.free[freeIndex]) return null
  const col = state.tableau[fromCol]
  if (col.length === 0) return null
  const card = col[col.length - 1]
  const free = state.free.slice()
  free[freeIndex] = card
  const tableau = state.tableau.map((c, i) => (i === fromCol ? c.slice(0, -1) : c))
  return { ...state, free, tableau }
}

export function moveFreeToTableau(state, freeIndex, toCol) {
  const card = state.free[freeIndex]
  if (!card) return null
  if (!canDropOnTableau(state, [card], toCol)) return null
  const free = state.free.slice()
  free[freeIndex] = null
  const tableau = state.tableau.map((c, i) => (i === toCol ? [...c, card] : c))
  return { ...state, free, tableau }
}

export function moveTableauToFoundation(state, fromCol) {
  const col = state.tableau[fromCol]
  if (col.length === 0) return null
  const card = col[col.length - 1]
  if (!canMoveToFoundation(card, state.foundations)) return null
  const tableau = state.tableau.map((c, i) => (i === fromCol ? c.slice(0, -1) : c))
  const foundations = { ...state.foundations, [card.suit]: card.rank }
  return { ...state, tableau, foundations }
}

export function moveFreeToFoundation(state, freeIndex) {
  const card = state.free[freeIndex]
  if (!card) return null
  if (!canMoveToFoundation(card, state.foundations)) return null
  const free = state.free.slice()
  free[freeIndex] = null
  const foundations = { ...state.foundations, [card.suit]: card.rank }
  return { ...state, free, foundations }
}

// A card is safe to auto-send to its foundation once both opposite-colour
// foundations are already at least at (rank - 1) — moving it can never strand
// a card another pile still needs. Aces and twos are always safe.
export function isSafeAutoplay(card, foundations) {
  if (!canMoveToFoundation(card, foundations)) return false
  if (card.rank <= 2) return true
  const opposite = isRed(card.suit) ? [foundations.S, foundations.C] : [foundations.H, foundations.D]
  return opposite.every((r) => r >= card.rank - 1)
}

// Repeatedly sends every safe card to its foundation until none remain.
export function autoplaySafeMoves(state) {
  let next = state
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < next.free.length; i++) {
      const card = next.free[i]
      if (card && isSafeAutoplay(card, next.foundations)) {
        next = moveFreeToFoundation(next, i)
        changed = true
      }
    }
    for (let i = 0; i < next.tableau.length; i++) {
      const col = next.tableau[i]
      const card = col[col.length - 1]
      if (card && isSafeAutoplay(card, next.foundations)) {
        next = moveTableauToFoundation(next, i)
        changed = true
      }
    }
  }
  return next
}

export function isWon(state) {
  return SUITS.every((s) => state.foundations[s] === 13)
}
