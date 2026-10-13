// src/pages/games/HighScores.jsx
// Every family high-score board in one place (/games/scores). Pick a game,
// then one of its boards; the table is the same one each game shows on its
// own start and results screens. The boards are listed in
// lib/scoreBoards.js. ?game=snake opens straight on a game.

import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SCORE_GAMES } from './lib/scoreBoards'
import { useHighScores } from './lib/scores'
import Leaderboard from './lib/Leaderboard'
import './lib/leaderboard.css'

const GAME_KEYS = Object.keys(SCORE_GAMES)

function Board({ game, board }) {
  const scores = useHighScores(game, board)
  return <Leaderboard scores={scores} title={`Family top 10 · ${SCORE_GAMES[game].boards[board].label}`} />
}

export default function HighScores() {
  const [params, setParams] = useSearchParams()
  const game = SCORE_GAMES[params.get('game')] ? params.get('game') : GAME_KEYS[0]
  const boards = Object.keys(SCORE_GAMES[game].boards)
  const [boardByGame, setBoardByGame] = useState({})
  const board = boardByGame[game] ?? boards[0]

  return (
    <div className="lb-page">
      <p className="lb-page-sub">The best score each person has got, game by game.</p>
      <div className="lb-page-games" role="group" aria-label="Game">
        {GAME_KEYS.map((key) => (
          <button
            key={key}
            className={`lb-page-chip ${key === game ? 'active' : ''}`}
            onClick={() => setParams({ game: key }, { replace: true })}
          >
            {SCORE_GAMES[key].title}
          </button>
        ))}
      </div>
      {boards.length > 1 && (
        <div className="lb-page-boards" role="group" aria-label="Board">
          {boards.map((key) => (
            <button
              key={key}
              className={`lb-page-chip small ${key === board ? 'active' : ''}`}
              onClick={() => setBoardByGame((b) => ({ ...b, [game]: key }))}
            >
              {SCORE_GAMES[game].boards[key].label}
            </button>
          ))}
        </div>
      )}
      <div className="lb-page-table">
        <Board key={`${game}-${board}`} game={game} board={board} />
      </div>
      <Link className="lb-page-play" to={SCORE_GAMES[game].to}>
        Play {SCORE_GAMES[game].title} →
      </Link>
    </div>
  )
}
