// src/pages/games/battleship/BattleshipLocal.jsx
// The two offline modes, both on one device with no Supabase:
//
//   computer  you against the computer (easy / medium / hard, see ai.js)
//   pass      two players passing the phone. A handoff screen between
//             turns keeps each player's fleet hidden from the other, same
//             pass-the-phone pattern as Pictionary.
//
// Side 'a' is always you / Player 1 and fires first.

import { useEffect, useState } from 'react'
import { chooseShot } from './ai'
import { createShotsGrid, describeShot, fireAt, placeFleet } from './engine'
import BattleView from './BattleView'
import DeployView from './DeployView'

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
]

const COMPUTER_DELAY_MS = 900

function namesFor(mode) {
  return mode === 'computer' ? { a: 'You', b: 'Computer' } : { a: 'Player 1', b: 'Player 2' }
}

function otherSide(side) {
  return side === 'a' ? 'b' : 'a'
}

function newMatch(mode) {
  return {
    fleets: { a: placeFleet(), b: placeFleet() },
    shots: { a: createShotsGrid(), b: createShotsGrid() },
    turn: 'a',
    // computer: 'deploy' -> 'turn' <-> 'enemy' -> 'over'
    // pass:     'deploy-handoff' -> 'deploy' (x2) -> 'handoff' -> 'turn' -> 'result' -> ... -> 'over'
    phase: mode === 'computer' ? 'deploy' : 'deploy-handoff',
    deploySide: 'a',
    last: { a: null, b: null }, // each side's most recent shot: { r, c, result }
    winner: null,
  }
}

