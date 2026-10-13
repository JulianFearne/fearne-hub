// src/pages/games/ludo/LudoLocal.jsx
// The two offline modes, one device, everyone watching the same board:
//
//   computer  you (blue) against 1-3 computer players (engine.chooseToken)
//   pass      2-4 people taking turns on one phone
//
// No hidden information in Ludo, so no handoff screens.

import { useCallback, useEffect, useState } from 'react'
import { COLOR_NAMES, applyMove, applyRoll, chooseToken, createGame, rollDice } from './engine'
import LudoTable from './LudoTable'

const COMPUTER_ROLL_MS = 700
const COMPUTER_MOVE_MS = 650

function seatsFor(mode, count) {
  if (mode === 'computer') return Array.from({ length: count + 1 }, (_, i) => (i === 0 ? 'human' : 'cpu'))
  return Array.from({ length: count }, () => 'human')
}

export default function LudoLocal({ mode }) {
  const vsComputer = mode === 'computer'
  const counts = vsComputer ? [1, 2, 3] : [2, 3, 4]
  const [count, setCount] = useState(vsComputer ? 1 : 2)
  const [seats, setSeats] = useState(() => seatsFor(mode, vsComputer ? 1 : 2))
  const [state, setState] = useState(() => createGame(seats.length))
  const [animating, setAnimating] = useState(false)

  const names = state.colors.map((color, i) => (vsComputer ? (i === 0 ? 'You' : `${COLOR_NAMES[color]} bot`) : COLOR_NAMES[color]))
  const isHumanTurn = seats[state.turn] === 'human'
  const started = state.seq > 0

  function restart(nextCount = count) {
    if (started && state.winner == null && !window.confirm('Start a new game? This one will be lost.')) return
    const nextSeats = seatsFor(mode, nextCount)
    setCount(nextCount)
    setSeats(nextSeats)
    setState(createGame(nextSeats.length))
  }

  const roll = useCallback(() => {
    setState((s) => applyRoll(s, rollDice()))
    if (navigator.vibrate) navigator.vibrate(15)
  }, [])

  const pick = useCallback((token) => {
    setState((s) => {
      const next = applyMove(s, token)
      if (next !== s && next.lastEvent.captured.length && navigator.vibrate) navigator.vibrate([15, 60, 15])
      return next
    })
  }, [])

  // Computer players: roll, then choose a token, waiting for each move to
  // finish sliding round the board first.
  useEffect(() => {
    if (state.winner != null || isHumanTurn || animating) return undefined
    const timer = setTimeout(
      () => {
        setState((s) => {
          if (s.winner != null || seats[s.turn] !== 'cpu') return s
          if (s.roll == null) return applyRoll(s, rollDice())
          return applyMove(s, chooseToken(s))
        })
      },
      state.roll == null ? COMPUTER_ROLL_MS : COMPUTER_MOVE_MS,
    )
    return () => clearTimeout(timer)
  }, [state, isHumanTurn, animating, seats])

  return (
    <div className="ludo-panel">
      <div className="ludo-chips" role="group" aria-label={vsComputer ? 'Computer players' : 'Players'}>
        {counts.map((n) => (
          <button key={n} className={`ludo-chip ${count === n ? 'active' : ''}`} onClick={() => restart(n)}>
            {vsComputer ? `${n} ${n === 1 ? 'opponent' : 'opponents'}` : `${n} players`}
          </button>
        ))}
      </div>

      <LudoTable
        state={state}
        names={names}
        canAct={isHumanTurn}
        onRoll={roll}
        onPick={pick}
        onAnimating={setAnimating}
        actions={
          <button className={`ludo-btn ${state.winner != null ? 'primary' : 'ghost'}`} onClick={() => restart()}>
            {state.winner != null ? 'Play again' : 'New game'}
          </button>
        }
      />
    </div>
  )
}
