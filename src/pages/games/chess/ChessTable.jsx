// src/pages/games/chess/ChessTable.jsx
// The play screen every mode shares: the two players with the pieces each
// has taken, the board, a status line, the moves so far, and the mode's
// buttons. Tap one of your pieces to see where it can go (dots, or rings
// round pieces it can take), then tap the square. A pawn reaching the far
// side asks what it should become.
//
//   moves      the game so far, UCI strings
//   names      { w, b }
//   canMove    true when the person holding this device plays the side to move
//   flipped    Black at the bottom
//   onMove     (uci) => void
//   status     optional line that replaces the default one

import { useEffect, useMemo, useState } from 'react'
import ChessBoard, { ART } from './ChessBoard'
import { DRAW_TEXT, captured, kingSquare, replay, resultOf, trackPieces } from './engine'

const PROMOTIONS = ['q', 'r', 'b', 'n']
const PIECE_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }

function MiniPiece({ code, size = 18 }) {
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} aria-hidden="true">
      {ART[code]}
    </svg>
  )
}

export default function ChessTable({ moves, names, canMove, flipped = false, onMove, status, actions }) {
  const chess = useMemo(() => replay(moves), [moves])
  const pieces = useMemo(() => trackPieces(chess), [chess])
  const result = useMemo(() => resultOf(chess), [chess])
  const taken = useMemo(() => captured(chess), [chess])
  const history = useMemo(() => chess.history({ verbose: true }), [chess])
  const legal = useMemo(() => (canMove && !result.over ? chess.moves({ verbose: true }) : []), [chess, canMove, result.over])
  const [selected, setSelected] = useState(null)
  const [promo, setPromo] = useState(null) // { from, to } waiting for a choice

  useEffect(() => {
    setSelected(null)
    setPromo(null)
  }, [moves.length])

  const movable = useMemo(() => new Set(legal.map((m) => m.from)), [legal])
  const targets = selected
    ? [...new Map(legal.filter((m) => m.from === selected).map((m) => [m.to, { square: m.to, capture: !!m.captured }])).values()]
    : []

  function onSquare(square) {
    if (!canMove || result.over || promo) return
    if (selected) {
      const options = legal.filter((m) => m.from === selected && m.to === square)
      if (options.length) {
        if (options[0].promotion) setPromo({ from: selected, to: square })
        else {
          onMove(selected + square)
          if (navigator.vibrate) navigator.vibrate(options[0].captured ? [15, 50, 15] : 12)
        }
        setSelected(null)
        return
      }
    }
    setSelected(movable.has(square) && square !== selected ? square : null)
  }

  const last = history.length ? history[history.length - 1] : null
  const inCheck = chess.inCheck() && !result.over
  const turnName = names[chess.turn()]
  let line = status
  if (!line) {
    if (result.reason === 'checkmate') line = `Checkmate! ${names[result.winner]} ${names[result.winner] === 'You' ? 'win' : 'wins'}. 🎉`
    else if (result.over) line = DRAW_TEXT[result.reason]
    else if (canMove) {
      const who = turnName === 'You' ? 'Your move' : `${turnName} to move`
      line = inCheck ? `${who}. You're in check!` : selected ? `${who}. Tap where it goes.` : `${who}. Tap a piece.`
    } else line = inCheck ? `${turnName} is in check, thinking…` : `${turnName} is thinking…`
  }

  // The side at the bottom of the board is listed second, nearest it.
  const order = flipped ? ['w', 'b'] : ['b', 'w']
  const lead = taken.lead

  // Moves as numbered pairs: 1. e4 e5 2. Nf3 …
  const pairs = []
  for (let i = 0; i < history.length; i += 2) pairs.push([history[i].san, history[i + 1]?.san])

  return (
    <div className="cs-table">
      {order.map((side, i) => {
        const ahead = side === 'w' ? lead : -lead
        const row = (
          <div key={side} className={`cs-player ${chess.turn() === side && !result.over ? 'active' : ''}`}>
            <span className={`cs-dot cs-dot--${side}`} />
            <span className="cs-player-name">{names[side]}</span>
            <span className="cs-taken">
              {taken.taken[side].map((t, k) => (
                <MiniPiece key={k} code={(side === 'w' ? 'b' : 'w') + t.toUpperCase()} size={16} />
              ))}
              {ahead > 0 && <span className="cs-lead">+{ahead}</span>}
            </span>
          </div>
        )
        if (i === 0) return row
        return [
          <div key="board" className="cs-board-wrap">
            <ChessBoard
              pieces={pieces}
              flipped={flipped}
              selected={selected}
              targets={targets}
              last={last ? { from: last.from, to: last.to } : null}
              check={inCheck || result.reason === 'checkmate' ? kingSquare(chess, chess.turn()) : null}
              movable={canMove && !result.over ? movable : new Set()}
              onSquare={onSquare}
            />
            {promo && (
              <div className="cs-promo" role="dialog" aria-label="Choose a piece">
                <p>Your pawn becomes a…</p>
                <div className="cs-promo-row">
                  {PROMOTIONS.map((p) => (
                    <button
                      key={p}
                      className="cs-promo-btn"
                      aria-label={PIECE_NAMES[p]}
                      onClick={() => {
                        onMove(promo.from + promo.to + p)
                        setPromo(null)
                      }}
                    >
                      <MiniPiece code={chess.turn() + p.toUpperCase()} size={44} />
                      <span>{PIECE_NAMES[p]}</span>
                    </button>
                  ))}
                </div>
                <button className="cs-link" onClick={() => setPromo(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>,
          row,
        ]
      })}

      <p className={`cs-status ${result.over ? 'is-over' : ''} ${inCheck ? 'is-check' : ''}`} aria-live="polite">
        {line}
      </p>

      {pairs.length > 0 && (
        <ol className="cs-moves" aria-label="Moves so far">
          {pairs.map(([w, b], i) => (
            <li key={i}>
              <span className="cs-move-no">{i + 1}.</span> {w} {b ?? ''}
            </li>
          ))}
        </ol>
      )}

      {actions}
    </div>
  )
}