export default function BattleshipLocal({ mode }) {
  const [state, setState] = useState(() => newMatch(mode))
  const [difficulty, setDifficulty] = useState('medium')
  const names = namesFor(mode)
  const vsComputer = mode === 'computer'

  // Viewing side: who is holding the phone right now.
  const me = vsComputer ? 'a' : state.phase.startsWith('deploy') ? state.deploySide : state.turn
  const them = otherSide(me)

  function shuffle() {
    setState((s) => ({ ...s, fleets: { ...s.fleets, [s.deploySide]: placeFleet() } }))
  }

  function deployed() {
    setState((s) => {
      if (vsComputer) return { ...s, phase: 'turn' }
      if (s.deploySide === 'a') return { ...s, deploySide: 'b', phase: 'deploy-handoff' }
      return { ...s, phase: 'handoff' }
    })
  }

  function applyShot(s, side, r, c) {
    const target = otherSide(side)
    const { ships, shotsGrid, result } = fireAt(s.fleets[target], s.shots[side], r, c)
    if (result.alreadyFired) return null
    return {
      next: {
        ...s,
        fleets: { ...s.fleets, [target]: ships },
        shots: { ...s.shots, [side]: shotsGrid },
        last: { ...s.last, [side]: { r, c, result } },
        winner: result.allSunk ? side : null,
      },
      result,
    }
  }

  function fire(r, c) {
    if (state.phase !== 'turn') return
    const out = applyShot(state, state.turn, r, c)
    if (!out) return
    if (navigator.vibrate) navigator.vibrate(out.result.hit ? [15, 60, 15] : 15)
    const phase = out.result.allSunk ? 'over' : vsComputer ? 'enemy' : 'result'
    setState({ ...out.next, phase })
  }

  // The computer's turn: think for a moment, then fire back.
  useEffect(() => {
    if (!vsComputer || state.phase !== 'enemy') return undefined
    const timer = setTimeout(() => {
      setState((s) => {
        if (s.phase !== 'enemy') return s
        const [r, c] = chooseShot(s.shots.b, s.fleets.a, difficulty)
        const out = applyShot(s, 'b', r, c)
        if (!out) return { ...s, phase: 'turn' }
        if (out.result.hit && navigator.vibrate) navigator.vibrate([15, 60, 15])
        return { ...out.next, phase: out.result.allSunk ? 'over' : 'turn' }
      })
    }, COMPUTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [vsComputer, state.phase, difficulty])

  function continueTurn() {
    setState((s) => ({ ...s, turn: otherSide(s.turn), phase: 'handoff' }))
  }

  function ready() {
    setState((s) => ({ ...s, phase: s.phase === 'deploy-handoff' ? 'deploy' : 'turn' }))
  }

  function playAgain() {
    setState(newMatch(mode))
  }

  // ---------- handoff screens (pass and play only) ----------

  if (state.phase === 'deploy-handoff' || state.phase === 'handoff') {
    const deploying = state.phase === 'deploy-handoff'
    return (
      <div className="bsh-panel">
        <div className="bsh-handoff">
          <span className="bsh-handoff-emoji">📱</span>
          <p className="bsh-handoff-title">Pass the phone to {names[me]}</p>
          <p className="bsh-hint">
            {deploying
              ? `Time to position your fleet. Make sure ${names[them]} isn't looking.`
              : `Make sure ${names[them]} isn't looking, then tap ready.`}
          </p>
          <button className="bsh-btn primary" onClick={ready}>
            I'm ready
          </button>
        </div>
      </div>
    )
  }

  // ---------- deploy ----------

  if (state.phase === 'deploy') {
    return (
      <div className="bsh-panel">
        {vsComputer && (
          <div className="bsh-chips" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`bsh-chip ${difficulty === d.key ? 'active' : ''}`}
                onClick={() => setDifficulty(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}
        <DeployView
          title={vsComputer ? 'Position your fleet' : `${names[me]}, position your fleet`}
          ships={state.fleets[me]}
          onShuffle={shuffle}
          onReady={deployed}
          readyLabel={vsComputer ? 'Start battle' : 'Done, hide my fleet'}
        />
      </div>
    )
  }

  // ---------- battle / over ----------

  const over = state.phase === 'over'
  const mine = state.last[me]
  const theirs = state.last[them]

  let status
  let tone = ''
  if (over) {
    const iWon = state.winner === me
    status = vsComputer ? (iWon ? 'You win! 🎉' : 'The computer sank your whole fleet') : `${names[state.winner]} wins! 🎉`
    tone = iWon || !vsComputer ? 'win' : 'lose'
  } else if (state.phase === 'enemy') {
    status = mine ? `${describeShot('You', 'them', mine.r, mine.c, mine.result)} Computer is aiming…` : 'Computer is aiming…'
    tone = mine?.result.hit ? 'hit' : ''
  } else if (state.phase === 'result') {
    status = describeShot('You', 'them', mine.r, mine.c, mine.result)
    tone = mine.result.hit ? 'hit' : 'miss'
  } else if (theirs) {
    status = `${describeShot(names[them], 'you', theirs.r, theirs.c, theirs.result)}. Your shot.`
    tone = theirs.result.hit ? 'incoming' : ''
  } else {
    status = vsComputer ? 'Your shot. Tap their waters to fire.' : `${names[me]}, tap ${names[them]}'s waters to fire.`
  }

  return (
    <div className="bsh-panel">
      <p className={`bsh-status ${tone}`} aria-live="polite">
        {status}
      </p>

      <BattleView
        enemyName={vsComputer ? 'Computer' : names[them]}
        enemyShips={state.fleets[them]}
        myShots={state.shots[me]}
        myShips={state.fleets[me]}
        theirShots={state.shots[them]}
        onFire={fire}
        canFire={state.phase === 'turn'}
        lastMine={mine && [mine.r, mine.c]}
        lastTheirs={theirs && [theirs.r, theirs.c]}
        reveal={over}
      />

      {state.phase === 'result' && (
        <button className="bsh-btn primary" onClick={continueTurn}>
          Continue
        </button>
      )}
      {over && (
        <button className="bsh-btn primary" onClick={playAgain}>
          Play again
        </button>
      )}
    </div>
  )
}
