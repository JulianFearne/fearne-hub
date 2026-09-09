// src/pages/games/hangman/Hangman.jsx
// Offline single-player. No Supabase, no props — works with the service
// worker once the app shell is cached. Theme picker over JSON word lists
// (wordLists.json) so new themes are a data change, not a code change.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createGame, getDisplayLetters, guessLetter, isLost, isOver, isWon, pickWord, MAX_WRONG } from './engine'
import Gallows from './Gallows'
import wordLists from './wordLists.json'
import './hangman.css'

const THEME_KEYS = Object.keys(wordLists)
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function newRound(themeKey) {
  const word = pickWord(wordLists[themeKey].words)
  return createGame(word)
}

export default function Hangman() {
  const [themeKey, setThemeKey] = useState(THEME_KEYS[0])
  const [game, setGame] = useState(() => newRound(THEME_KEYS[0]))
  const [scores, setScores] = useState({ wins: 0, losses: 0 })
  const scoredRef = useRef(false) // ensure a finished round is tallied once

  const displayLetters = useMemo(() => getDisplayLetters(game), [game])
  const won = isWon(game)
  const lost = isLost(game)
  const over = won || lost

  const guess = useCallback(
    (letter) => {
      if (over) return
      const next = guessLetter(game, letter)
      setGame(next)
    },
    [game, over]
  )

  // Tally the running score once per finished round.
  useEffect(() => {
    if (!over || scoredRef.current) return
    scoredRef.current = true
    setScores((s) => ({ wins: s.wins + (won ? 1 : 0), losses: s.losses + (lost ? 1 : 0) }))
  }, [over, won, lost])

  function startRound(nextThemeKey) {
    setThemeKey(nextThemeKey)
    setGame(newRound(nextThemeKey))
    scoredRef.current = false
  }

  const wrongLetters = game.guessed.filter((l) => !game.word.includes(l))

  return (
    <div className="hangman">
      <header className="hm-header">
        <Link to="/games" className="hm-back">
          ← Games
        </Link>
        <h1 className="hm-title">Hangman</h1>
      </header>

      <div className="hm-panel">
        <div className="hm-themes">
          {THEME_KEYS.map((key) => (
            <button
              key={key}
              className={`hm-chip ${themeKey === key ? 'active' : ''}`}
              onClick={() => startRound(key)}
            >
              {wordLists[key].emoji} {wordLists[key].label}
            </button>
          ))}
        </div>

        <Gallows wrong={game.wrong} />

        <div className="hm-word">
          {displayLetters.map((ch, i) => (
            <span key={i} className={`hm-slot ${ch ? 'filled' : ''}`}>
              {ch || ''}
            </span>
          ))}
        </div>

        <div className={`hm-status ${over ? 'is-over' : ''}`}>
          {won && 'You got it! 🎉'}
          {lost && `Out of guesses — it was ${game.word}`}
          {!over && `${MAX_WRONG - game.wrong} wrong guesses left`}
        </div>

        <div className="hm-keyboard">
          {LETTERS.map((L) => {
            const used = game.guessed.includes(L)
            const wrong = used && !game.word.includes(L)
            return (
              <button
                key={L}
                className={`hm-key ${used ? (wrong ? 'wrong' : 'right') : ''}`}
                disabled={used || over}
                onClick={() => guess(L)}
              >
                {L}
              </button>
            )
          })}
        </div>

        {wrongLetters.length > 0 && (
          <p className="hm-wrong-list">Wrong guesses: {wrongLetters.join(' ')}</p>
        )}

        <div className="hm-scoreboard">
          <span>Won <strong>{scores.wins}</strong></span>
          <span>Lost <strong>{scores.losses}</strong></span>
        </div>

        <div className="hm-actions">
          <button className="hm-btn primary" onClick={() => startRound(themeKey)}>
            New word
          </button>
        </div>
      </div>
    </div>
  )
}
