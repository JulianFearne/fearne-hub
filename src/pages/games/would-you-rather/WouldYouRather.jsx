// src/pages/games/would-you-rather/WouldYouRather.jsx
// Offline pass-and-play. No Supabase, no props, no per-player accounts —
// one screen everyone huddles around, tallying which side the group picks.
// Category picker over JSON prompts (prompts.json) so new categories are a
// data change, not a code change — same pattern as Hangman's word lists.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import prompts from './prompts.json'
import { randomIndex } from './engine'
import './would-you-rather.css'

const CATEGORY_KEYS = Object.keys(prompts)

export default function WouldYouRather() {
  const [categoryKey, setCategoryKey] = useState(CATEGORY_KEYS[0])
  const [index, setIndex] = useState(() => randomIndex(prompts[CATEGORY_KEYS[0]].prompts.length))
  const [picked, setPicked] = useState(null)
  const [tally, setTally] = useState({ a: 0, b: 0 })

  const list = prompts[categoryKey].prompts
  const current = list[index]

  function pick(side) {
    if (picked) return
    setPicked(side)
    setTally((t) => ({ ...t, [side]: t[side] + 1 }))
  }

  function next() {
    setIndex((i) => randomIndex(list.length, i))
    setPicked(null)
  }

  function changeCategory(key) {
    setCategoryKey(key)
    setIndex(randomIndex(prompts[key].prompts.length))
    setPicked(null)
  }

  return (
    <div className="wyr">
      <header className="wyr-header">
        <Link to="/games" className="wyr-back">
          ← Games
        </Link>
        <h1 className="wyr-title">Would You Rather</h1>
      </header>

      <div className="wyr-panel">
        <div className="wyr-themes">
          {CATEGORY_KEYS.map((key) => (
            <button
              key={key}
              className={`wyr-chip ${categoryKey === key ? 'active' : ''}`}
              onClick={() => changeCategory(key)}
            >
              {prompts[key].emoji} {prompts[key].label}
            </button>
          ))}
        </div>

        <p className="wyr-prompt">Would you rather…</p>

        <div className="wyr-options">
          <button
            className={`wyr-option ${picked === 'a' ? 'chosen' : ''} ${picked && picked !== 'a' ? 'faded' : ''}`}
            onClick={() => pick('a')}
            disabled={Boolean(picked)}
          >
            {current.a}
          </button>
          <div className="wyr-or">or</div>
          <button
            className={`wyr-option ${picked === 'b' ? 'chosen' : ''} ${picked && picked !== 'b' ? 'faded' : ''}`}
            onClick={() => pick('b')}
            disabled={Boolean(picked)}
          >
            {current.b}
          </button>
        </div>

        <div className="wyr-scoreboard">
          <span>
            Picked A <strong>{tally.a}</strong>
          </span>
          <span>
            Picked B <strong>{tally.b}</strong>
          </span>
        </div>

        <div className="wyr-actions">
          <button className="wyr-btn primary" onClick={next}>
            Next question
          </button>
        </div>
      </div>
    </div>
  )
}
