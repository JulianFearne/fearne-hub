// src/pages/games/snakes-and-ladders/SnlLocal.jsx
// The two offline modes, one device, everyone watching the same board:
//
//   computer  you against 1-3 computer players, who roll for themselves
//   pass      2-4 people taking turns on one phone

import { useCallback, useEffect, useState } from 'react'
import { applyRoll, createGame, rollDice } from './engine'
import SnlTable from './SnlTable'

const COMPUTER_DELAY_MS = 800
const COLOUR_NAMES = ['Red', 'Blue', 'Green', 'Yellow']

function seatsFor(mode, count) {
  if (mode === 'computer') return Array.from({ length: count + 1 }, (_, i) => (i === 0 ? 'human' : 'cpu'))
  return Array.from({ length: count }, () => 'human')
}

export default function SnlLocal({ mode }) {
  const vsComputer = mode === 'computer'
  const counts = vsComputer ? [1, 2, 3] : [2, 3, 4]
  const [count, setCount] = useState(vsComputer ? 1 : 2)
  const [seats, setSeats] = useState(() => seatsFor(mode, vsComputer ? 1 : 2))
  const [state, setState] = useState(() => createGame(seats.length))
  const [animating, setAnimating] = useState(false)

  const names = seats.map((_, i) => (vsComputer ? (i === 0 ? 'You' : `${COLOUR_NAMES[i]} bot`) : COLOUR_NAMES[i]))
  const isHumanTurn = seats[state.turn] === 'human'

  function restart(nextCount = count) {
    if (state.seq > 0 && state.winner == null && !window.confirm('Start a new game? This one will be lost.')) return
    const nextSeats = seatsFor(mode, nextCount)
    setCount(nextCount)
    setSeats(nextSeats)
    setState(createGame(nextSeats.length))
  }

  const roll = useCallback(() => {
    setState((s) => applyRoll(s, rollDice()))
    if (navigator.vibrate) navigator.vibrate(15)
  }, [])

  // Computer players roll for themselves once the last move has played out.
  useEffect(() => {
    if (state.winner != null || isHumanTurn || animating) return undefined
    const timer = setTimeout(() => {
      setState((s) => (s.winner == null && seats[s.turn] === 'cpu' ? applyRoll(s, rollDice()) : s))
    }, COMPUTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state, isHumanTurn, animating, seats])

  return (
    <div className="snl-panel">
      <div className="snl-themes" role="group" aria-label={vsComputer ? 'Computer players' : 'Players'}>
        {counts.map((n) => (
          <button key={n} className={`snl-chip ${count === n ? 'active' : ''}`} onClick={() => restart(n)}>
            {vsComputer ? `${n} ${n === 1 ? 'opponent' : 'opponents'}` : `${n} players`}
          </button>
        ))}
      </div>

      <SnlTable
        state={state}
        names={names}
        canRoll={isHumanTurn}
        onRoll={roll}
        onAnimating={setAnimating}
        actions={
          <button className={`snl-btn ${state.winner != null ? 'primary' : 'ghost'}`} onClick={() => restart()}>
            {state.winner != null ? 'Play again' : 'New game'}
          </button>
        }
      />
    </div>
  )
}
