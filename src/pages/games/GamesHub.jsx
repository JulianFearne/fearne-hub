// src/pages/games/GamesHub.jsx
// Landing page for the games section. New games slot in by adding an entry to
// GAMES below and a route. `live: false` renders a "coming soon" card so the
// roadmap is visible without needing a route yet.

import { Link } from 'react-router-dom';
import './games-hub.css';

const GAMES = [
  {
    key: 'connect-four',
    title: 'Connect Four',
    blurb: 'Drop discs, get four in a row. Beat the computer or a family member.',
    emoji: '🔴',
    to: '/games/connect-four',
    tags: ['1 player · offline', '2 players · online'],
    live: true,
  },
  {
    key: 'sudoku',
    title: 'Sudoku',
    blurb: 'Number logic with easy, medium and hard puzzles.',
    emoji: '🔢',
    to: '/games/sudoku',
    tags: ['1 player · offline'],
    live: true,
  },
  {
    key: 'hangman',
    title: 'Hangman',
    blurb: 'Guess the word one letter at a time. Themed word lists.',
    emoji: '🔤',
    to: '/games/hangman',
    tags: ['1 player · offline'],
    live: true,
  },
  {
    key: 'freecell',
    title: 'Freecell',
    blurb: 'The thinking-person’s solitaire. Almost always solvable.',
    emoji: '🃏',
    to: '/games/freecell',
    tags: ['1 player · offline'],
    live: true,
  },
  {
    key: 'categories',
    title: 'Categories',
    blurb: 'Animal, place, thing and more — race the alphabet together.',
    emoji: '🅰️',
    to: '/games/animal-place-thing',
    tags: ['Multiplayer · online'],
    live: true,
  },
  {
    key: 'go-fish',
    title: 'Go Fish',
    blurb: 'Collect sets by asking other players for cards.',
    emoji: '🐟',
    to: '/games/go-fish',
    tags: ['Multiplayer · online'],
    live: true,
  },
];

function GameCard({ game }) {
  const inner = (
    <>
      <span className="game-card-emoji">{game.emoji}</span>
      <span className="game-card-title">{game.title}</span>
      <span className="game-card-blurb">{game.blurb}</span>
      <span className="game-card-tags">
        {game.tags.map((t) => (
          <span key={t} className="game-tag">
            {t}
          </span>
        ))}
      </span>
      {!game.live && <span className="game-card-soon">Coming soon</span>}
    </>
  );

  if (game.live && game.to) {
    return (
      <Link to={game.to} className="game-card">
        {inner}
      </Link>
    );
  }
  return <div className="game-card is-disabled">{inner}</div>;
}

export default function GamesHub() {
  return (
    <div className="games-hub">
      <header className="games-hub-header">
        <h1 className="games-hub-title">Games</h1>
        <p className="games-hub-sub">
          Pick something to play. The offline ones work in the car with no signal.
        </p>
      </header>

      <div className="games-grid">
        {GAMES.map((g) => (
          <GameCard key={g.key} game={g} />
        ))}
      </div>
    </div>
  );
}
