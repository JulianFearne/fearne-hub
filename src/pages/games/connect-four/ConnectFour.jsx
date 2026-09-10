// src/pages/games/connect-four/ConnectFour.jsx
// One route, two modes. Keeps integration to a single line in your router.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import ConnectFourAI from './ConnectFourAI';
import ConnectFourMultiplayer from './ConnectFourMultiplayer';
import './connect-four.css';

export default function ConnectFour() {
  const [mode, setMode] = useState(null); // null | 'ai' | 'online'

  return (
    <div className="connect-four-page">
      <header className="c4-header">
        <Link to="/games" className="c4-back">
          ← Games
        </Link>
        <h1 className="c4-title">Connect Four</h1>
        {mode && (
          <button className="c4-back as-button" onClick={() => setMode(null)}>
            Change mode
          </button>
        )}
      </header>

      {!mode && (
        <div className="connect-four">
          <div className="c4-modepick">
            <button className="c4-modecard" onClick={() => setMode('ai')}>
              <span className="c4-modecard-emoji">🤖</span>
              <span className="c4-modecard-title">Play the computer</span>
              <span className="c4-modecard-sub">Solo · works offline</span>
            </button>
            <button className="c4-modecard" onClick={() => setMode('online')}>
              <span className="c4-modecard-emoji">👥</span>
              <span className="c4-modecard-title">Play a family member</span>
              <span className="c4-modecard-sub">Two devices · needs internet</span>
            </button>
          </div>
        </div>
      )}

      {mode === 'ai' && <ConnectFourAI />}
      {mode === 'online' && <ConnectFourMultiplayer />}
    </div>
  );
}
