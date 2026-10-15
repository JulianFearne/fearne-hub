// src/pages/games/checkers/Checkers.jsx
// One route, three modes: against the computer, two players on one device,
// or online against someone on their own phone. An invite link
// (/games/checkers?code=ABCD) skips the picker and joins the online game,
// as does coming back to an online game this device was already in.

import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CheckersLocal from './CheckersLocal'
import CheckersOnline, { storedSessionId } from './CheckersOnline'
import './checkers.css'

const MODES = [
  { key: 'computer', emoji: '🤖', title: 'Play the computer', sub: 'Easy, medium or hard · works offline' },
  { key: 'pass', emoji: '📱', title: 'Two players, one device', sub: 'Take turns on the same phone · works offline' },
  { key: 'online', emoji: '🌐', title: 'Play online', sub: 'Against someone on their own phone · share a link or code' },
]

export default function Checkers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialCode, setInitialCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [mode, setMode] = useState(() => (initialCode || storedSessionId() ? 'online' : null))

  const clearCode = useCallback(() => {
    setInitialCode('')
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="ck">
      <header className="ck-header">
        <Link to="/games" className="ck-back">
          ← Games
        </Link>
        <h1 className="ck-title">Checkers</h1>
        {mode && (
          <button className="ck-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <>
          <div className="ck-modepick">
            {MODES.map((m) => (
              <button key={m.key} className="ck-modecard" onClick={() => setMode(m.key)}>
                <span className="ck-modecard-emoji">{m.emoji}</span>
                <span className="ck-modecard-title">{m.title}</span>
                <span className="ck-modecard-sub">{m.sub}</span>
              </button>
            ))}
          </div>
          <details className="ck-rules">
            <summary>How to play</summary>
            <ul>
              <li>Pieces move one square diagonally forwards, on the dark squares only.</li>
              <li>Jump over an enemy piece to take it. If you can keep jumping, keep going.</li>
              <li>If you can take a piece, you must (you can switch this off when playing on one phone).</li>
              <li>Reach the far side to become a king 👑. Kings move backwards too.</li>
              <li>Take all the other side's pieces, or leave them with no move, to win.</li>
            </ul>
          </details>
        </>
      )}

      {(mode === 'computer' || mode === 'pass') && <CheckersLocal key={mode} mode={mode} />}
      {mode === 'online' && <CheckersOnline initialCode={initialCode} onCodeUsed={clearCode} />}
    </div>
  )
}
