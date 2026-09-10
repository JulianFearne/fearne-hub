// src/pages/games/battleship/Battleship.jsx
// Offline 2-player pass-and-play. No Supabase, no props: one phone, two
// fleets. Both fleets are placed randomly (see engine.placeFleet) so there's
// no manual ship-placement screen to fumble through; a handoff screen
// between turns keeps each player's board hidden from the other, same
// pass-the-phone pattern as Pictionary and Would You Rather.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SHIP_SPECS, SIZE, createShotsGrid, fireAt, placeFleet } from './engine'
import './battleship.css'

const NAMES = { a: 'Player 1', b: 'Player 2' }

function newMatch() {
  return {
    fleets: { a: placeFleet(), b: placeFleet() },
    shots: { a: createShotsGrid(), b: createShotsGrid() },
    turn: 'a',
    phase: 'handoff', // 'handoff' | 'turn' | 'result' | 'over'
    lastResult: null,
    winner: null,
  }
}

function otherSide(side) {
  return side === 'a' ? 'b' : 'a'
}

function shipsRemaining(ships) {
  return ships.filter((ship) => !ship.hits.every(Boolean)).length
}

export default function Battleship() {
  const [state, setState] = useState(newMatch)

  const opponent = otherSide(state.turn)

  function ready() {
    setState((s) => ({ ...s, phase: 'turn' }))
  }

  function fire(r, c) {
    if (state.phase !== 'turn') return
    const { ships, shotsGrid, result } = fireAt(state.fleets[opponent], state.shots[state.turn], r, c)
    if (result.alreadyFired) return
    if (navigator.vibrate) navigator.vibrate(result.hit ? [15, 60, 15] : 15)
    setState((s) => ({
      ...s,
      fleets: { ...s.fleets, [opponent]: ships },
      shots: { ...s.shots, [s.turn]: shotsGrid },
      lastResult: result,
      phase: result.allSunk ? 'over' : 'result',
      winner: result.allSunk ? s.turn : null,
    }))
  }

  function continueTurn() {
    setState((s) => ({ ...s, turn: otherSide(s.turn), phase: 'handoff', lastResult: null }))
  }

  function playAgain() {
    setState(newMatch())
  }

  const theirShipsLeft = shipsRemaining(state.fleets[opponent])

  return (
    <div className="bsh">
      <header className="bsh-header">
        <Link to="/games" className="bsh-back">
          ← Games
        </Link>
        <h1 className="bsh-title">Battleship</h1>
      </header>

      <div className="bsh-panel">
        {state.phase === 'handoff' && (
          <div className="bsh-handoff">
            <p className="bsh-handoff-title">Pass the phone to {NAMES[state.turn]}</p>
            <p className="bsh-hint">Make sure {NAMES[opponent]} isn't looking, then tap ready.</p>
            <button className="bsh-btn primary" onClick={ready}>
              I'm ready
            </button>
          </div>
        )}

        {(state.phase === 'turn' || state.phase === 'result') && (
          <>
            <div className="bsh-fleetbar">
              <span>
                {NAMES[state.turn]}'s fleet <strong>{shipsRemaining(state.fleets[state.turn])}</strong>/{SHIP_SPECS.length}
              </span>
              <span>
                {NAMES[opponent]}'s fleet <strong>{theirShipsLeft}</strong>/{SHIP_SPECS.length}
              </span>
            </div>

            <p className="bsh-status">
              {state.phase === 'result'
                ? state.lastResult.sunkShip
                  ? `You sank their ${state.lastResult.sunkShip.name}!`
                  : state.lastResult.hit
                    ? 'Hit!'
                    : 'Miss'
                : `${NAMES[state.turn]}'s turn, fire at ${NAMES[opponent]}'s waters`}
            </p>

            <div className="bsh-board">
              {Array.from({ length: SIZE }, (_, r) =>
                Array.from({ length: SIZE }, (_, c) => {
                  const mark = state.shots[state.turn][r][c]
                  return (
                    <button
                      key={`${r}-${c}`}
                      className={`bsh-cell ${mark ?? ''}`}
                      disabled={mark != null || state.phase === 'result'}
                      onClick={() => fire(r, c)}
                    >
                      {mark === 'hit' ? '✕' : mark === 'miss' ? '•' : ''}
                    </button>
                  )
                }),
              )}
            </div>

            {state.phase === 'result' && (
              <button className="bsh-btn primary" onClick={continueTurn}>
                Continue
              </button>
            )}
          </>
        )}

        {state.phase === 'over' && (
          <div className="bsh-over">
            <p className="bsh-over-title">{NAMES[state.winner]} wins! 🎉</p>
            <p className="bsh-hint">Sank the whole fleet.</p>
            <button className="bsh-btn primary" onClick={playAgain}>
              Play again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
