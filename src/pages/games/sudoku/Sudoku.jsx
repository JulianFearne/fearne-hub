// src/pages/games/sudoku/Sudoku.jsx
// Offline single-player. No Supabase, no props. Difficulty tiers via
// generatePuzzle() in engine.js — pure logic, no dependency.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { findConflicts, generatePuzzle, isSolved } from './engine'
import './sudoku.css'

const DIFFICULTIES = ['easy', 'medium', 'hard']

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function newPuzzle(difficulty) {
  const { puzzle, solution, given } = generatePuzzle(difficulty)
  return { grid: puzzle.slice(), solution, given }
}

export default function Sudoku() {
  const [difficulty, setDifficulty] = useState('medium')
  const [game, setGame] = useState(() => newPuzzle('medium'))
  const [selected, setSelected] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(true)

  const solved = useMemo(() => isSolved(game.grid, game.solution), [game])
  const conflicts = useMemo(() => findConflicts(game.grid), [game.grid])

  useEffect(() => {
    if (!running || solved) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [running, solved])

  useEffect(() => {
    if (solved) setRunning(false)
  }, [solved])

  function startGame(nextDifficulty) {
    setDifficulty(nextDifficulty)
    setGame(newPuzzle(nextDifficulty))
    setSelected(null)
    setSeconds(0)
    setRunning(true)
  }

  const setCell = useCallback(
    (pos, value) => {
      if (solved || game.given[pos]) return
      setGame((g) => {
        const grid = g.grid.slice()
        grid[pos] = value
        return { ...g, grid }
      })
    },
    [game.given, solved]
  )

  function handleKeyDown(e) {
    if (selected == null) return
    if (e.key >= '1' && e.key <= '9') {
      setCell(selected, Number(e.key))
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      setCell(selected, 0)
    }
  }

  const selRow = selected != null ? Math.floor(selected / 9) : null
  const selCol = selected != null ? selected % 9 : null
  const selVal = selected != null ? game.grid[selected] : null

  return (
    <div className="sudoku" onKeyDown={handleKeyDown} tabIndex={-1}>
      <header className="su-header">
        <Link to="/games" className="su-back">
          ← Games
        </Link>
        <h1 className="su-title">Sudoku</h1>
      </header>

      <div className="su-panel">
        <div className="su-toolbar">
          <div className="su-difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                className={`su-chip ${difficulty === d ? 'active' : ''}`}
                onClick={() => startGame(d)}
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div className="su-timer">{formatTime(seconds)}</div>
        </div>

        <div className={`su-grid ${solved ? 'is-solved' : ''}`}>
          {game.grid.map((val, pos) => {
            const r = Math.floor(pos / 9)
            const c = pos % 9
            const given = game.given[pos]
            const isSelected = selected === pos
            const inSelLine = selected != null && (r === selRow || c === selCol)
            const sameValue = selVal && val === selVal
            const hasConflict = conflicts.has(pos)
            return (
              <button
                key={pos}
                className={[
                  'su-cell',
                  given ? 'given' : 'entry',
                  isSelected ? 'selected' : '',
                  !isSelected && inSelLine ? 'in-line' : '',
                  !isSelected && sameValue ? 'same-value' : '',
                  hasConflict ? 'conflict' : '',
                  c % 3 === 0 ? 'box-left' : '',
                  r % 3 === 0 ? 'box-top' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSelected(pos)}
              >
                {val || ''}
              </button>
            )
          })}
        </div>

        <div className="su-numpad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} className="su-num" onClick={() => selected != null && setCell(selected, n)}>
              {n}
            </button>
          ))}
          <button className="su-num su-erase" onClick={() => selected != null && setCell(selected, 0)}>
            ⌫
          </button>
        </div>

        {solved && (
          <div className="su-solved-banner">
            Solved in {formatTime(seconds)} 🎉
          </div>
        )}

        <div className="su-actions">
          <button className="su-btn primary" onClick={() => startGame(difficulty)}>
            New puzzle
          </button>
        </div>
      </div>
    </div>
  )
}
