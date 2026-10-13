// src/pages/games/go-fish/GoFishComputer.jsx
// Offline Go Fish against 1-3 computer players. Uses the same engine as the
// online game: a random deck seed plus a local list of "ask" events, with
// hands, the pond, turns and books all derived by engine.deriveState. The
// computer players pick their asks with ai.js.

import { useEffect, useMemo, useState } from 'react'
import { chooseAsk } from './ai'
import { deriveState } from './engine'
import GoFishTable from './GoFishTable'
import './go-fish.css'

const ME = 'you'
const COMPUTER_NAMES = ['Captain Cod', 'Shelly', 'Finn']
const COMPUTER_DELAY_MS = 1200

function newGame(opponents) {
  const players = [
    { user_id: ME, display_name: 'You', seat: 0 },
    ...COMPUTER_NAMES.slice(0, opponents).map((name, i) => ({ user_id: `cpu${i + 1}`, display_name: name, seat: i + 1 })),
  ]
  return { players, seed: Math.floor(Math.random() * 2 ** 31), events: [] }
}

export default function GoFishComputer() {
  const [opponents, setOpponents] = useState(1)
  const [difficulty, setDifficulty] = useState('clever')
  const [game, setGame] = useState(() => newGame(1))
  const [selectedRank, setSelectedRank] = useState(null)

  const derived = useMemo(() => deriveState(game.players, game.seed, game.events), [game])
  const playerIds = game.players.map((p) => p.user_id)
  const started = game.events.length > 0

  function addAsk(actorId, targetId, rank) {
    setGame((g) => ({
      ...g,
      events: [...g.events, { type: 'ask', actor_id: actorId, target_id: targetId, rank, event_number: g.events.length + 1 }],
    }))
  }

  function ask(targetId) {
    if (derived.currentTurnUserId !== ME || selectedRank == null) return
    addAsk(ME, targetId, selectedRank)
    setSelectedRank(null)
    if (navigator.vibrate) navigator.vibrate(15)
  }

  // Computer turns, one ask at a time with a pause so you can follow along.
  useEffect(() => {
    const turn = derived.currentTurnUserId
    if (derived.isOver || !turn || turn === ME) return undefined
    const timer = setTimeout(() => {
      const { targetId, rank } = chooseAsk(derived, turn, playerIds, difficulty)
      addAsk(turn, targetId, rank)
    }, COMPUTER_DELAY_MS)
    return () => clearTimeout(timer)
  }, [derived, difficulty])

  function restart(count = opponents) {
    if (started && !derived.isOver && !window.confirm('Start a new game? This one will be lost.')) return
    setOpponents(count)
    setGame(newGame(count))
    setSelectedRank(null)
  }

  const turnName = game.players.find((p) => p.user_id === derived.currentTurnUserId)?.display_name

  return (
    <div className="go-fish">
      <div className="gf2-panel">
        <div className="gf2-options">
          <div className="gf2-chips" role="group" aria-label="Computer players">
            {[1, 2, 3].map((n) => (
              <button key={n} className={`gf2-chip ${opponents === n ? 'active' : ''}`} onClick={() => restart(n)}>
                {n} {n === 1 ? 'opponent' : 'opponents'}
              </button>
            ))}
          </div>
          <div className="gf2-chips" role="group" aria-label="Difficulty">
            {[
              ['easy', 'Easy'],
              ['clever', 'Clever'],
            ].map(([key, label]) => (
              <button key={key} className={`gf2-chip ${difficulty === key ? 'active' : ''}`} onClick={() => setDifficulty(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <GoFishTable
          players={game.players}
          meId={ME}
          derived={derived}
          selectedRank={selectedRank}
          onSelectRank={setSelectedRank}
          onAsk={ask}
          waitingText={`${turnName} is thinking…`}
          onPlayAgain={() => restart()}
          onLeave={() => restart()}
          leaveLabel="New game"
        />
      </div>
    </div>
  )
}
