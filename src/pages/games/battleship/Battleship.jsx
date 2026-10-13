// src/pages/games/battleship/Battleship.jsx
// One route, three modes: against the computer, pass-and-play on one
// phone, or online with a family member on their own device. An invite link
// (/games/battleship?code=ABCD) skips the picker and joins the online game,
// as does coming back to an online game this device was already in.

import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BattleshipLocal from './BattleshipLocal'
import BattleshipOnline, { storedSessionId } from './BattleshipOnline'
import './battleship.css'

const MODES = [
  { key: 'computer', emoji: '🤖', title: 'Play the computer', sub: 'Solo · easy, medium or hard · works offline' },
  { key: 'pass', emoji: '📱', title: 'Pass and play', sub: 'Two players, one phone · works offline' },
  { key: 'online', emoji: '🌐', title: 'Play online', sub: 'Two devices · share a link or code · needs internet' },
]

export default function Battleship() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialCode, setInitialCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [mode, setMode] = useState(() => (initialCode || storedSessionId() ? 'online' : null))

  // Drop ?code= once used so a refresh (or switching mode and back)
  // doesn't try to join again.
  const clearCode = useCallback(() => {
    setInitialCode('')
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="bsh">
      <header className="bsh-header">
        <Link to="/games" className="bsh-back">
          ← Games
        </Link>
        <h1 className="bsh-title">Battleship</h1>
        {mode && (
          <button className="bsh-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <div className="bsh-modepick">
          {MODES.map((m) => (
            <button key={m.key} className="bsh-modecard" onClick={() => setMode(m.key)}>
              <span className="bsh-modecard-emoji">{m.emoji}</span>
              <span className="bsh-modecard-title">{m.title}</span>
              <span className="bsh-modecard-sub">{m.sub}</span>
            </button>
          ))}
        </div>
      )}

      {(mode === 'computer' || mode === 'pass') && <BattleshipLocal key={mode} mode={mode} />}
      {mode === 'online' && <BattleshipOnline initialCode={initialCode} onCodeUsed={clearCode} />}
    </div>
  )
}
