// src/pages/games/dots-and-boxes/DotsAndBoxes.jsx
// Offline 2-player pass-and-play. No Supabase, no props: one screen, two
// people take turns tapping an edge. Completing a box scores a point and
// earns another go, same rule as the pen-and-paper original.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PLAYER_1, PLAYER_2, createGame, drawEdge, getWinner, isBoardFull } from './engine'
import './dots-and-boxes.css'

const SIZES = [
  { key: 'small', label: 'Small', rows: 3, cols: 3 },
  { key: 'medium', label: 'Medium', rows: 4, cols: 4 },
  { key: 'large', label: 'Large', rows: 5, cols: 5 },
]

export default function DotsAndBoxes() {
  const [sizeKey, setSizeKey] = useState('medium')
  const size = SIZES.find((s) => s.key === sizeKey)
  const [game, setGame] = useState(() => createGame(size.rows, size.cols))

  const full = isBoardFull(game)
  const result = full ? getWinner(game) : null

  function changeSize(key) {
    const s = SIZES.find((x) => x.key === key)
    setSizeKey(key)
    setGame(createGame(s.rows, s.cols))
  }

  function newGame() {
    setGame(createGame(size.rows, size.cols))
  }

  function tap(type, r, c) {
    if (full) return
    if (navigator.vibrate) navigator.vibrate(15)
    setGame((g) => drawEdge(g, type, r, c))
  }

  const trackCols = `repeat(${size.cols}, 14px 1fr) 14px`
  const trackRows = `repeat(${size.rows}, 14px 1fr) 14px`

  const cells = []
  const totalRows = 2 * size.rows + 1
  const totalCols = 2 * size.cols + 1
  for (let R = 0; R < totalRows; R++) {
    for (let C = 0; C < totalCols; C++) {
      const style = { gridRow: R + 1, gridColumn: C + 1 }
      if (R % 2 === 0 && C % 2 === 0) {
        cells.push(<span key={`d${R}-${C}`} className="dab-dot" style={style} />)
      } else if (R % 2 === 0) {
        const r = R / 2
        const c = (C - 1) / 2
        const drawn = game.hEdges[r][c]
        cells.push(
          <button
            key={`h${R}-${C}`}
            className={`dab-edge dab-edge--h ${drawn ? 'drawn' : ''}`}
            style={style}
            disabled={drawn || full}
            onClick={() => tap('h', r, c)}
          />,
        )
      } else if (C % 2 === 0) {
        const r = (R - 1) / 2
        const c = C / 2
        const drawn = game.vEdges[r][c]
        cells.push(
          <button
            key={`v${R}-${C}`}
            className={`dab-edge dab-edge--v ${drawn ? 'drawn' : ''}`}
            style={style}
            disabled={drawn || full}
            onClick={() => tap('v', r, c)}
          />,
        )
      } else {
        const r = (R - 1) / 2
        const c = (C - 1) / 2
        const owner = game.boxes[r][c]
        cells.push(
          <span
            key={`b${R}-${C}`}
            className={`dab-box ${owner === PLAYER_1 ? 'p1' : owner === PLAYER_2 ? 'p2' : ''}`}
            style={style}
          >
            {owner ? (owner === PLAYER_1 ? '1' : '2') : ''}
          </span>,
        )
      }
    }
  }

  return (
    <div className="dab">
      <header className="dab-header">
        <Link to="/games" className="dab-back">
          ← Games
        </Link>
        <h1 className="dab-title">Dots and Boxes</h1>
      </header>

      <div className="dab-panel">
        <div className="dab-themes">
          {SIZES.map((s) => (
            <button
              key={s.key}
              className={`dab-chip ${sizeKey === s.key ? 'active' : ''}`}
              onClick={() => changeSize(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className={`dab-status ${full ? 'is-over' : ''}`}>
          {full
            ? result.winner
              ? `Player ${result.winner} wins!`
              : "It's a tie"
            : `Player ${game.turn}'s turn`}
        </div>

        <div
          className="dab-board"
          style={{ gridTemplateColumns: trackCols, gridTemplateRows: trackRows }}
        >
          {cells}
        </div>

        <div className="dab-scoreboard">
          <span className="p1">
            Player 1 <strong>{game.scores[PLAYER_1]}</strong>
          </span>
          <span className="p2">
            Player 2 <strong>{game.scores[PLAYER_2]}</strong>
          </span>
        </div>

        <div className="dab-actions">
          <button className="dab-btn primary" onClick={newGame}>
            New game
          </button>
        </div>
      </div>
    </div>
  )
}
