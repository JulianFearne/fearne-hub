// src/pages/games/bingo/Bingo.jsx
// Offline. Each phone picks a job:
//
//   Caller  draws the numbers for everyone. Can hold cards too, which are
//           marked automatically as numbers are drawn.
//   Player  just your card(s). Numbers are called out loud from the caller's
//           phone, so you tap them yourself; any number can be marked, and
//           tapping again undoes a mis-tap.
//
// 75-ball US-style cards (B-I-N-G-O, free centre) since they're simple to
// generate correctly; "Tombola" and "Bingo" are the same game to most
// families, so this one screen covers both names. The game is saved on the
// device so a reload mid-game doesn't lose your card.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LETTERS, clearMarks, createGame, drawNumber, toggleMark } from './engine'
import './bingo.css'

const STORAGE_KEY = 'bgo-state-v1'
const CALLER_CARD_COUNTS = [0, 1, 2, 3, 4, 5, 6]
const PLAYER_CARD_COUNTS = [1, 2, 3, 4, 5, 6]

function columnLetter(number) {
  return LETTERS[Math.floor((number - 1) / 15)]
}

function freshState(role, numCards) {
  return { role, numCards, game: createGame(numCards), lastNumber: null }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (saved?.game?.cards && (saved.role === 'caller' || saved.role === 'player')) return saved
  } catch {
    /* nothing saved or storage unavailable */
  }
  return freshState('caller', 2)
}

function winnersText(indices, total) {
  if (total === 1) return ''
  return ` Card ${indices.map((i) => i + 1).join(', ')}`
}

