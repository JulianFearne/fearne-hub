// src/pages/games/hangman/Gallows.jsx
// Presentational only. Hand-rolled SVG, no image assets or libraries — draws
// one more stroke of the figure per wrong guess (0..MAX_WRONG).

import { MAX_WRONG } from './engine'

export default function Gallows({ wrong }) {
  const show = (n) => wrong >= n

  return (
    <svg viewBox="0 0 140 160" className="hm-gallows" role="img" aria-label={`${wrong} of ${MAX_WRONG} wrong guesses`}>
      {/* frame — always visible */}
      <line x1="10" y1="150" x2="90" y2="150" className="hm-line" />
      <line x1="30" y1="150" x2="30" y2="15" className="hm-line" />
      <line x1="28" y1="15" x2="100" y2="15" className="hm-line" />
      <line x1="100" y1="15" x2="100" y2="32" className="hm-line" />

      {show(1) && <circle cx="100" cy="45" r="13" className="hm-part" />}
      {show(2) && <line x1="100" y1="58" x2="100" y2="95" className="hm-part" />}
      {show(3) && <line x1="100" y1="66" x2="82" y2="82" className="hm-part" />}
      {show(4) && <line x1="100" y1="66" x2="118" y2="82" className="hm-part" />}
      {show(5) && <line x1="100" y1="95" x2="85" y2="120" className="hm-part" />}
      {show(6) && <line x1="100" y1="95" x2="115" y2="120" className="hm-part" />}
    </svg>
  )
}
