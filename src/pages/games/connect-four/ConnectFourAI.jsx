// src/pages/games/connect-four/ConnectFourAI.jsx
// Single-player vs the computer. Fully offline: state lives in React, nothing
// touches Supabase, so this works with no signal once the service worker has
// cached the app shell. A win goes on the family high-score board for the
// difficulty as the number of discs you used (fewest is best,
// lib/scores.js).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBoard,
  applyMove,
  winningLineThrough,
  isBoardFull,
  SEAT_1,
  SEAT_2,
} from './engine';
import { chooseMove } from './ai';
import Board from './Board';
import { useHighScores } from '../lib/scores';
import Leaderboard from '../lib/Leaderboard';
import './connect-four.css';

const HUMAN = SEAT_1;
const AI = SEAT_2;

export default function ConnectFourAI() {
  const [board, setBoard] = useState(createBoard());
  const [turn, setTurn] = useState(HUMAN);
  const [winner, setWinner] = useState(0);
  const [winningLine, setWinningLine] = useState(null);
  const [isDraw, setIsDraw] = useState(false);
  const [difficulty, setDifficulty] = useState('medium');
  const [aiThinking, setAiThinking] = useState(false);
  const [humanFirst, setHumanFirst] = useState(true);
  const [scores, setScores] = useState({ you: 0, ai: 0, draws: 0 });
  const [record, setRecord] = useState(null);
  const family = useHighScores('connect-four', difficulty);
  const discs = board.flat().filter((cell) => cell === HUMAN).length;

  const aiTimer = useRef(null);
  const scoredRef = useRef(false); // ensure a finished game is tallied once

  const gameOver = winner !== 0 || isDraw;

  const finishIfOver = useCallback((nextBoard, row, col, mover) => {
    const line = winningLineThrough(nextBoard, row, col);
    if (line) {
      setWinner(mover);
      setWinningLine(line);
      return true;
    }
    if (isBoardFull(nextBoard)) {
      setIsDraw(true);
      return true;
    }
    return false;
  }, []);

  const drop = useCallback(
    (col) => {
      if (gameOver || turn !== HUMAN || aiThinking) return;
      const result = applyMove(board, col, HUMAN);
      if (!result) return;
      if (navigator.vibrate) navigator.vibrate(15);
      const over = finishIfOver(result.board, result.row, col, HUMAN);
      setBoard(result.board);
      if (!over) setTurn(AI);
    },
    [board, turn, aiThinking, gameOver, finishIfOver],
  );

  // AI move, driven by whose turn it is.
  useEffect(() => {
    if (turn !== AI || gameOver) return;
    setAiThinking(true);
    aiTimer.current = setTimeout(() => {
      const col = chooseMove(board, AI, difficulty);
      if (col == null) {
        setAiThinking(false);
        return;
      }
      const result = applyMove(board, col, AI);
      if (navigator.vibrate) navigator.vibrate(15);
      const over = finishIfOver(result.board, result.row, col, AI);
      setBoard(result.board);
      setAiThinking(false);
      if (!over) setTurn(HUMAN);
    }, 450);
    return () => clearTimeout(aiTimer.current);
  }, [turn, board, difficulty, gameOver, finishIfOver]);

  // Tally the running score once per finished game.
  useEffect(() => {
    if (!gameOver || scoredRef.current) return;
    scoredRef.current = true;
    setScores((s) => ({
      you: s.you + (winner === HUMAN ? 1 : 0),
      ai: s.ai + (winner === AI ? 1 : 0),
      draws: s.draws + (isDraw ? 1 : 0),
    }));
    if (winner === HUMAN) family.submit(discs).then(setRecord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver, winner, isDraw]);

  const startGame = useCallback((startWithHuman) => {
    clearTimeout(aiTimer.current);
    scoredRef.current = false;
    setRecord(null);
    setBoard(createBoard());
    setWinner(0);
    setWinningLine(null);
    setIsDraw(false);
    setAiThinking(false);
    setTurn(startWithHuman ? HUMAN : AI);
  }, []);

  const newGame = () => startGame(humanFirst);

  const setStarter = (startWithHuman) => {
    setHumanFirst(startWithHuman);
    startGame(startWithHuman);
  };

  let status;
  if (winner === HUMAN)
    status = record?.best
      ? `You win with ${discs} discs, a new personal best! 🎉`
      : `You win with ${discs} discs! 🎉`;
  else if (winner === AI) status = 'Computer wins';
  else if (isDraw) status = "It's a draw";
  else if (turn === HUMAN) status = 'Your turn';
  else status = 'Thinking…';

  return (
    <div className="connect-four">
      <div className="c4-panel">
        <div className="c4-toolbar">
          <div className="c4-difficulty">
            {['easy', 'medium', 'hard'].map((d) => (
              <button
                key={d}
                className={`c4-chip ${difficulty === d ? 'active' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div className="c4-starter">
            <span className="c4-starter-label">Starts:</span>
            <button
              className={`c4-chip ${humanFirst ? 'active' : ''}`}
              onClick={() => setStarter(true)}
            >
              You
            </button>
            <button
              className={`c4-chip ${!humanFirst ? 'active' : ''}`}
              onClick={() => setStarter(false)}
            >
              Computer
            </button>
          </div>
        </div>

        <div className={`c4-status ${gameOver ? 'is-over' : ''}`}>{status}</div>

        <Board
          board={board}
          winningLine={winningLine}
          onColumnClick={drop}
          disabled={gameOver || turn !== HUMAN || aiThinking}
        />

        <div className="c4-scoreboard">
          <div className="c4-score">
            <span className="c4-dot p1" /> You <strong>{scores.you}</strong>
          </div>
          <div className="c4-score">
            Draws <strong>{scores.draws}</strong>
          </div>
          <div className="c4-score">
            <span className="c4-dot p2" /> Computer <strong>{scores.ai}</strong>
          </div>
        </div>

        <div className="c4-actions">
          <button className="c4-btn primary" onClick={newGame}>
            New game
          </button>
        </div>

        <Leaderboard scores={family} />
      </div>
    </div>
  );
}
