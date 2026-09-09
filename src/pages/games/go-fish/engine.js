// src/pages/games/go-fish/engine.js
// Pure Go Fish logic. No React, no Supabase.
//
// Follows the same derive-from-rows principle as Connect Four and
// AnimalPlaceThing: the database only ever stores the sequence of "ask"
// events (who asked whom for what rank) plus the numeric seed used to
// shuffle the deck. Everything else — hands, the pond, whose turn it is,
// completed books, scores — is recomputed by deriveState() by replaying
// those events over the deterministic seeded shuffle. Two clients with the
// same seed and the same event rows always land on the same state, so
// there's nothing to desync.
//
// Rules (simplified for a family game): ask an opponent for a rank you
// already hold at least one of. If they have any, you take them all and go
// again. If not, you draw one card from the pond ("go fish"); draw the rank
// you asked for and you go again, otherwise play passes to the next seat.
// Any four-of-a-kind is immediately set aside as a completed book. If it
// becomes your turn with an empty hand, you draw one card from the pond to
// have something to play (or your turn is skipped if the pond is empty
// too). The game ends when the pond and every hand are empty; most books
// wins.

import { makeDeck, shuffle, mulberry32 } from '../lib/deck'

export function handSizeFor(playerCount) {
  return playerCount <= 2 ? 7 : 5
}

export function dealtDeck(seed) {
  return shuffle(makeDeck(), mulberry32(seed))
}

function countRank(hand, rank) {
  return hand.filter((c) => c.rank === rank).length
}

export function ranksInHand(hand) {
  return [...new Set(hand.map((c) => c.rank))].sort((a, b) => a - b)
}

// Pulls out any rank present exactly 4 times as a completed book.
function removeBooks(hand) {
  const byRank = {}
  for (const c of hand) (byRank[c.rank] ||= []).push(c)
  const booksCompleted = []
  let remaining = []
  for (const key of Object.keys(byRank)) {
    const cards = byRank[key]
    if (cards.length === 4) booksCompleted.push(Number(key))
    else remaining = remaining.concat(cards)
  }
  return { hand: remaining, booksCompleted }
}

// players: [{ user_id, seat }], events: [{ type: 'ask', actor_id, target_id, rank, event_number }]
// (ordered by event_number; anything not recognised/legal is skipped so a
// stray or duplicate row can never desync a replaying client).
export function deriveState(players, deckSeed, events) {
  const seats = [...players].sort((a, b) => a.seat - b.seat)
  const deck = dealtDeck(deckSeed)
  const handSize = handSizeFor(seats.length)

  const hands = {}
  const books = {}
  seats.forEach((p) => {
    hands[p.user_id] = []
    books[p.user_id] = []
  })

  let pondPtr = 0
  seats.forEach((p) => {
    for (let i = 0; i < handSize && pondPtr < deck.length; i++) {
      hands[p.user_id].push(deck[pondPtr])
      pondPtr++
    }
  })

  function drawOne(userId) {
    if (pondPtr >= deck.length) return null
    const card = deck[pondPtr]
    pondPtr++
    hands[userId].push(card)
    return card
  }

  function settleBooks(userId) {
    const { hand, booksCompleted } = removeBooks(hands[userId])
    hands[userId] = hand
    if (booksCompleted.length) books[userId].push(...booksCompleted)
    return booksCompleted
  }

  seats.forEach((p) => settleBooks(p.user_id)) // a natural book straight off the deal

  const seatIndexOf = (userId) => seats.findIndex((p) => p.user_id === userId)
  const isOver = () => pondPtr >= deck.length && seats.every((p) => hands[p.user_id].length === 0)

  let turnIndex = 0

  // Whoever's turn it is gets a card from the pond if their hand is empty,
  // so there's always something to ask with; skips a player who's empty
  // with nothing left to draw.
  function ensurePlayable() {
    for (let guard = 0; guard < seats.length * 2; guard++) {
      if (isOver()) return
      const p = seats[turnIndex]
      if (hands[p.user_id].length > 0) return
      if (pondPtr < deck.length) {
        drawOne(p.user_id)
        settleBooks(p.user_id)
        if (hands[p.user_id].length > 0) return
      }
      turnIndex = (turnIndex + 1) % seats.length
    }
  }

  ensurePlayable()

  const log = []
  for (const ev of events) {
    if (isOver()) break
    if (ev.type !== 'ask') continue
    if (!(ev.rank >= 1 && ev.rank <= 13)) continue
    const actorSeat = seatIndexOf(ev.actor_id)
    if (actorSeat === -1 || actorSeat !== turnIndex) continue // not this player's turn
    if (ev.target_id === ev.actor_id) continue
    if (seatIndexOf(ev.target_id) === -1) continue
    if (countRank(hands[ev.actor_id], ev.rank) === 0) continue // must hold one to ask

    const targetHasRank = countRank(hands[ev.target_id], ev.rank) > 0
    let outcome
    let goAgain
    if (targetHasRank) {
      const moved = hands[ev.target_id].filter((c) => c.rank === ev.rank)
      hands[ev.target_id] = hands[ev.target_id].filter((c) => c.rank !== ev.rank)
      hands[ev.actor_id] = hands[ev.actor_id].concat(moved)
      goAgain = true
      outcome = { type: 'hit', count: moved.length }
    } else {
      const drawn = drawOne(ev.actor_id)
      goAgain = drawn ? drawn.rank === ev.rank : false
      outcome = { type: 'gofish', drawn }
    }
    const newBooks = settleBooks(ev.actor_id)

    log.push({
      actorId: ev.actor_id,
      targetId: ev.target_id,
      rank: ev.rank,
      outcome,
      newBooks,
    })

    if (!goAgain) turnIndex = (turnIndex + 1) % seats.length
    ensurePlayable()
  }

  const scores = {}
  seats.forEach((p) => {
    scores[p.user_id] = books[p.user_id].length
  })

  return {
    hands,
    books,
    scores,
    log,
    pondCount: deck.length - pondPtr,
    currentTurnUserId: seats[turnIndex]?.user_id ?? null,
    isOver: isOver(),
  }
}
