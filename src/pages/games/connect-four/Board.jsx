// src/pages/games/connect-four/Board.jsx
// Presentational only. Rendered column-major so a click maps straight to a
// column. Both the vs-AI and multiplayer components reuse this.

import { COLS, ROWS, SEAT_1, SEAT_2 } from './engine';

export default function Board({
  board,
  winningLine = null,
  onColumnClick = () => {},
  disabled = false,
}) {
  const winSet = new Set((winningLine || []).map(([r, c]) => `${r}-${c}`));

  return (
    <div className={`c4-board ${disabled ? 'is-disabled' : ''}`}>
      {Array.from({ length: COLS }).map((_, c) => (
        <div
          key={c}
          className="c4-column"
          onClick={() => !disabled && onColumnClick(c)}
        >
          {Array.from({ length: ROWS }).map((_, r) => {
            const v = board[r][c];
            const cls = v === SEAT_1 ? 'p1' : v === SEAT_2 ? 'p2' : 'empty';
            const win = winSet.has(`${r}-${c}`) ? 'win' : '';
            return (
              <div key={r} className={`c4-cell ${cls} ${win}`}>
                <span className="c4-disc" />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
