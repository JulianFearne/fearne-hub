// src/pages/games/lib/Leaderboard.jsx
// The family high-score table for one board. Give it what useHighScores()
// returns. Shows each person's best (top 10) with the signed-in person
// highlighted, and their own place underneath if they're further down.

import { boardInfo } from './scoreBoards'
import './leaderboard.css'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard({ scores, title, className = '' }) {
  const { game, board, rows, myBest, myRank, userId, status } = scores
  const info = boardInfo(game, board)
  const heading = title ?? `Family top 10 · ${info.label}`

  return (
    <div className={`lb ${className}`}>
      <p className="lb-title">🏆 {heading}</p>
      {status === 'loading' && rows.length === 0 && <p className="lb-note">Loading scores…</p>}
      {status === 'offline' && rows.length === 0 && (
        <p className="lb-note">No signal. Your scores are kept and sent when you're back online.</p>
      )}
      {status === 'ready' && rows.length === 0 && <p className="lb-note">No scores yet. Be the first!</p>}
      {rows.length > 0 && (
        <ol className="lb-list">
          {rows.map((row, i) => (
            <li key={row.user_id} className={row.user_id === userId ? 'is-me' : ''}>
              <span className="lb-rank">{MEDALS[i] ?? i + 1}</span>
              <span className="lb-name">{row.display_name}</span>
              <span className="lb-score">{info.format(row.score)}</span>
            </li>
          ))}
        </ol>
      )}
      {myRank > rows.length && myBest != null && (
        <p className="lb-note">
          You're number {myRank} with {info.format(myBest)}
        </p>
      )}
    </div>
  )
}
