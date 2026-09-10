// src/pages/games/snakes-and-ladders/SnakesAndLadders.jsx
// Offline pass-and-play for 2-4 players. No Supabase, no props: one board,
// everyone takes turns rolling. Classic UK rule: you need the exact number
// to reach square 100, an overshoot just wastes the turn.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BOARD_SIZE, CHUTES_AND_LADDERS, applyRoll, createGame, rollDice } from './engine'
import './snakes-and-ladders.css'

const PLAYER_COLORS = ['p1', 'p2', 'p3', 'p4']
const PLAYER_COUNTS = [2, 3, 4]

// Board squares snake left-to-right then right-to-left, row by row from the
// bottom (square 1) to the top (square 100), the classic layout.
function squareToGrid(square) {
  const row = Math.floor((square - 1) / 10)
  const withinRow = (square - 1) % 10
  const col = row % 2 === 0 ? withinRow : 9 - withinRow
  return { gridRow: 10 - row, gridColumn: col + 1 }
}

function describeEvent(event) {
  const who = `Player ${event.player + 1}`
  switch (event.type) {
    case 'blocked':
      return `${who} rolled ${event.roll}, not enough room, stays on ${event.from}.`
    case 'ladder':
      return `${who} rolled ${event.roll}, landed on ${event.rolled} and climbed a ladder to ${event.to}!`
    case 'snake':
      return `${who} rolled ${event.roll}, landed on ${event.rolled} and slid down a snake to ${event.to}.`
    case 'move':
      return `${who} rolled ${event.roll} and moved to ${event.to}.`
    default:
      return ''
  }
}

export default function SnakesAndLadders() {
  const [numPlayers, setNumPlayers] = useState(2)
  const [game, setGame] = useState(() => createGame(2))
  const [lastEvent, setLastEvent] = useState(null)
  const [rolling, setRolling] = useState(false)

  function newGame(count) {
    setNumPlayers(count)
    setGame(createGame(count))
    setLastEvent(null)
  }

  function roll() {
    if (game.winner != null || rolling) return
    setRolling(true)
    setTimeout(() => {
      const value = rollDice()
      const { state, event } = applyRoll(game, value)
      setGame(state)
      setLastEvent(event)
      setRolling(false)
      if (navigator.vibrate) navigator.vibrate(15)
    }, 250)
  }

  const squares = []
  for (let n = 1; n <= BOARD_SIZE; n++) {
    const target = CHUTES_AND_LADDERS[n]
    const kind = target == null ? null : target > n ? 'ladder' : 'snake'
    const tokensHere = game.positions
      .map((pos, i) => (pos === n ? i : null))
      .filter((i) => i !== null)
    squares.push(
      <div key={n} className={`snl-square ${kind ?? ''}`} style={squareToGrid(n)}>
        <span className="snl-num">{n}</span>
        {kind && <span className="snl-mark">{kind === 'ladder' ? `🪜${target}` : `🐍${target}`}</span>}
        {tokensHere.length > 0 && (
          <span className="snl-tokens">
            {tokensHere.map((i) => (
              <span key={i} className={`snl-token ${PLAYER_COLORS[i]}`} />
            ))}
          </span>
        )}
      </div>,
    )
  }

  return (
    <div className="snl">
      <header className="snl-header">
        <Link to="/games" className="snl-back">
          ← Games
        </Link>
        <h1 className="snl-title">Snakes and Ladders</h1>
      </header>

      <div className="snl-panel">
        <div className="snl-themes">
          {PLAYER_COUNTS.map((count) => (
            <button
              key={count}
              className={`snl-chip ${numPlayers === count ? 'active' : ''}`}
              onClick={() => newGame(count)}
            >
              {count} players
            </button>
          ))}
        </div>

        <div className="snl-players">
          {Array.from({ length: numPlayers }, (_, i) => (
            <span key={i} className={`snl-player-chip ${PLAYER_COLORS[i]} ${game.turn === i && game.winner == null ? 'active' : ''}`}>
              <span className={`snl-token ${PLAYER_COLORS[i]}`} /> Player {i + 1}
            </span>
          ))}
        </div>

        <div className="snl-board">{squares}</div>

        <div className={`snl-status ${game.winner != null ? 'is-over' : ''}`}>
          {game.winner != null ? `Player ${game.winner + 1} wins! 🎉` : lastEvent ? describeEvent(lastEvent) : `Player ${game.turn + 1}'s turn`}
        </div>

        <div className="snl-actions">
          {game.winner == null ? (
            <button className="snl-btn primary" onClick={roll} disabled={rolling}>
              {rolling ? 'Rolling…' : 'Roll dice'}
            </button>
          ) : (
            <button className="snl-btn primary" onClick={() => newGame(numPlayers)}>
              Play again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
