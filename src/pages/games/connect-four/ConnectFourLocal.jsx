// src/pages/games/connect-four/ConnectFourLocal.jsx
// Two players, one device: take turns tapping the board. Fully offline like
// ConnectFourAI. Nothing is hidden in Connect Four, so there's no handoff
// screen, just whose turn it is. Whoever lost the last game starts the next.

import { useState } from 'react';
import { applyMove, createBoard, isBoardFull, winningLineThrough, SEAT_1, SEAT_2 } from './engine';
import Board from './Board';
import './connect-four.css';

const NAMES = { [SEAT_1]: 'Red', [SEAT_2]: 'Gold' };

function newGame(starter) {
  return { board: createBoard(), turn: starter, starter, winner: 0, winningLine: null, isDraw: false };
}

export default function ConnectFourLocal() {
  const [game, setGame] = useState(() => newGame(SEAT_1));
  const [scores, setScores] = useState({ [SEAT_1]: 0, [SEAT_2]: 0, draws: 0 });

  const gameOver = game.winner !== 0 || game.isDraw;

  function drop(col) {
    if (gameOver) return;
    const result = applyMove(game.board, col, game.turn);
    if (!result) return;
    if (navigator.vibrate) navigator.vibrate(15);
    const line = winningLineThrough(result.board, result.row, col);
    const isDraw = !line && isBoardFull(result.board);
    setGame((g) => ({
      ...g,
      board: result.board,
      winner: line ? g.turn : 0,
      winningLine: line,
      isDraw,
      turn: g.turn === SEAT_1 ? SEAT_2 : SEAT_1,
    }));
    if (line) setScores((s) => ({ ...s, [game.turn]: s[game.turn] + 1 }));
    else if (isDraw) setScores((s) => ({ ...s, draws: s.draws + 1 }));
  }

  function playAgain() {
    // The loser (or, after a draw, whoever didn't start) goes first.
    const next = game.winner ? (game.winner === SEAT_1 ? SEAT_2 : SEAT_1) : game.starter === SEAT_1 ? SEAT_2 : SEAT_1;
    setGame(newGame(next));
  }

  let status;
  if (game.winner) status = `${NAMES[game.winner]} wins! 🎉`;
  else if (game.isDraw) status = "It's a draw";
  else status = `${NAMES[game.turn]}'s turn`;

  return (
    <div className="connect-four">
      <div className="c4-panel">
        <div className={`c4-status ${gameOver ? 'is-over' : ''}`}>
          {!gameOver && <span className={`c4-dot ${game.turn === SEAT_1 ? 'p1' : 'p2'}`} />} {status}
        </div>

        <Board board={game.board} winningLine={game.winningLine} onColumnClick={drop} disabled={gameOver} />

        <div className="c4-scoreboard">
          <div className="c4-score">
            <span className="c4-dot p1" /> Red <strong>{scores[SEAT_1]}</strong>
          </div>
          <div className="c4-score">
            Draws <strong>{scores.draws}</strong>
          </div>
          <div className="c4-score">
            <span className="c4-dot p2" /> Gold <strong>{scores[SEAT_2]}</strong>
          </div>
        </div>

        <div className="c4-actions">
          <button className="c4-btn primary" onClick={playAgain}>
            {gameOver ? 'Play again' : 'Restart'}
          </button>
        </div>
      </div>
    </div>
  );
}
