// src/pages/games/lib/deck.js
// Shared card helpers for every card game (Freecell, Go Fish, and any future
// ones). Pure functions, no dependency. A card is { rank, suit, id }:
//   rank: 1..13  (1 = Ace, 11 = Jack, 12 = Queen, 13 = King)
//   suit: 'S' | 'H' | 'D' | 'C'
//   id:   e.g. 'S1', 'H13'  (stable, used as React keys and in move history)

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const RANK_LABELS = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K',
};
const SUIT_SYMBOLS = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };

export function cardId(rank, suit) {
  return `${suit}${rank}`;
}

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: cardId(rank, suit) });
    }
  }
  return deck;
}

// Deterministic RNG so a shuffle can be reproduced from a numeric seed. Used by
// Go Fish, where the deck order is stored once and every later "draw" is
// replayed from it.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates. Returns a NEW array; does not mutate the input.
export function shuffle(deck, rng = Math.random) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rankLabel(rank) {
  return RANK_LABELS[rank] || String(rank);
}

export function suitSymbol(suit) {
  return SUIT_SYMBOLS[suit] || suit;
}

export function isRed(suit) {
  return suit === 'H' || suit === 'D';
}

// Convenience for rendering: 'A\u2660', '10\u2665', etc.
export function cardLabel(card) {
  return `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;
}
