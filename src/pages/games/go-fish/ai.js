// src/pages/games/go-fish/ai.js
// How a computer player picks its ask. It only uses what a person at the
// table would know: its own hand, and what everyone has asked for so far
// (asking for a rank means you hold it).
//
//   easy:   asks for a random rank it holds, from a random player.
//   clever: remembers who has asked for what. If someone is known to hold a
//           rank it also holds, it asks them for it; otherwise it asks for
//           the rank it holds most of, from whoever has the most cards.

import { ranksInHand } from './engine'

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

// From the derived log, which ranks each player is known to be holding.
export function knownHoldings(log, playerIds) {
  const known = {}
  playerIds.forEach((id) => (known[id] = new Set()))
  for (const entry of log) {
    known[entry.actorId]?.add(entry.rank)
    // The target either handed them over or never had any.
    known[entry.targetId]?.delete(entry.rank)
    for (const rank of entry.newBooks) known[entry.actorId]?.delete(rank)
  }
  return known
}

// Returns { targetId, rank } for player `meId`.
export function chooseAsk(derived, meId, playerIds, difficulty = 'clever') {
  const hand = derived.hands[meId] || []
  const ranks = ranksInHand(hand)
  const others = playerIds.filter((id) => id !== meId && (derived.hands[id] || []).length > 0)
  const targets = others.length ? others : playerIds.filter((id) => id !== meId)

  if (difficulty === 'easy') return { targetId: pick(targets), rank: pick(ranks) }

  const known = knownHoldings(derived.log, playerIds)
  const sure = []
  for (const id of targets) {
    for (const rank of ranks) if (known[id]?.has(rank)) sure.push({ targetId: id, rank })
  }
  if (sure.length) return pick(sure)

  const counts = {}
  for (const card of hand) counts[card.rank] = (counts[card.rank] || 0) + 1
  const most = Math.max(...ranks.map((r) => counts[r]))
  const rank = pick(ranks.filter((r) => counts[r] === most))
  const biggest = Math.max(...targets.map((id) => (derived.hands[id] || []).length))
  const targetId = pick(targets.filter((id) => (derived.hands[id] || []).length === biggest))
  return { targetId, rank }
}
