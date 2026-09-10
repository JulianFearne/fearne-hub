// src/pages/games/tic-tac-toe/TicTacToe.jsx
// Offline. Two modes in one screen: pass-and-play for two players, or vs the
// computer with three difficulties. No Supabase, no props: works with the
// service worker once the app shell is cached.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyMove, createBoard, getWinner, isBoardFull, otherMark, X, O } from './engine'
import { chooseMove } from './ai'
import './tic-tac-toe.css'

const DIFFICULTIES = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Unbeatable' },
]

export default function TicTacToe() {
  const [mode, setMode] = useState('2p') // '2p' | 'ai'
  const [difficulty, setDifficulty] = useState('medium')
  const [startMark, setStartMark] = useState(X) // alternates so both sides open
  const [board, setBoard] = useState(createBoard())
  const [turn, setTurn] = useState(X)
  const [aiThinking, setAiThinking] = useState(false)
  const [scores, setScores] = useState({ [X]: 0, [O]: 0, draws: 0 })

  const scoredRef = useRef(false) // ensure a finished game is tallied once
  const aiTimer = useRef(null)

  const { winner, line } = getWinner(board)
  const full = isBoardFull(board)
  const over = Boolean(winner) || full
  const human = X
  const ai = O

  const newGame = useCallback((nextStartMark) => {
    setBoard(createBoard())
    setTurn(nextStartMark)
    setStartMark(nextStartMark)
    scoredRef.current = false
  }, [])

  function changeMode(nextMode) {
    setMode(nextMode)
    newGame(X)
  }

  function changeDifficulty(key) {
    setDifficulty(key)
    newGame(X)
  }

  function playAgain() {
    newGame(otherMark(startMark))
  }

  const place = useCallback(
    (index) => {
      if (over || board[index]) return
      if (mode === 'ai' && turn !== human) return
      if (navigator.vibrate) navigator.vibrate(15)
      setBoard((b) => applyMove(b, index, turn))
      setTurn((t) => otherMark(t))
    },
    [board, over, turn, mode, human],
  )

  // Tally the running score once per finished game.
  useEffect(() => {
    if (!over || scoredRef.current) return
    scoredRef.current = true
    setScores((s) =>
      winner ? { ...s, [winner]: s[winner] + 1 } : { ...s, draws: s.draws + 1 },
    )
  }, [over, winner])

  // AI move, driven by whose turn it is.
  useEffect(() => {
    if (mode !== 'ai' || over || turn !== ai) return
    setAiThinking(true)
    aiTimer.current = setTimeout(() => {
      const index = chooseMove(board, ai, human, difficulty)
      if (index != null) {
        if (navigator.vibrate) navigator.vibrate(15)
        setBoard((b) => applyMove(b, index, ai))
        setTurn(human)
      }
      setAiThinking(false)
    }, 350)
    return () => clearTimeout(aiTimer.current)
  }, [mode, over, turn, board, difficulty, ai, human])

  const statusText = winner
    ? mode === 'ai'
      ? winner === human
        ? 'You win! 🎉'
        : 'Computer wins'
      : `${winner} wins! 🎉`
    : full
      ? "It's a draw"
      : mode === 'ai' && turn === ai
        ? aiThinking
          ? 'Computer is thinking…'
          : "Computer's turn"
        : mode === 'ai'
          ? 'Your turn'
          : `${turn}'s turn`

  return (
    <div className="ttt">
      <header className="ttt-header">
        <Link to="/games" className="ttt-back">
          ← Games
        </Link>
        <h1 className="ttt-title">Tic Tac Toe</h1>
      </header>

      <div className="ttt-panel">
        <div className="ttt-themes">
          <button
            className={`ttt-chip ${mode === '2p' ? 'active' : ''}`}
            onClick={() => changeMode('2p')}
          >
            2 players
          </button>
          <button
            className={`ttt-chip ${mode === 'ai' ? 'active' : ''}`}
            onClick={() => changeMode('ai')}
          >
            vs Computer
          </button>
        </div>

        {mode === 'ai' && (
          <div className="ttt-themes">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.key}
                className={`ttt-chip ${difficulty === d.key ? 'active' : ''}`}
                onClick={() => changeDifficulty(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <div className={`ttt-status ${over ? 'is-over' : ''}`}>{statusText}</div>

        <div className="ttt-board">
          {board.map((cell, i) => (
            <button
              key={i}
              className={`ttt-cell ${cell ? cell.toLowerCase() : ''} ${line?.includes(i) ? 'win' : ''}`}
              onClick={() => place(i)}
              disabled={over || Boolean(cell) || (mode === 'ai' && turn !== human)}
            >
              {cell}
            </button>
          ))}
        </div>

        <div className="ttt-scoreboard">
          <span>
            {mode === 'ai' ? 'You' : 'X'} <strong>{scores[X]}</strong>
          </span>
          <span>
            {mode === 'ai' ? 'Computer' : 'O'} <strong>{scores[O]}</strong>
          </span>
          <span>
            Draws <strong>{scores.draws}</strong>
          </span>
        </div>

        <div className="ttt-actions">
          <button className="ttt-btn primary" onClick={playAgain}>
            Play again
          </button>
        </div>
      </div>
    </div>
  )
}
