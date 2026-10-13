// src/pages/games/snakes-and-ladders/SnakesAndLadders.jsx
// One route, three modes: against the computer, pass-and-play on one
// device, or online with 2-4 players. Classic UK rule: you need the exact
// number to reach square 100, an overshoot just wastes the turn. An invite
// link (/games/snakes-and-ladders?code=ABCD) skips the picker and joins the
// online game, as does coming back to an online game this device was in.

import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SnlLocal from './SnlLocal'
import SnlOnline, { storedSessionId } from './SnlOnline'
import './snakes-and-ladders.css'

const MODES = [
  { key: 'computer', emoji: '🤖', title: 'Play the computer', sub: 'Solo against 1-3 computer players · works offline' },
  { key: 'pass', emoji: '📱', title: 'Pass and play', sub: '2-4 players, one device · works offline' },
  { key: 'online', emoji: '🌐', title: 'Play online', sub: '2-4 players on their own devices · share a link or code' },
]

export default function SnakesAndLadders() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialCode, setInitialCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [mode, setMode] = useState(() => (initialCode || storedSessionId() ? 'online' : null))

  const clearCode = useCallback(() => {
    setInitialCode('')
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="snl">
      <header className="snl-header">
        <Link to="/games" className="snl-back">
          ← Games
        </Link>
        <h1 className="snl-title">Snakes and Ladders</h1>
        {mode && (
          <button className="snl-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <div className="snl-modepick">
          {MODES.map((m) => (
            <button key={m.key} className="snl-modecard" onClick={() => setMode(m.key)}>
              <span className="snl-modecard-emoji">{m.emoji}</span>
              <span className="snl-modecard-title">{m.title}</span>
              <span className="snl-modecard-sub">{m.sub}</span>
            </button>
          ))}
        </div>
      )}

      {(mode === 'computer' || mode === 'pass') && <SnlLocal key={mode} mode={mode} />}
      {mode === 'online' && <SnlOnline initialCode={initialCode} onCodeUsed={clearCode} />}
    </div>
  )
}
