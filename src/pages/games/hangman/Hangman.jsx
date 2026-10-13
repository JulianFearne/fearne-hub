// src/pages/games/hangman/Hangman.jsx
// Offline single-player, works with the service worker once the app shell
// is cached. Words guessed in a row make a streak; when a streak ends (a
// lost word, or leaving with one going) it goes on the family high-score
// board (lib/scores.js). Theme picker over JSON word lists
// (wordLists.json) so new themes are a data change, not a code change.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createGame, getDisplayLetters, guessLetter, isLost, isOver, isWon, pickWord, MAX_WRONG } from './engine'
import Gallows from './Gallows'
import wordLists from './wordLists.json'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
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
  const [streak, setStreak] = useState(0)
  const [record, setRecord] = useState(null)
  const family = useHighScores('hangman', 'streak')
  const streakRef = useRef(0)
  const submitRef = useRef(family.submit)
  submitRef.current = family.submit

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
    if (won) {
      streakRef.current += 1
      setStreak(streakRef.current)
    } else {
      const ended = streakRef.current
      streakRef.current = 0
      setStreak(0)
      if (ended > 0) submitRef.current(ended).then((r) => setRecord({ ...r, streak: ended }))
    }
  }, [over, won, lost])

  // Leaving with a streak going still counts it.
  useEffect(
    () => () => {
      if (streakRef.current > 0) submitRef.current(streakRef.current)
    },
    [],
  )

  function startRound(nextThemeKey) {
    setRecord(null)
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
          <span>Streak <strong>{streak}</strong></span>
        </div>

        {record && (
          <p className="hm-record">
            {record.best ? 'New best streak' : 'Streak'}: {record.streak} in a row
            {record.rank ? `, number ${record.rank} in the family` : ''}.
          </p>
        )}

        <div className="hm-actions">
          <button className="hm-btn primary" onClick={() => startRound(themeKey)}>
            New word
          </button>
        </div>

        <Leaderboard scores={family} className="hm-leaderboard" />
      </div>
    </div>
  )
}
