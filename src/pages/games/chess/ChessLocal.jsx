// src/pages/games/chess/ChessLocal.jsx
// The two offline modes, one device:
//
//   computer  you against the computer (easy / medium / hard, see ai.js),
//             playing White or Black. Undo takes back your last move and
//             the computer's reply, so little ones can try again. A win goes
//             on the family high-score board for that level as the number
//             of moves it took (fewest is best).
//   pass      two people sharing the phone. The board can turn round after
//             each move so whoever's playing has their pieces at the bottom.
//
// The game in progress is kept on the device, so leaving the page doesn't
// lose it. The computer thinks in a Web Worker (aiWorker.js).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import { LEVELS, chooseMove } from './ai'
import { replay, resultOf } from './engine'
import ChessTable from './ChessTable'

const MIN_THINK_MS = 450

function storageKey(mode) {
  return `cs-local-${mode}`
}

function loadSaved(mode) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(mode)))
    return Array.isArray(saved?.moves) ? saved : null
  } catch {
    return null
  }
}

// Asks the worker for a move; falls back to thinking on the main thread
// if workers aren't available.
function useComputer() {
  const workerRef = useRef(null)
  const waiting = useRef(new Map())
  useEffect(() => {
    try {
      const worker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (e) => {
        const resolve = waiting.current.get(e.data.id)
        waiting.current.delete(e.data.id)
        resolve?.(e.data.move)
      }
      workerRef.current = worker
    } catch {
      workerRef.current = null
    }
    return () => workerRef.current?.terminate()
  }, [])
  const nextId = useRef(0)
  return (fen, level) =>
    new Promise((resolve) => {
      if (!workerRef.current) {
        setTimeout(() => resolve(chooseMove(fen, level)), 30)
        return
      }
      nextId.current += 1
      waiting.current.set(nextId.current, resolve)
      workerRef.current.postMessage({ id: nextId.current, fen, level })
    })
}

export default function ChessLocal({ mode }) {
  const vsComputer = mode === 'computer'
  const [saved] = useState(() => loadSaved(mode))
  const [moves, setMoves] = useState(saved?.moves ?? [])
  const [level, setLevel] = useState(saved?.level ?? 'easy')
  const [mySide, setMySide] = useState(saved?.mySide ?? 'w')
  const [turnBoard, setTurnBoard] = useState(saved?.turnBoard ?? false)
  const [record, setRecord] = useState(null)
  const family = useHighScores('chess', level)
  const think = useComputer()
  const thinkingFor = useRef(-1) // the move count the computer is answering

  const chess = useMemo(() => replay(moves), [moves])
  const result = useMemo(() => resultOf(chess), [chess])
  const turn = chess.turn()
  const names = vsComputer ? (mySide === 'w' ? { w: 'You', b: 'Computer' } : { w: 'Computer', b: 'You' }) : { w: 'White', b: 'Black' }
  const myTurn = !vsComputer || turn === mySide

  useEffect(() => {
    try {
      if (result.over) localStorage.removeItem(storageKey(mode))
      else localStorage.setItem(storageKey(mode), JSON.stringify({ moves, level, mySide, turnBoard }))
    } catch {
      // Not kept; the game just won't survive leaving the page.
    }
  }, [moves, level, mySide, turnBoard, mode, result.over])

  // The computer's reply.
  useEffect(() => {
    if (!vsComputer || result.over || turn === mySide) return
    const count = moves.length
    thinkingFor.current = count
    const started = Date.now()
    think(chess.fen(), level).then((uci) => {
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - started))
      setTimeout(() => {
        // Ignore an answer to a position that's since been undone or restarted.
        if (!uci || thinkingFor.current !== count) return
        setMoves((m) => (m.length === count ? [...m, uci] : m))
      }, wait)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, vsComputer, mySide, level, result.over])

  // A win against the computer goes on the board, once per game.
  useEffect(() => {
    if (!vsComputer || result.winner !== mySide) return
    const mine = moves.filter((_, i) => (i % 2 === 0) === (mySide === 'w')).length
    family.submit(mine).then((r) => setRecord({ ...r, moves: mine }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.winner])

  function restart(next = {}) {
    if (moves.length && !result.over && !window.confirm('Start a new game? This one will be lost.')) return
    thinkingFor.current = -1
    if (next.level) setLevel(next.level)
    if (next.mySide) setMySide(next.mySide)
    setRecord(null)
    setMoves([])
  }

  function undo() {
    thinkingFor.current = -1
    setMoves((m) => {
      if (!vsComputer) return m.slice(0, -1)
      // Back to the last position where it was your move.
      // (White moves when the count is even, Black when it's odd.)
      let n = m.length - 1
      while (n > 0 && (n % 2 === 0) !== (mySide === 'w')) n--
      return m.slice(0, mySide === 'b' ? Math.max(1, n) : n)
    })
  }

  const flipped = vsComputer ? mySide === 'b' : turnBoard && turn === 'b'
  let status = null
  if (vsComputer && result.over && result.winner === mySide) {
    status = `Checkmate! You win in ${record?.moves ?? '…'} moves. 🎉${record?.best ? ` New personal best${record.rank ? `, number ${record.rank} in the family` : ''}.` : ''}`
  } else if (vsComputer && result.over && result.winner) status = 'Checkmate. The computer wins this time.'

  const canUndo = vsComputer ? moves.length >= (mySide === 'w' ? 1 : 2) : moves.length > 0

  return (
    <div className="cs-panel">
      {vsComputer && (
        <div className="cs-chips" role="group" aria-label="Computer level">
          {Object.entries(LEVELS).map(([key, l]) => (
            <button key={key} className={`cs-chip ${level === key ? 'active' : ''}`} onClick={() => (level === key ? null : restart({ level: key }))}>
              {l.label}
            </button>
          ))}
        </div>
      )}
      <div className="cs-chips" role="group" aria-label="Options">
        {vsComputer ? (
          ['w', 'b'].map((side) => (
            <button
              key={side}
              className={`cs-chip cs-chip--${side} ${mySide === side ? 'active' : ''}`}
              onClick={() => (mySide === side ? null : restart({ mySide: side }))}
            >
              {side === 'w' ? 'Play White (go first)' : 'Play Black'}
            </button>
          ))
        ) : (
          <button className={`cs-chip ${turnBoard ? 'active' : ''}`} aria-pressed={turnBoard} onClick={() => setTurnBoard((t) => !t)}>
            Turn the board each move: {turnBoard ? 'on' : 'off'}
          </button>
        )}
      </div>

      <ChessTable
        moves={moves}
        names={names}
        canMove={myTurn && !result.over}
        flipped={flipped}
        onMove={(uci) => setMoves((m) => [...m, uci])}
        status={status}
        actions={
          <div className="cs-actions">
            {result.over ? (
              <button className="cs-btn primary" onClick={() => restart()}>
                Play again
              </button>
            ) : (
              <>
                <button className="cs-btn ghost" onClick={undo} disabled={!canUndo}>
                  ↶ Undo
                </button>
                <button className="cs-link" onClick={() => restart()}>
                  Start a new game
                </button>
              </>
            )}
          </div>
        }
      />

      {vsComputer && <Leaderboard scores={family} title={`Family top 10 · Fewest moves to win · ${LEVELS[level].label}`} />}
    </div>
  )
}
