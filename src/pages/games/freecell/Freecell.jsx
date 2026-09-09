// src/pages/games/freecell/Freecell.jsx
// Offline single-player. No Supabase, no props. Tap-to-select then
// tap-to-place interaction (works equally well with touch and a mouse,
// no drag-and-drop library needed).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cardLabel, isRed } from '../lib/deck'
import {
  autoplaySafeMoves,
  dealGame,
  isWon,
  maxSupermoveSize,
  movableRunLength,
  moveFreeToFoundation,
  moveFreeToTableau,
  moveTableauToFoundation,
  moveTableauToFree,
  moveTableauToTableau,
} from './engine'
import './freecell.css'

function Card({ card, selected, dimmed }) {
  return (
    <div className={`fc-card ${isRed(card.suit) ? 'red' : 'black'} ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`}>
      {cardLabel(card)}
    </div>
  )
}

export default function Freecell() {
  const [state, setState] = useState(() => dealGame())
  const [selection, setSelection] = useState(null) // { type: 'tableau', col, cardIndex } | { type: 'free', index }
  const [moves, setMoves] = useState(0)
  const [wins, setWins] = useState(0)
  const [error, setError] = useState('')

  const won = useMemo(() => isWon(state), [state])

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 1500)
      return () => clearTimeout(t)
    }
  }, [error])

  useEffect(() => {
    if (won) setWins((w) => w + 1)
  }, [won])

  const newGame = useCallback(() => {
    setState(dealGame())
    setSelection(null)
    setMoves(0)
    setError('')
  }, [])

  function applyMove(next, label) {
    if (!next) {
      setError(label)
      return
    }
    setState(autoplaySafeMoves(next))
    setMoves((m) => m + 1)
    setSelection(null)
  }

  function selectTableauCard(col, cardIndex) {
    if (won) return
    const column = state.tableau[col]
    const runStart = column.length - movableRunLength(column)

    if (!selection) {
      if (column.length === 0 || cardIndex < runStart) return // nothing there to pick up
      setSelection({ type: 'tableau', col, cardIndex })
      return
    }

    if (selection.type === 'tableau' && selection.col === col) {
      setSelection(cardIndex < runStart ? null : { type: 'tableau', col, cardIndex })
      return
    }

    // Attempt to move the current selection onto this column.
    if (selection.type === 'tableau') {
      applyMove(
        moveTableauToTableau(state, selection.col, selection.cardIndex, col),
        "That card can't go there."
      )
    } else if (selection.type === 'free') {
      applyMove(moveFreeToTableau(state, selection.index, col), "That card can't go there.")
    }
  }

  function selectFreeCell(index) {
    if (won) return
    const card = state.free[index]

    if (!selection) {
      if (card) setSelection({ type: 'free', index })
      return
    }

    if (selection.type === 'free' && selection.index === index) {
      setSelection(null)
      return
    }

    if (card) {
      // Occupied free cell tapped while something else is selected — just
      // switch the selection to this card instead of attempting a move.
      setSelection({ type: 'free', index })
      return
    }

    if (selection.type === 'tableau') {
      applyMove(moveTableauToFree(state, selection.col, index), 'No free cells open.')
    } else if (selection.type === 'free') {
      setSelection(null)
    }
  }

  function sendSelectionToFoundation() {
    if (!selection) return
    if (selection.type === 'tableau') {
      applyMove(moveTableauToFoundation(state, selection.col), "That card can't go up yet.")
    } else {
      applyMove(moveFreeToFoundation(state, selection.index), "That card can't go up yet.")
    }
  }

  const runStarts = state.tableau.map((col) => col.length - movableRunLength(col))
  const supermoveLimit = maxSupermoveSize(state)

  return (
    <div className="freecell">
      <header className="fc-header">
        <Link to="/games" className="fc-back">
          ← Games
        </Link>
        <h1 className="fc-title">Freecell</h1>
      </header>

      <div className="fc-panel">
        <div className="fc-top-row">
          <div className="fc-frees">
            {state.free.map((card, i) => (
              <div
                key={i}
                className={`fc-slot fc-free ${selection?.type === 'free' && selection.index === i ? 'target-selected' : ''}`}
                onClick={() => selectFreeCell(i)}
              >
                {card && <Card card={card} selected={selection?.type === 'free' && selection.index === i} />}
              </div>
            ))}
          </div>
          <div className="fc-foundations">
            {['S', 'H', 'D', 'C'].map((suit) => (
              <div key={suit} className={`fc-slot fc-foundation ${isRed(suit) ? 'red' : 'black'}`}>
                {state.foundations[suit] > 0
                  ? cardLabel({ rank: state.foundations[suit], suit })
                  : ''}
              </div>
            ))}
          </div>
        </div>

        <div className="fc-tableau">
          {state.tableau.map((column, col) => (
            <div key={col} className="fc-column" onClick={() => column.length === 0 && selectTableauCard(col, 0)}>
              {column.map((card, cardIndex) => {
                const isSelected =
                  selection?.type === 'tableau' && selection.col === col && cardIndex >= selection.cardIndex
                const isMovable = cardIndex >= runStarts[col]
                return (
                  <div
                    key={card.id}
                    className="fc-card-wrap"
                    style={{ top: `${cardIndex * 26}px`, zIndex: cardIndex }}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectTableauCard(col, cardIndex)
                    }}
                  >
                    <Card card={card} selected={isSelected} dimmed={!isMovable && !isSelected} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="fc-toolbar">
          <div className="fc-stats">
            Moves <strong>{moves}</strong> · Wins <strong>{wins}</strong>
          </div>
          <div className="fc-actions">
            {selection && (
              <button className="fc-btn" onClick={sendSelectionToFoundation}>
                Send up ↑
              </button>
            )}
            <button className="fc-btn primary" onClick={newGame}>
              New deal
            </button>
          </div>
        </div>

        {error && <div className="fc-error">{error}</div>}
        <p className="fc-hint">
          Tap a card, then tap where it should go. Up to {supermoveLimit} card
          {supermoveLimit === 1 ? '' : 's'} can move together right now.
        </p>

        {won && <div className="fc-won-banner">Solved it in {moves} moves! 🎉</div>}
      </div>
    </div>
  )
}
