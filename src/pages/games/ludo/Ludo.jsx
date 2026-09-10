// src/pages/games/ludo/Ludo.jsx
// Offline pass-and-play for 2-4 players, everyone watching one shared
// board (no hidden info, so no handoff screens needed, unlike Battleship).
//
// The board is a simplified square ring rather than the traditional
// cross-shaped Ludo board: a 14x14 grid using only its 52 border cells for
// the shared track, with a small info panel in the middle. This keeps the
// geometry simple and reliable while keeping the real rules: roll a 6 to
// leave the yard, race round the ring, capture opponents off safe squares,
// climb your own home stretch, get all 4 tokens home to win.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FINISH,
  RING_LENGTH,
  TOKENS_PER_PLAYER,
  createGame,
  getMovableTokens,
  isOnRing,
  moveToken,
  passWithNoMove,
  ringCell,
  rollDice,
  startOffset,
} from './engine'
import './ludo.css'

const PLAYER_COUNTS = [2, 3, 4]
const COLORS = ['p1', 'p2', 'p3', 'p4']
const NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4']

// 14x14 grid, walking only the border cells clockwise from the top-left
// corner: exactly 52 cells, matching RING_LENGTH.
function buildRingLayout() {
  const N = 14
  const cells = []
  for (let c = 0; c < N; c++) cells.push([0, c])
  for (let r = 1; r < N; r++) cells.push([r, N - 1])
  for (let c = N - 2; c >= 0; c--) cells.push([N - 1, c])
  for (let r = N - 2; r >= 1; r--) cells.push([r, 0])
  return cells
}
const RING_LAYOUT = buildRingLayout()

function tokenLabel(pos) {
  if (pos === -1) return 'in the yard'
  if (pos === FINISH) return 'home'
  if (pos >= RING_LENGTH - 1) return `home stretch (${pos - (RING_LENGTH - 1) + 1}/5)`
  return `square ${pos + 1}`
}

function describeEvent(event) {
  if (!event) return null
  const who = NAMES[event.player]
  const parts = [`${who} moved token ${event.tokenIndex + 1} to ${tokenLabel(event.to)}.`]
  if (event.captured.length > 0) {
    parts.push(event.captured.map((c) => `Sent ${NAMES[c.player]}'s token ${c.token + 1} back to the yard!`).join(' '))
  }
  if (event.justFinished) parts.push(`${who}'s token is home!`)
  if (event.forfeited) parts.push('Three sixes in a row, turn forfeited.')
  return parts.join(' ')
}

