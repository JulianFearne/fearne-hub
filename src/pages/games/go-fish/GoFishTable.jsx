// src/pages/games/go-fish/GoFishTable.jsx
// The Go Fish table both modes share: opponents (tap one to ask), the pond,
// the last few asks, your books and your hand; then the scoreboard once the
// game is over. Takes the derived state from engine.deriveState and leaves
// all the who-did-what plumbing (Supabase or the computer) to the caller.

import { cardLabel, isRed, rankLabel } from '../lib/deck'
import { ranksInHand } from './engine'

const LOG_LINES = 3

function logLine(entry, nameOf) {
  const result =
    entry.outcome.type === 'hit'
      ? `got ${entry.outcome.count}!`
      : entry.outcome.drawn
        ? 'Go Fish!'
        : 'Go Fish (pond empty)'
  const books = entry.newBooks.length > 0 ? ` · completed a book of ${entry.newBooks.map(rankLabel).join(', ')}s!` : ''
  return `${nameOf(entry.actorId)} asked ${nameOf(entry.targetId)} for ${rankLabel(entry.rank)}s, ${result}${books}`
}

export default function GoFishTable({
  players,
  meId,
  derived,
  selectedRank,
  onSelectRank,
  onAsk,
  waitingText,
  onPlayAgain,
  onLeave,
  leaveLabel = 'Leave',
}) {
  const nameOf = (uid) => (uid === meId ? 'You' : players.find((p) => p.user_id === uid)?.display_name || 'Player')
  const myHand = derived.hands[meId] || []
  const myTurn = derived.currentTurnUserId === meId

  if (derived.isOver) {
    const best = Math.max(...players.map((p) => derived.scores[p.user_id]))
    const winners = players.filter((p) => derived.scores[p.user_id] === best)
    return (
      <div className="gf2-finished">
        <h2 className="gf2-finished-title">
          {winners.length === 1 && winners[0].user_id === meId ? 'You win! 🎉' : 'Game over!'}
        </h2>
        <p className="gf2-finished-sub">
          {winners.length > 1 ? "It's a tie between " : 'Winner: '}
          {winners.map((w) => (w.user_id === meId ? 'you' : w.display_name)).join(' & ')}
        </p>
        <div className="gf2-scoreboard">
          {[...players]
            .sort((a, b) => derived.scores[b.user_id] - derived.scores[a.user_id])
            .map((p) => (
              <div key={p.user_id} className="gf2-score-row">
                <span>
                  {p.display_name}
                  {p.user_id === meId ? ' (you)' : ''}
                </span>
                <span className="gf2-score-pts">{derived.scores[p.user_id]} books</span>
              </div>
            ))}
        </div>
        <div className="gf2-actions">
          <button className="gf2-btn primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button className="gf2-btn ghost" onClick={onLeave}>
            {leaveLabel}
          </button>
        </div>
      </div>
    )
  }

  const recent = derived.log.slice(-LOG_LINES).reverse()

  return (
    <>
      <div className={`gf2-turn-banner ${myTurn ? 'is-mine' : ''}`}>
        {myTurn ? 'Your turn. Pick a card, then who to ask' : waitingText ?? `${nameOf(derived.currentTurnUserId)}'s turn`}
      </div>

      <div className="gf2-opponents">
        {players
          .filter((p) => p.user_id !== meId)
          .map((p) => (
            <button
              key={p.user_id}
              className={`gf2-opponent ${derived.currentTurnUserId === p.user_id ? 'active-turn' : ''}`}
              disabled={!myTurn || selectedRank == null}
              onClick={() => onAsk(p.user_id)}
            >
              <span className="gf2-opponent-name">{p.display_name}</span>
              <span className="gf2-opponent-count">{(derived.hands[p.user_id] || []).length} cards</span>
              <span className="gf2-opponent-books">{(derived.books[p.user_id] || []).length} books</span>
            </button>
          ))}
      </div>

      <div className="gf2-pond">Pond: {derived.pondCount} cards left</div>

      {recent.length > 0 && (
        <div className="gf2-log">
          {recent.map((entry, i) => (
            <div key={derived.log.length - i} className={i === 0 ? 'gf2-log-latest' : 'gf2-log-older'}>
              {logLine(entry, nameOf)}
            </div>
          ))}
        </div>
      )}

      <div className="gf2-my-books">My books: {(derived.books[meId] || []).map(rankLabel).join(', ') || 'none yet'}</div>

      <div className="gf2-hand">
        {[...myHand]
          .sort((a, b) => a.rank - b.rank)
          .map((card) => (
            <button
              key={card.id}
              className={`gf2-card ${isRed(card.suit) ? 'red' : 'black'} ${selectedRank === card.rank ? 'selected' : ''}`}
              disabled={!myTurn}
              onClick={() => onSelectRank(selectedRank === card.rank ? null : card.rank)}
            >
              {cardLabel(card)}
            </button>
          ))}
      </div>
      {myTurn && ranksInHand(myHand).length > 0 && (
        <p className="gf2-hint">
          {selectedRank ? `Asking for ${rankLabel(selectedRank)}s. Tap a player above.` : 'Tap a card to choose what to ask for.'}
        </p>
      )}

      <button className="gf2-btn ghost" onClick={onLeave}>
        {leaveLabel}
      </button>
    </>
  )
}
