// src/pages/games/ludo/Ludo.jsx
// One route, three modes: against the computer, pass-and-play on one
// device, or online with 2-4 players. An invite link (/games/ludo?code=ABCD)
// skips the picker and joins the online game, as does coming back to an
// online game this device was already in.

import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import LudoLocal from './LudoLocal'
import LudoOnline, { storedSessionId } from './LudoOnline'
import './ludo.css'

const MODES = [
  { key: 'computer', emoji: '🤖', title: 'Play the computer', sub: 'Solo against 1-3 computer players · works offline' },
  { key: 'pass', emoji: '📱', title: 'Pass and play', sub: '2-4 players, one device · works offline' },
  { key: 'online', emoji: '🌐', title: 'Play online', sub: '2-4 players on their own devices · share a link or code' },
]

export default function Ludo() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialCode, setInitialCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [mode, setMode] = useState(() => (initialCode || storedSessionId() ? 'online' : null))

  const clearCode = useCallback(() => {
    setInitialCode('')
    setSearchParams({}, { replace: true })
  }, [setSearchParams])

  return (
    <div className="ludo">
      <header className="ludo-header">
        <Link to="/games" className="ludo-back">
          ← Games
        </Link>
        <h1 className="ludo-title">Ludo</h1>
        {mode && (
          <button className="ludo-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <div className="ludo-modepick">
          {MODES.map((m) => (
            <button key={m.key} className="ludo-modecard" onClick={() => setMode(m.key)}>
              <span className="ludo-modecard-emoji">{m.emoji}</span>
              <span className="ludo-modecard-title">{m.title}</span>
              <span className="ludo-modecard-sub">{m.sub}</span>
            </button>
          ))}
        </div>
      )}

      {(mode === 'computer' || mode === 'pass') && <LudoLocal key={mode} mode={mode} />}
      {mode === 'online' && <LudoOnline initialCode={initialCode} onCodeUsed={clearCode} />}
    </div>
  )
}
