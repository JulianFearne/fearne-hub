// src/pages/games/pictionary/Pictionary.jsx
// Offline pass-and-play word generator for Pictionary-style drawing games,
// with a Charades mode (acting instead of drawing) that reuses the exact
// same categories, timer and scoreboard: only the framing text changes.
// No Supabase, no props: one phone gets passed round the room. Category
// picker over JSON words (words.json), same pattern as Hangman's word lists
// and Would You Rather's prompts.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import words from './words.json'
import { formatClock, randomIndex } from './engine'
import './pictionary.css'

const CATEGORY_KEYS = Object.keys(words)
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
  const [categoryKey, setCategoryKey] = useState(CATEGORY_KEYS[0])
  const [index, setIndex] = useState(() => randomIndex(words[CATEGORY_KEYS[0]].words.length))
  const [revealed, setRevealed] = useState(false)
  const [timerKey, setTimerKey] = useState('off')
  const [timeLeft, setTimeLeft] = useState(0)
  const [team, setTeam] = useState('a')
  const [scores, setScores] = useState({ a: 0, b: 0 })

  const tickRef = useRef(null)

  const list = words[categoryKey].words
  const current = list[index]
  const timerSeconds = TIMER_OPTIONS.find((t) => t.key === timerKey).seconds
  const modeInfo = MODES[mode]

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

  function reveal() {
    setRevealed(true)
    setTimeLeft(timerSeconds)
  }

  function nextWord() {
    setIndex((i) => randomIndex(list.length, i))
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
    setIndex(randomIndex(words[key].words.length))
    setRevealed(false)
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
