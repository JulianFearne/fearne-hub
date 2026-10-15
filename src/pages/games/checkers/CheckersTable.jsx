// src/pages/games/checkers/CheckersTable.jsx
// The play screen every mode shares: the two players, the board, a status
// line and the mode's buttons. Tap one of your pieces (the ones that can
// move glow), then tap where it goes; a multi-jump is tapped one landing at
// a time. The last move is played out hop by hop before the next one.
//
//   names       [red name, white name]
//   canAct      true when the person holding this device plays the side
//               whose turn it is
//   flipped     board turned round (White at the bottom)
//   onMove      (move) => void
//   onAnimating (bool) => void, so the computer waits for a move to finish
//   status      optional line that replaces the default one

import { useEffect, useMemo, useRef, useState } from 'react'
import CheckersBoard from './CheckersBoard'
import { RED, legalMoves, pieceCounts } from './engine'

const HOP_MS = 260

function piecesOf(board) {
  const out = []
  board.forEach((p, square) => {
    if (p) out.push({ ...p, square })
  })
  return out
}

// Plays the latest move out one hop at a time. Returns the pieces to draw
// and whether a move is still animating.
function useAnimatedPieces(state) {
  const [frame, setFrame] = useState(null) // pieces mid-move
  const shownSeq = useRef(state.seq)
  const prevBoard = useRef(state.board)
  const mv = state.lastMove

  useEffect(() => {
    // Only animate a single new move; a reload or a jump of several moves
    // (catching up online) just shows the board.
    if (!mv || mv.seq === shownSeq.current || mv.seq !== shownSeq.current + 1) {
      shownSeq.current = state.seq
      prevBoard.current = state.board
      return undefined
    }
    const before = prevBoard.current
    let step = 1
    let timer
    const tick = () => {
      if (step >= mv.path.length) {
        shownSeq.current = mv.seq
        prevBoard.current = state.board
        setFrame(null)
        return
      }
      const gone = new Set(mv.captures.slice(0, step))
      const pieces = piecesOf(before)
        .filter((p) => !gone.has(p.square))
        .map((p) => (p.id === mv.pieceId ? { ...p, square: mv.path[step] } : p))
      setFrame(pieces)
      step += 1
      timer = setTimeout(tick, HOP_MS)
    }
    tick()
    return () => {
      clearTimeout(timer)
      shownSeq.current = mv.seq
      prevBoard.current = state.board
      setFrame(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mv?.seq])

  return { pieces: frame ?? piecesOf(state.board), animating: frame != null }
}

export default function CheckersTable({ state, names, canAct, flipped = false, onMove, onAnimating, status, actions }) {
  const { pieces, animating } = useAnimatedPieces(state)
  const [prefix, setPrefix] = useState([])

  useEffect(() => setPrefix([]), [state.seq])
  useEffect(() => onAnimating?.(animating), [animating, onAnimating])

  const over = state.winner != null || state.draw
  const moves = useMemo(() => (canAct && !over ? legalMoves(state) : []), [state, canAct, over])
  const live = !animating && moves.length > 0
  const movable = useMemo(() => new Set(live ? moves.map((m) => m.path[0]) : []), [moves, live])
  const mustJump = state.mustJump && moves.some((m) => m.captures.length)

  // With only one piece able to move, it's picked for you.
  const chosen = prefix.length ? prefix : movable.size === 1 ? [...movable] : []
  const candidates = chosen.length ? moves.filter((m) => chosen.every((s, i) => m.path[i] === s)) : []
  const targets = new Set(candidates.filter((m) => m.path.length > chosen.length).map((m) => m.path[chosen.length]))

  function onSquare(s) {
    if (!live) return
    if (movable.has(s) && chosen.length <= 1) {
      setPrefix(chosen[0] === s && prefix.length ? [] : [s])
      return
    }
    if (targets.has(s)) {
      const next = [...chosen, s]
      const matching = candidates.filter((m) => m.path[chosen.length] === s)
      const done = matching.find((m) => m.path.length === next.length)
      if (done && matching.length === 1) {
        setPrefix([])
        onMove(done)
        if (navigator.vibrate) navigator.vibrate(done.captures.length ? [15, 50, 15] : 12)
      } else {
        setPrefix(next)
      }
      return
    }
    // A tap anywhere else lets go of the piece (but not half way through a jump).
    if (chosen.length <= 1) setPrefix([])
  }

  const counts = pieceCounts(state.board)
  let line = status
  if (!line) {
    if (state.draw && !animating) line = "It's a draw: 40 moves each with no captures."
    else if (state.winner != null && !animating) line = `${names[state.winner]} wins! 🎉`
    else if (animating) line = `${names[state.lastMove.side]} is moving…`
    else if (canAct) {
      const who = names[state.turn] === 'You' ? 'Your turn' : `${names[state.turn]}'s turn`
      line = mustJump ? `${who}. You must jump!` : chosen.length ? `${who}. Tap where to go.` : `${who}. Tap a glowing piece.`
    } else line = `${names[state.turn]} is thinking…`
  }

  // The player at the bottom of the board is listed first.
  const order = flipped ? [1, 0] : [0, 1]

  return (
    <div className="ck-table">
      <div className="ck-players">
        {order.map((side) => (
          <span key={side} className={`ck-player-chip ${state.turn === side && !over ? 'active' : ''}`}>
            <span className={`ck-dot ck-dot--${side === RED ? 'red' : 'white'}`} />
            {names[side]}
            <span className="ck-count">{counts[side]} left</span>
          </span>
        ))}
      </div>

      <div className="ck-board-wrap">
        <CheckersBoard
          pieces={pieces}
          flipped={flipped}
          movable={movable}
          selected={chosen[chosen.length - 1] ?? null}
          trail={chosen.slice(0, -1)}
          targets={live ? targets : new Set()}
          last={state.lastMove && !animating ? { from: state.lastMove.path[0], to: state.lastMove.path.at(-1) } : null}
          onSquare={onSquare}
        />
      </div>

      <p className={`ck-status ${over && !animating ? 'is-over' : ''}`} aria-live="polite">
        {line}
      </p>

      {actions}
    </div>
  )
}
