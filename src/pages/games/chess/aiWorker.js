// src/pages/games/chess/aiWorker.js
// Runs the computer's thinking (ai.js) off the main thread, so the board
// stays smooth while it searches. Message in: { id, fen, level }; message
// out: { id, move } with the move in UCI form.

import { chooseMove } from './ai'

self.onmessage = (e) => {
  const { id, fen, level } = e.data
  self.postMessage({ id, move: chooseMove(fen, level) })
}
