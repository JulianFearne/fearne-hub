// src/pages/games/pictionary/Pictionary.jsx
// Offline pass-and-play word generator for Pictionary-style drawing games,
// with a Charades mode (acting instead of drawing) that reuses the exact
// same categories, timer and scoreboard: only the framing text changes.
// No Supabase, no props: one phone gets passed round the room. Words live in
// words.json as category x difficulty. Picks use a shuffle bag (see engine.js)
// whose history is kept in localStorage, so words don't repeat until the
// chosen pool has been used up, even across sessions.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import words from './words.json'
import { DIFFICULTIES, buildPool, formatClock, pickWord, remainingCount } from './engine'
import './pictionary.css'

const CATEGORY_KEYS = Object.keys(words)
const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard', mixed: 'Mixed' }
const STORAGE_KEY = 'fearne-hub.pictionary'
const HISTORY_LIMIT = 1000

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      categoryKey: raw.categoryKey === 'all' || words[raw.categoryKey] ? raw.categoryKey : 'all',
      difficulty: DIFFICULTY_LABELS[raw.difficulty] ? raw.difficulty : 'easy',
      used: Array.isArray(raw.used) ? raw.used : [],
    }
  } catch {
    return { categoryKey: 'all', difficulty: 'easy', used: [] }
  }
}
const TIMER_OPTIONS = [
  { key: 'off', label: 'No timer', seconds: 0 },
  { key: '60', label: '60s', seconds: 60 },
  { key: '90', label: '90s', seconds: 90 },
]
const MODES = {
  draw: { label: 'Draw', title: 'Pictionary', performer: 'drawer', verb: 'draw' },
  act: { label: 'Act', title: 'Charades', performer: 'actor', verb: 'act out' },
}

export default function Pictionary() {
  const [mode, setMode] = useState('draw')
  const [saved] = useState(loadSaved)
  const [categoryKey, setCategoryKey] = useState(saved.categoryKey)
  const [difficulty, setDifficulty] = useState(saved.difficulty)
  const [used, setUsed] = useState(saved.used)
  const [current, setCurrent] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [timerKey, setTimerKey] = useState('off')
  const [timeLeft, setTimeLeft] = useState(0)
  const [team, setTeam] = useState('a')
  const [scores, setScores] = useState({ a: 0, b: 0 })

  const tickRef = useRef(null)

  const pool = useMemo(() => buildPool(words, categoryKey, difficulty), [categoryKey, difficulty])
  const remaining = remainingCount(pool, used)
  const timerSeconds = TIMER_OPTIONS.find((t) => t.key === timerKey).seconds
  const modeInfo = MODES[mode]

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ categoryKey, difficulty, used }))
    } catch {
      // Private mode or storage blocked: history just won't persist.
    }
  }, [categoryKey, difficulty, used])

  // Countdown while a word is revealed and a timer is selected.
  useEffect(() => {
    if (!revealed || timerSeconds === 0) return
    if (timeLeft <= 0) {
      nextWord()
      return
    }
    tickRef.current = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    return () => clearTimeout(tickRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, timeLeft, timerSeconds])

  // The word is drawn at reveal time, so flicking between filters never
  // burns words from the bag.
  function reveal() {
    const next = pickWord(pool, used, current)
    setCurrent(next.word)
    setUsed(next.used.slice(-HISTORY_LIMIT))
    setRevealed(true)
    setTimeLeft(timerSeconds)
  }

  function nextWord() {
    setRevealed(false)
    setTeam((t) => (t === 'a' ? 'b' : 'a'))
  }

  function markCorrect() {
    setScores((s) => ({ ...s, [team]: s[team] + 1 }))
    nextWord()
  }

  function skip() {
    nextWord()
  }

  function changeCategory(key) {
    setCategoryKey(key)
    setRevealed(false)
  }

  function changeDifficulty(key) {
    setDifficulty(key)
    setRevealed(false)
  }

  function resetWords() {
    const poolSet = new Set(pool)
    setUsed((u) => u.filter((w) => !poolSet.has(w)))
  }

  return (
    <div className="pic">
      <header className="pic-header">
        <Link to="/games" className="pic-back">
          ← Games
        </Link>
        <h1 className="pic-title">{modeInfo.title}</h1>
      </header>

      <div className="pic-panel">
        <div className="pic-themes">
          {Object.keys(MODES).map((key) => (
            <button
              key={key}
              className={`pic-chip ${mode === key ? 'active' : ''}`}
              onClick={() => setMode(key)}
            >
              {MODES[key].label}
            </button>
          ))}
        </div>

        <div className="pic-themes">
          <button
            className={`pic-chip ${categoryKey === 'all' ? 'active' : ''}`}
            onClick={() => changeCategory('all')}
          >
            🎲 All
          </button>
          {CATEGORY_KEYS.map((key) => (
            <button
              key={key}
              className={`pic-chip ${categoryKey === key ? 'active' : ''}`}
              onClick={() => changeCategory(key)}
            >
              {words[key].emoji} {words[key].label}
            </button>
          ))}
        </div>

        <div className="pic-themes">
          {[...DIFFICULTIES, 'mixed'].map((key) => (
            <button
              key={key}
              className={`pic-chip ${difficulty === key ? 'active' : ''}`}
              onClick={() => changeDifficulty(key)}
            >
              {DIFFICULTY_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="pic-themes">
          {TIMER_OPTIONS.map((t) => (
            <button
              key={t.key}
              className={`pic-chip ${timerKey === t.key ? 'active' : ''}`}
              onClick={() => setTimerKey(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="pic-turn">
          Team {team.toUpperCase()}'s turn to {modeInfo.verb}
          {timerSeconds > 0 && revealed && (
            <span className="pic-clock"> · {formatClock(timeLeft)}</span>
          )}
        </p>

        <button className={`pic-card ${revealed ? 'revealed' : ''}`} onClick={!revealed ? reveal : undefined}>
          {revealed ? current : `Tap to reveal, then pass the phone to the ${modeInfo.performer}`}
        </button>

        <p className="pic-remaining">
          {remaining} of {pool.length} words left before repeats
          {remaining < pool.length && (
            <>
              {' · '}
              <button className="pic-link" onClick={resetWords}>
                Reset
              </button>
            </>
          )}
        </p>

        <div className="pic-scoreboard">
          <span>
            Team A <strong>{scores.a}</strong>
          </span>
          <span>
            Team B <strong>{scores.b}</strong>
          </span>
        </div>

        <div className="pic-actions">
          <button className="pic-btn primary" onClick={markCorrect} disabled={!revealed}>
            Correct!
          </button>
          <button className="pic-btn" onClick={skip} disabled={!revealed}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
