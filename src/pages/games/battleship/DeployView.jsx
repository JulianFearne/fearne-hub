// src/pages/games/battleship/DeployView.jsx
// Fleet setup: shows your randomly placed fleet, lets you re-roll it until
// you like it, then commits.

import Board from './Board'
import FleetRoster from './FleetRoster'

export default function DeployView({ title, ships, onShuffle, onReady, readyLabel = 'Ready', busy = false }) {
  return (
    <div className="bsh-deploy">
      <p className="bsh-status">{title}</p>
      <Board label="Your fleet" ships={ships} size="lg" />
      <FleetRoster title="Your fleet" ships={ships} />
      <div className="bsh-actions">
        <button className="bsh-btn" onClick={onShuffle} disabled={busy}>
          🔀 Shuffle
        </button>
        <button className="bsh-btn primary" onClick={onReady} disabled={busy}>
          {readyLabel}
        </button>
      </div>
    </div>
  )
}
