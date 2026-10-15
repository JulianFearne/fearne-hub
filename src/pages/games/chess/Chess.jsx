// src/pages/games/chess/Chess.jsx
// One route, three modes: against the computer, two players on one device,
// or online against someone on their own phone. An invite link
// (/games/chess?code=ABCD) skips the picker and joins the online game,
// as does coming back to an online game this device was already in.

import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ChessLocal from './ChessLocal'
import ChessOnline, { storedSessionId } from './ChessOnline'
import './chess.css'

const MODES = [
  { key: 'computer', emoji: '🤖', title: 'Play the computer', sub: 'Easy, medium or hard, with undo · works offline' },
  { key: 'pass', emoji: '📱', title: 'Two players, one device', sub: 'Take turns on the same phone · works offline' },
  { key: 'online', emoji: '🌐', title: 'Play online', sub: 'Against someone on their own phone · share a link or code' },
]

export default function Chess() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialCode, setInitialCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [mode, setMode] = useState(() => (initialCode || storedSessionId() ? 'online' : null))

  const clearCode = useCallback(() => {
    setInitialCode('')
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="cs">
      <header className="cs-header">
        <Link to="/games" className="cs-back">
          ← Games
        </Link>
        <h1 className="cs-title">Chess</h1>
        {mode && (
          <button className="cs-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <>
          <div className="cs-modepick">
            {MODES.map((m) => (
              <button key={m.key} className="cs-modecard" onClick={() => setMode(m.key)}>
                <span className="cs-modecard-emoji">{m.emoji}</span>
                <span className="cs-modecard-title">{m.title}</span>
                <span className="cs-modecard-sub">{m.sub}</span>
              </button>
            ))}
          </div>
          <details className="cs-rules">
            <summary>How to play</summary>
            <ul>
              <li>Tap one of your pieces to see where it can go, then tap the square.</li>
              <li>Pawns move forward one square (two on their first move) and take diagonally.</li>
              <li>Knights jump in an L. Bishops go diagonally, rooks straight, the queen any way. The king moves one square.</li>
              <li>Put the king in check and leave it no escape: that's checkmate, and you win.</li>
              <li>Castling, en passant and promotion all work. A pawn on the far side becomes any piece you pick.</li>
            </ul>
          </details>
        </>
      )}

      {(mode === 'computer' || mode === 'pass') && <ChessLocal key={mode} mode={mode} />}
      {mode === 'online' && <ChessOnline initialCode={initialCode} onCodeUsed={clearCode} />}
    </div>
  )
}
