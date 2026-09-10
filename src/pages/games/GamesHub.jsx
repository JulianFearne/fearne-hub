// src/pages/games/GamesHub.jsx
// Landing page for the games section. New games slot in by adding an entry to
// GAMES below and a route. `live: false` renders a "coming soon" card so the
// roadmap is visible without needing a route yet.

import { Link } from 'react-router-dom';
import Card, { CardTitle, CardMeta } from '../../components/ds/Card.jsx';
import Icon from '../../components/ds/Icon.jsx';
import Badge from '../../components/ds/Badge.jsx';

const GAMES = [
  {
    key: 'connect-four',
    title: 'Connect Four',
    blurb: 'Drop discs, get four in a row. Beat the computer or a family member.',
    icon: 'grid-3x3',
    to: '/games/connect-four',
    tags: ['1 player, offline', '2 players, online'],
    live: true,
  },
  {
    key: 'sudoku',
    title: 'Sudoku',
    blurb: 'Number logic with easy, medium and hard puzzles.',
    icon: 'hash',
    to: '/games/sudoku',
    tags: ['1 player, offline'],
    live: true,
  },
  {
    key: 'hangman',
    title: 'Hangman',
    blurb: 'Guess the word one letter at a time. Themed word lists.',
    icon: 'type',
    to: '/games/hangman',
    tags: ['1 player, offline'],
    live: true,
  },
  {
    key: 'freecell',
    title: 'Freecell',
    blurb: 'The thinking-person’s solitaire. Almost always solvable.',
    icon: 'layers',
    to: '/games/freecell',
    tags: ['1 player, offline'],
    live: true,
  },
  {
    key: 'categories',
    title: 'Categories',
    blurb: 'Animal, place, thing and more — race the alphabet together.',
    icon: 'users',
    to: '/games/animal-place-thing',
    tags: ['Multiplayer, online'],
    live: true,
  },
  {
    key: 'go-fish',
    title: 'Go Fish',
    blurb: 'Collect sets by asking other players for cards.',
    icon: 'fish',
    to: '/games/go-fish',
    tags: ['Multiplayer, online'],
    live: true,
  },
  {
    key: 'would-you-rather',
    title: 'Would You Rather',
    blurb: 'Pass the phone round and argue about which is worse.',
    icon: 'users',
    to: '/games/would-you-rather',
    tags: ['Pass and play, offline'],
    live: true,
  },
  {
    key: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    blurb: 'Noughts and crosses. Play a sibling or take on the computer.',
    icon: 'grid-2x2',
    to: '/games/tic-tac-toe',
    tags: ['2 players, offline', '1 player, offline'],
    live: true,
  },
  {
    key: 'pictionary',
    title: 'Pictionary',
    blurb: 'Word generator for drawing or acting games, with categories and a timer.',
    icon: 'pencil',
    to: '/games/pictionary',
    tags: ['Pass and play, offline'],
    live: true,
  },
  {
    key: 'dots-and-boxes',
    title: 'Dots and Boxes',
    blurb: 'Claim a line, complete a box. Most boxes at the end wins.',
    icon: 'dot',
    to: '/games/dots-and-boxes',
    tags: ['2 players, offline'],
    live: true,
  },
  {
    key: 'snakes-and-ladders',
    title: 'Snakes and Ladders',
    blurb: 'Race to the top of the board. First up the last ladder wins.',
    icon: 'dice-5',
    to: '/games/snakes-and-ladders',
    tags: ['2-4 players, offline'],
    live: true,
  },
  {
    key: 'battleship',
    title: 'Battleship',
    blurb: 'Call your shots and sink the other player’s fleet.',
    icon: 'anchor',
    to: '/games/battleship',
    tags: ['2 players, offline'],
    live: true,
  },
  {
    key: 'ludo',
    title: 'Ludo',
    blurb: 'Roll a six to leave home, race round the board, send rivals back.',
    icon: 'dice-6',
    to: '/games/ludo',
    tags: ['2-4 players, offline'],
    live: true,
  },
  {
    key: 'bingo',
    title: 'Bingo',
    blurb: 'One phone calls the numbers, everyone else marks their card.',
    icon: 'ticket',
    to: '/games/bingo',
    tags: ['1-6 cards, offline'],
    live: true,
  },
];

function GameCard({ game }) {
  return (
    <Card as={game.live ? Link : 'div'} to={game.live ? game.to : undefined} tile>
      <span className="fh-recipes__mark">
        <Icon name={game.icon} size={18} />
      </span>
      <div>
        <CardTitle>{game.title}</CardTitle>
        <CardMeta>{game.blurb}</CardMeta>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
          {game.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
          {!game.live && <Badge tone="warning">Coming soon</Badge>}
        </div>
      </div>
    </Card>
  );
}

export default function GamesHub() {
  return (
    <div>
      <p className="fh-home__sub" style={{ marginBottom: 'var(--sp-7)' }}>
        Pick something to play. The offline ones work in the car with no signal.
      </p>

      <div className="fh-recipes__grid">
        {GAMES.map((g) => (
          <GameCard key={g.key} game={g} />
        ))}
      </div>
    </div>
  );
}
