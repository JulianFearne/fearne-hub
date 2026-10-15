// src/pages/games/checkers/CheckersLocal.jsx
// The two offline modes, one device:
//
//   computer  you against the computer (easy / medium / hard, see ai.js).
//             Play Red to go first or White to go second; a win goes on the
//             family high-score board for that level as the number of moves
//             you took (fewest is best).
//   pass      two people sharing the phone, Red at the bottom.
//
// "Must jump" can be switched off for little ones still learning; it's on
// by default, as in the real rules. The game in progress is kept on the
// device, so leaving the page doesn't lose it.

import { useEffect, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { RED, WHITE, SIDE_NAMES, applyMove, createGame } from './engine'
import { chooseMove } from './ai'
import CheckersTable from './CheckersTable'

const LEVELS = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
]
const COMPUTER_DELAY_MS = 450

function storageKey(mode) {
  return `ck-local-${mode}`
}

function loadSaved(mode) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(mode)))
    return saved?.state?.board?.length === 64 ? saved : null
  } catch {
    return null
  }
}

export default function CheckersLocal({ mode }) {
  const vsComputer = mode === 'computer'
  const [saved] = useState(() => loadSaved(mode))
  const [level, setLevel] = useState(saved?.level ?? 'medium')
  const [mySide, setMySide] = useState(saved?.mySide ?? RED)
  const [mustJump, setMustJump] = useState(saved?.state?.mustJump ?? true)
  const [state, setState] = useState(() => saved?.state ?? createGame({ mustJump: true }))
  const [animating, setAnimating] = useState(false)
  const [record, setRecord] = useState(null)
  const family = useHighScores('checkers', level)

  const names = vsComputer
    ? mySide === RED
      ? ['You', 'Computer']
      : ['Computer', 'You']
    : SIDE_NAMES
  const over = state.winner != null || state.draw
  const started = state.seq > 0
  const myTurn = !vsComputer || state.turn === mySide

  useEffect(() => {
    try {
      if (over) localStorage.removeItem(storageKey(mode))
      else localStorage.setItem(storageKey(mode), JSON.stringify({ state, level, mySide }))
    } catch {
      // Not kept; the game just won't survive leaving the page.
    }
  }, [state, level, mySide, mode, over])

  // The computer's move, once the last one has finished sliding.
  useEffect(() => {
    if (!vsComputer || over || state.turn === mySide || animating) return undefined
    const timer = setTimeout(() => {
      setState((s) => {
        if (s.turn === mySide || s.winner != null || s.draw) return s
        const move = chooseMove(s, level)
        return move ? applyMove(s, move) : s
      })
    }, COMPUTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [vsComputer, over, state.turn, mySide, animating, level])

  // A win against the computer goes on the board, once per game.
  useEffect(() => {
    if (!vsComputer || state.winner !== mySide) return
    family.submit(state.moves[mySide]).then(setRecord)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.winner])

  function restart(next = {}) {
    if (started && !over && !window.confirm('Start a new game? This one will be lost.')) return false
    const jump = next.mustJump ?? mustJump
    setMustJump(jump)
    if (next.mySide != null) setMySide(next.mySide)
    if (next.level) setLevel(next.level)
    setRecord(null)
    setState(createGame({ mustJump: jump }))
    return true
  }

  function play(move) {
    setState((s) => applyMove(s, move))
  }

  const iWon = vsComputer && state.winner === mySide
  let status = null
  if (over && !animating && vsComputer) {
    if (state.draw) status = "It's a draw: 40 moves each with no captures."
    else if (iWon)
      status = `You win in ${state.moves[mySide]} moves! 🎉${record?.best ? ` New personal best${record.rank ? `, number ${record.rank} in the family` : ''}.` : ''}`
    else status = 'The computer wins this time.'
  }

  return (
    <div className="ck-panel">
      {vsComputer && (
        <div className="ck-chips" role="group" aria-label="Computer level">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              className={`ck-chip ${level === l.key ? 'active' : ''}`}
              onClick={() => (level === l.key ? null : restart({ level: l.key }))}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="ck-chips" role="group" aria-label="Options">
        {vsComputer &&
          [RED, WHITE].map((side) => (
            <button
              key={side}
              className={`ck-chip ck-chip--${side === RED ? 'red' : 'white'} ${mySide === side ? 'active' : ''}`}
              onClick={() => (mySide === side ? null : restart({ mySide: side }))}
            >
              {side === RED ? 'Play Red (go first)' : 'Play White'}
            </button>
          ))}
        <button
          className={`ck-chip ${mustJump ? 'active' : ''}`}
          aria-pressed={mustJump}
          onClick={() => restart({ mustJump: !mustJump })}
        >
          Must jump: {mustJump ? 'on' : 'off'}
        </button>
      </div>

      <CheckersTable
        state={state}
        names={names}
        canAct={myTurn}
        flipped={vsComputer && mySide === WHITE}
        onMove={play}
        onAnimating={setAnimating}
        status={status}
        actions={
          over && !animating ? (
            <div className="ck-actions">
              <button className="ck-btn primary" onClick={() => restart()}>
                Play again
              </button>
            </div>
          ) : (
            <button className="ck-link" onClick={() => restart()}>
              Start a new game
            </button>
          )
        }
      />

      {vsComputer && <Leaderboard scores={family} title={`Family top 10 · Fewest moves to win · ${LEVELS.find((l) => l.key === level).label}`} />}
    </div>
  )
}
