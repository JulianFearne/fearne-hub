// src/pages/games/bingo/Bingo.jsx
// Offline. One phone acts as the caller: draw a number, everyone checks
// their card. 75-ball US-style cards (B-I-N-G-O, free centre) since they're
// simple to generate correctly; "Tombola" and "Bingo" are the same game to
// most families, so this one screen covers both names.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LETTERS, createGame, drawNumber } from './engine'
import './bingo.css'

const CARD_COUNTS = [1, 2, 3, 4, 5, 6]

function columnLetter(number) {
  return LETTERS[Math.floor((number - 1) / 15)]
}

export default function Bingo() {
  const [numCards, setNumCards] = useState(2)
  const [game, setGame] = useState(() => createGame(2))
  const [lastNumber, setLastNumber] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  function newGame(count) {
    setNumCards(count)
    setGame(createGame(count))
    setLastNumber(null)
    setAnnouncement('')
  }

  function draw() {
    const { state, number, newly } = drawNumber(game)
    setGame(state)
    if (number == null) return
    setLastNumber(number)
    if (navigator.vibrate) navigator.vibrate(15)
    const bits = []
    if (newly.line.length > 0) bits.push(`Line! Card ${newly.line.map((i) => i + 1).join(', ')}`)
    if (newly.fullHouse.length > 0) bits.push(`Full house! Card ${newly.fullHouse.map((i) => i + 1).join(', ')} wins!`)
    setAnnouncement(bits.join(' · '))
  }

  const poolEmpty = game.queue.length === 0
  const canDraw = !game.over && !poolEmpty

  return (
    <div className="bgo">
      <header className="bgo-header">
        <Link to="/games" className="bgo-back">
          ← Games
        </Link>
        <h1 className="bgo-title">Bingo</h1>
      </header>

      <div className="bgo-panel">
        <div className="bgo-themes">
          {CARD_COUNTS.map((count) => (
            <button
              key={count}
              className={`bgo-chip ${numCards === count ? 'active' : ''}`}
              onClick={() => newGame(count)}
            >
              {count} {count === 1 ? 'card' : 'cards'}
            </button>
          ))}
        </div>

        <div className="bgo-caller">
          <div className={`bgo-ball ${lastNumber ? 'has-number' : ''}`}>
            {lastNumber ? (
              <>
                <span className="bgo-ball-letter">{columnLetter(lastNumber)}</span>
                <span className="bgo-ball-number">{lastNumber}</span>
              </>
            ) : (
              <span className="bgo-ball-hint">?</span>
            )}
          </div>
          <div className="bgo-caller-info">
            <p className="bgo-status">
              {game.over
                ? 'Full house! Game over.'
                : poolEmpty
                  ? 'All 75 numbers called.'
                  : announcement || (lastNumber ? 'Mark your cards' : 'Tap draw to start')}
            </p>
            <p className="bgo-drawn-count">{game.drawn.length}/75 called</p>
          </div>
        </div>

        <button className="bgo-btn primary" onClick={draw} disabled={!canDraw}>
          Draw number
        </button>

        {game.drawn.length > 0 && (
          <div className="bgo-history">
            {game.drawn
              .slice()
              .reverse()
              .slice(0, 15)
              .map((n) => (
                <span key={n} className="bgo-history-chip">
                  {columnLetter(n)}
                  {n}
                </span>
              ))}
          </div>
        )}

        <div className="bgo-cards">
          {game.cards.map((card, ci) => {
            const isFullHouse = game.fullHouseWinners.includes(ci)
            const isLine = game.lineWinners.includes(ci)
            return (
              <div key={ci} className={`bgo-card ${isFullHouse ? 'won' : ''}`}>
                <div className="bgo-card-header">
                  <span>Card {ci + 1}</span>
                  {isFullHouse && <span className="bgo-badge full">Full house!</span>}
                  {!isFullHouse && isLine && <span className="bgo-badge line">Line!</span>}
                </div>
                <div className="bgo-card-letters">
                  {LETTERS.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
                <div className="bgo-card-grid">
                  {card.map((row, r) =>
                    row.map((cell, c) => (
                      <span key={`${r}-${c}`} className={`bgo-cell ${cell.marked ? 'marked' : ''} ${cell.value === 'FREE' ? 'free' : ''}`}>
                        {cell.value === 'FREE' ? '★' : cell.value}
                      </span>
                    )),
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {(game.over || poolEmpty) && (
          <div className="bgo-actions">
            <button className="bgo-btn primary" onClick={() => newGame(numCards)}>
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
