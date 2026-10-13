// src/pages/games/go-fish/GoFish.jsx
// One route, two modes: against the computer (offline) or online with 2-4
// family members on their own devices.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import GoFishComputer from './GoFishComputer'
import GoFishOnline from './GoFishOnline'
import './go-fish.css'

export default function GoFish() {
  const [mode, setMode] = useState(null) // null | 'computer' | 'online'

  return (
    <div className="go-fish">
      <header className="gf2-header">
        <Link to="/games" className="gf2-back">
          ← Games
        </Link>
        <h1 className="gf2-title">Go Fish</h1>
        {mode && (
          <button className="gf2-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <div className="gf2-modepick">
          <button className="gf2-modecard" onClick={() => setMode('computer')}>
            <span className="gf2-modecard-emoji">🤖</span>
            <span className="gf2-modecard-title">Play the computer</span>
            <span className="gf2-modecard-sub">Solo against 1-3 computer players · works offline</span>
          </button>
          <button className="gf2-modecard" onClick={() => setMode('online')}>
            <span className="gf2-modecard-emoji">👥</span>
            <span className="gf2-modecard-title">Play online</span>
            <span className="gf2-modecard-sub">2-4 players on their own devices · needs internet</span>
          </button>
        </div>
      )}

      {mode === 'computer' && <GoFishComputer />}
      {mode === 'online' && <GoFishOnline />}
    </div>
  )
}