export default function Bingo() {
  const [saved, setSaved] = useState(loadState)
  const [announcement, setAnnouncement] = useState('')
  const { role, numCards, game, lastNumber } = saved
  const isCaller = role === 'caller'
  const handMarking = !isCaller // the caller's cards mark themselves

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      /* storage unavailable, the game still works this session */
    }
  }, [saved])

  // Anything that deals new cards checks first if there's a game to lose.
  const inProgress =
    !game.over &&
    (isCaller ? game.drawn.length > 0 : game.cards.some((card) => card.some((row) => row.some((x) => x.marked && x.value !== 'FREE'))))

  function restart(next, { force = false } = {}) {
    if (!force && inProgress && !window.confirm('Start again? This game and its cards will be lost.')) return
    setSaved(freshState(next.role ?? role, next.numCards ?? numCards))
    setAnnouncement('')
  }

  function chooseRole(nextRole) {
    if (nextRole === role) return
    restart({ role: nextRole, numCards: nextRole === 'player' ? 1 : 2 })
  }

  function announce(newly) {
    const bits = []
    if (newly.fullHouse.length > 0) bits.push(`Full house!${winnersText(newly.fullHouse, numCards)}`)
    else if (newly.line.length > 0) bits.push(`Line!${winnersText(newly.line, numCards)}`)
    if (bits.length && !isCaller) bits.push('Shout it out!')
    if (bits.length) {
      setAnnouncement(bits.join(' '))
      if (navigator.vibrate) navigator.vibrate([30, 60, 30])
    }
    return bits.length > 0
  }

  function draw() {
    const { state, number, newly } = drawNumber(game)
    if (number == null) return
    setSaved((s) => ({ ...s, game: state, lastNumber: number }))
    if (navigator.vibrate) navigator.vibrate(15)
    if (!announce(newly)) setAnnouncement('')
  }

  function tapCell(ci, r, c) {
    if (!handMarking) return
    const cell = game.cards[ci][r][c]
    if (cell.value === 'FREE') return
    const { state, newly } = toggleMark(game, ci, r, c)
    setSaved((s) => ({ ...s, game: state }))
    if (navigator.vibrate) navigator.vibrate(10)
    if (!announce(newly)) setAnnouncement('')
  }

  function wipeMarks() {
    setSaved((s) => ({ ...s, game: clearMarks(s.game) }))
    setAnnouncement('')
  }

  const poolEmpty = game.queue.length === 0
  const canDraw = !game.over && !poolEmpty
  const drawnSet = new Set(game.drawn)

  let status
  if (game.over) status = announcement || 'Full house! Game over.'
  else if (poolEmpty) status = 'All 75 numbers called.'
  else if (announcement) status = announcement
  else if (!lastNumber) status = 'Tap draw to start'
  else status = 'Call it out!'

  return (
    <div className="bgo">
      <header className="bgo-header">
        <Link to="/games" className="bgo-back">
          ← Games
        </Link>
        <h1 className="bgo-title">Bingo</h1>
      </header>

      <div className="bgo-panel">
        <div className="bgo-roles" role="group" aria-label="This phone is">
          <button className={`bgo-role ${isCaller ? 'active' : ''}`} onClick={() => chooseRole('caller')}>
            <span className="bgo-role-emoji">📣</span>
            <span className="bgo-role-title">Caller</span>
            <span className="bgo-role-sub">Draws the numbers</span>
          </button>
          <button className={`bgo-role ${!isCaller ? 'active' : ''}`} onClick={() => chooseRole('player')}>
            <span className="bgo-role-emoji">🎟️</span>
            <span className="bgo-role-title">Player</span>
            <span className="bgo-role-sub">Mark your own card</span>
          </button>
        </div>

        <div className="bgo-themes">
          {(isCaller ? CALLER_CARD_COUNTS : PLAYER_CARD_COUNTS).map((count) => (
            <button
              key={count}
              className={`bgo-chip ${numCards === count ? 'active' : ''}`}
              onClick={() => restart({ numCards: count })}
            >
              {count === 0 ? 'No cards' : `${count} ${count === 1 ? 'card' : 'cards'}`}
            </button>
          ))}
        </div>


        {isCaller ? (
          <>
            <div className="bgo-caller">
              <div className={`bgo-ball ${lastNumber ? 'has-number' : ''}`}>
                {lastNumber ? (
                  <>
                    <span className="bgo-ball-letter">{columnLetter(lastNumber)}</span>
                    <span className="bgo-ball-number">{lastNumber}</span>
                  </>
                ) : (
                  <span className="bgo-ball-hint">?</span>
                )}
              </div>
              <div className="bgo-caller-info">
                <p className="bgo-status">{status}</p>
                <p className="bgo-drawn-count">{game.drawn.length}/75 called</p>
              </div>
            </div>

            <button className="bgo-btn primary" onClick={draw} disabled={!canDraw}>
              Draw number
            </button>

            {game.drawn.length > 0 && (
              <div className="bgo-board" aria-label="Called numbers">
                {LETTERS.map((letter, li) => (
                  <div key={letter} className="bgo-board-row">
                    <span className="bgo-board-letter">{letter}</span>
                    {Array.from({ length: 15 }, (_, i) => {
                      const n = li * 15 + i + 1
                      return (
                        <span
                          key={n}
                          className={`bgo-board-num ${drawnSet.has(n) ? 'called' : ''} ${n === lastNumber ? 'latest' : ''}`}
                        >
                          {n}
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className={`bgo-status bgo-player-status ${announcement ? 'is-win' : ''}`}>
            {announcement || 'Tap a number when it’s called out. Tap again to undo.'}
          </p>
        )}

        {numCards > 0 && (
          <div className="bgo-cards">
            {game.cards.map((card, ci) => {
              const isFullHouse = game.fullHouseWinners.includes(ci)
              const isLine = game.lineWinners.includes(ci)
              return (
                <div key={ci} className={`bgo-card ${isFullHouse ? 'won' : ''}`}>
                  <div className="bgo-card-header">
                    <span>Card {ci + 1}</span>
                    {isFullHouse && <span className="bgo-badge full">Full house!</span>}
                    {!isFullHouse && isLine && <span className="bgo-badge line">Line!</span>}
                  </div>
                  <div className="bgo-card-letters">
                    {LETTERS.map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                  <div className={`bgo-card-grid ${handMarking ? 'is-tappable' : ''}`}>
                    {card.map((row, r) =>
                      row.map((cell, c) => {
                        const cls = `bgo-cell ${cell.marked ? 'marked' : ''} ${cell.value === 'FREE' ? 'free' : ''}`
                        const label = cell.value === 'FREE' ? '★' : cell.value
                        return handMarking && cell.value !== 'FREE' ? (
                          <button
                            key={`${r}-${c}`}
                            type="button"
                            className={cls}
                            aria-pressed={cell.marked}
                            onClick={() => tapCell(ci, r, c)}
                          >
                            {label}
                          </button>
                        ) : (
                          <span key={`${r}-${c}`} className={cls}>
                            {label}
                          </span>
                        )
                      }),
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="bgo-actions">
          {handMarking && numCards > 0 && (
            <button className="bgo-btn" onClick={wipeMarks}>
              Clear marks
            </button>
          )}
          {(!isCaller || game.over || poolEmpty || game.drawn.length > 0) && (
            <button className={`bgo-btn ${isCaller && (game.over || poolEmpty) ? 'primary' : ''}`} onClick={() => restart({})}>
              {isCaller ? (game.over || poolEmpty ? 'Play again' : 'Restart') : 'New cards'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