export default function Ludo() {
  const [numPlayers, setNumPlayers] = useState(2)
  const [game, setGame] = useState(() => createGame(2))
  const [roll, setRoll] = useState(null)
  const [movable, setMovable] = useState([])
  const [lastEvent, setLastEvent] = useState(null)
  const [rolling, setRolling] = useState(false)

  function newGame(count) {
    setNumPlayers(count)
    setGame(createGame(count))
    setRoll(null)
    setMovable([])
    setLastEvent(null)
  }

  function doRoll() {
    if (game.winner != null || rolling || roll != null) return
    setRolling(true)
    setTimeout(() => {
      const value = rollDice()
      const options = getMovableTokens(game, value)
      setRoll(value)
      setMovable(options)
      setRolling(false)
      if (options.length === 0) setLastEvent(null)
    }, 250)
  }

  function pickToken(tokenIndex) {
    if (roll == null || !movable.includes(tokenIndex)) return
    const { state, event } = moveToken(game, tokenIndex, roll)
    setGame(state)
    setLastEvent(event)
    setRoll(null)
    setMovable([])
    if (navigator.vibrate) navigator.vibrate(event.captured.length > 0 ? [15, 60, 15] : 15)
  }

  function continueNoMove() {
    setGame((g) => passWithNoMove(g, roll))
    setLastEvent(null)
    setRoll(null)
    setMovable([])
  }

  // Build a map from global ring cell -> tokens sitting there, for rendering.
  const tokensByCell = new Map()
  for (let p = 0; p < numPlayers; p++) {
    for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
      const pos = game.positions[p][t]
      if (isOnRing(pos)) {
        const cell = ringCell(p, pos)
        if (!tokensByCell.has(cell)) tokensByCell.set(cell, [])
        tokensByCell.get(cell).push({ player: p, token: t })
      }
    }
  }
  const startCells = new Set(Array.from({ length: 4 }, (_, p) => startOffset(p)))

  const waitingForChoice = roll != null && movable.length > 0
  const noMoveAvailable = roll != null && movable.length === 0

  return (
    <div className="ludo">
      <header className="ludo-header">
        <Link to="/games" className="ludo-back">
          ← Games
        </Link>
        <h1 className="ludo-title">Ludo</h1>
      </header>

      <div className="ludo-panel">
        <div className="ludo-themes">
          {PLAYER_COUNTS.map((count) => (
            <button
              key={count}
              className={`ludo-chip ${numPlayers === count ? 'active' : ''}`}
              onClick={() => newGame(count)}
            >
              {count} players
            </button>
          ))}
        </div>

        <div className="ludo-players">
          {Array.from({ length: numPlayers }, (_, i) => (
            <span key={i} className={`ludo-player-chip ${COLORS[i]} ${game.turn === i && game.winner == null ? 'active' : ''}`}>
              <span className={`ludo-token-dot ${COLORS[i]}`} /> {NAMES[i]}
            </span>
          ))}
        </div>

        <div className="ludo-board">
          {RING_LAYOUT.map(([r, c], cellIndex) => {
            const tokensHere = tokensByCell.get(cellIndex) || []
            const safe = startCells.has(cellIndex)
            const ownerColor = safe ? COLORS[cellIndex / (RING_LENGTH / 4)] : null
            return (
              <div
                key={cellIndex}
                className={`ludo-cell ${safe ? `safe ${ownerColor}` : ''}`}
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
              >
                {tokensHere.length > 0 && (
                  <span className="ludo-cell-tokens">
                    {tokensHere.map((t, i) => (
                      <span key={i} className={`ludo-token-dot ${COLORS[t.player]}`} />
                    ))}
                  </span>
                )}
              </div>
            )
          })}
          <div className="ludo-center">
            {game.winner != null ? (
              <span className="ludo-center-winner">{NAMES[game.winner]} wins! 🎉</span>
            ) : (
              <div className="ludo-center-tallies">
                {Array.from({ length: numPlayers }, (_, i) => (
                  <span key={i} className={`ludo-tally ${COLORS[i]}`}>
                    {game.positions[i].filter((p) => p === FINISH).length}/4
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={`ludo-status ${game.winner != null ? 'is-over' : ''}`}>
          {game.winner != null
            ? `${NAMES[game.winner]} wins!`
            : lastEvent
              ? describeEvent(lastEvent)
              : noMoveAvailable
                ? `${NAMES[game.turn]} rolled ${roll}, no legal move.`
                : waitingForChoice
                  ? `${NAMES[game.turn]} rolled ${roll}, pick a token to move.`
                  : `${NAMES[game.turn]}'s turn`}
        </div>

        {waitingForChoice && (
          <div className="ludo-tokens-row">
            {Array.from({ length: TOKENS_PER_PLAYER }, (_, t) => (
              <button
                key={t}
                className={`ludo-token-btn ${COLORS[game.turn]}`}
                disabled={!movable.includes(t)}
                onClick={() => pickToken(t)}
              >
                Token {t + 1}
                <span className="ludo-token-btn-sub">{tokenLabel(game.positions[game.turn][t])}</span>
              </button>
            ))}
          </div>
        )}

        <div className="ludo-actions">
          {game.winner != null ? (
            <button className="ludo-btn primary" onClick={() => newGame(numPlayers)}>
              Play again
            </button>
          ) : noMoveAvailable ? (
            <button className="ludo-btn primary" onClick={continueNoMove}>
              Continue
            </button>
          ) : (
            <button className="ludo-btn primary" onClick={doRoll} disabled={rolling || waitingForChoice}>
              {rolling ? 'Rolling…' : 'Roll dice'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
