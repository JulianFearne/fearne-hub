// src/pages/games/wobbly-towers/WobblyTowers.jsx
// Physics stacker in the style of Tricky Towers. The physics and rules live
// in engine.js (matter-js), drawing in draw.js, and the play surface (frame
// loop, controls, HUD) in WobblyStage.jsx. This page is the solo game's start
// screen, results and scoreboard, plus the way into online races
// (WobblyOnline.jsx; an invite link /games/wobbly-towers?code=ABCD goes
// straight there).
//
// Endless: the score is the tallest the tower stood before three pieces fell
// off. Medals at set heights. Two modes, Classic and Power-ups, each with its
// own family high-score board (lib/scores.js). The device still keeps its
// own top 10 in localStorage for the medals and the "best" line.
//
// The route is marked `fill` in App.jsx, so the hub body is exactly one screen
// tall and the game stretches into it: no scrolling to reach the controls.

import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext.jsx'
import { displayName } from '../../accountData'
import { MEDALS, MODES, POWERS, POWER_EVERY, medalFor } from './engine'
import WobblyStage from './WobblyStage'
import WobblyOnline, { storedRaceId } from './WobblyOnline'
import { useHighScores } from '../lib/scores'
import Leaderboard from '../lib/Leaderboard'
import './wobbly-towers.css'

const MODE_KEY = 'wt-mode'
const MAX_SCORES = 10

// Classic keeps the original key so scores from before modes existed stay.
function scoresKey(mode) {
  return mode === 'classic' ? 'wt-scores' : `wt-scores-${mode}`
}

function loadScores(mode) {
  try {
    const scores = JSON.parse(localStorage.getItem(scoresKey(mode)))
    return Array.isArray(scores) ? scores : []
  } catch {
    return []
  }
}

function saveScores(mode, scores) {
  try {
    localStorage.setItem(scoresKey(mode), JSON.stringify(scores))
  } catch {
    // Private browsing or storage full: the scoreboard just won't stick.
  }
}

function loadMode() {
  try {
    const mode = localStorage.getItem(MODE_KEY)
    return MODES[mode] ? mode : 'classic'
  } catch {
    return 'classic'
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Not remembered; defaults to Classic next time.
  }
}

// Adds a score and returns { scores, rank } with rank 0-based, or -1 if it
// didn't make the top 10.
function addScore(scores, entry) {
  const all = [...scores, entry].sort((a, b) => b.score - a.score || a.at - b.at)
  const top = all.slice(0, MAX_SCORES)
  return { scores: top, rank: top.indexOf(entry) }
}

export default function WobblyTowers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inviteCode, setInviteCode] = useState(() => (searchParams.get('code') || '').toUpperCase())
  const [online, setOnline] = useState(() => !!inviteCode || !!storedRaceId())

  if (online) {
    return (
      <WobblyOnline
        initialCode={inviteCode}
        onCodeUsed={() => {
          setInviteCode('')
          setSearchParams({}, { replace: true })
        }}
        onExit={() => setOnline(false)}
      />
    )
  }
  return <WobblySolo onOnline={() => setOnline(true)} />
}

function WobblySolo({ onOnline }) {
  const { profile, user } = useAuth()
  const [mode, setMode] = useState(loadMode)
  const [scores, setScores] = useState(() => loadScores(mode))
  const [result, setResult] = useState(null) // { score, rank } after a game
  const stage = useRef(null)
  const family = useHighScores('wobbly-towers', mode)

  const personalBest = scores.reduce((m, s) => Math.max(m, s.score), 0)
  const name = displayName(profile, user?.email)

  function recordGame(game) {
    const score = game.best
    if (score > 0) {
      const added = addScore(scores, { name, score, at: Date.now() })
      saveScores(mode, added.scores)
      setScores(added.scores)
      setResult({ score, rank: added.rank })
      family.submit(score).then((r) => setResult((prev) => (prev?.score === score ? { ...prev, family: r } : prev)))
    } else {
      setResult({ score, rank: -1 })
    }
  }

  function play() {
    setResult(null)
    stage.current?.start()
  }

  function chooseMode(next) {
    if (next === mode) return
    saveMode(next)
    setMode(next)
    setScores(loadScores(next))
    setResult(null)
  }

  const lifetimeMedal = medalFor(personalBest)
  const powerMode = mode === 'powerups'
  const modePicker = (
    <div className="wt-modes" role="group" aria-label="Game mode">
      {Object.entries(MODES).map(([key, m]) => (
        <button key={key} className={`wt-chip ${mode === key ? 'active' : ''}`} onClick={() => chooseMode(key)}>
          {m.label}
        </button>
      ))}
    </div>
  )

  function overlay(hud) {
    if (hud.status === 'ready') {
      return (
        <div className="wt-overlay">
          <p className="wt-overlay-title">Wobbly Towers</p>
          <p className="wt-overlay-sub">
            Steer and turn the falling pieces to build as high as you can. Three pieces off the edge and it's over.
          </p>
          {modePicker}
          {powerMode && (
            <p className="wt-overlay-note">
              Every {POWER_EVERY} pieces earns a power-up: {Object.values(POWERS).map((p) => p.emoji).join(' ')}. Tap it
              (top right) when you need it.
            </p>
          )}
          <p className="wt-medals">
            {MEDALS.map((m) => (
              <span key={m.key} className={personalBest >= m.blocks ? 'won' : ''} title={`${m.label}: ${m.blocks} blocks`}>
                {m.emoji}
                <small>{m.blocks}</small>
              </span>
            ))}
          </p>
          <div className="wt-overlay-actions">
            <button className="wt-btn primary" onClick={play}>
              Start
            </button>
            <button className="wt-btn" onClick={onOnline}>
              🌐 Race online
            </button>
          </div>
          <Leaderboard scores={family} />
        </div>
      )
    }
    if (hud.status === 'over' && result) {
      return (
        <div className="wt-overlay">
          <p className="wt-overlay-title">Timber!</p>
          <p className="wt-overlay-score">
            {result.score} {result.score === 1 ? 'block' : 'blocks'}
            {medalFor(result.score) ? ` ${medalFor(result.score).emoji}` : ''}
          </p>
          <p className="wt-overlay-sub">
            {result.family?.best && result.family.rank === 1
              ? 'Top of the family! 👑'
              : result.family?.best
                ? `New personal best!${result.family.rank ? ` Number ${result.family.rank} in the family.` : ''}`
                : result.family?.rank
                  ? `Number ${result.family.rank} in the family`
                  : lifetimeMedal
                    ? `Best so far: ${personalBest} ${lifetimeMedal.emoji}`
                    : 'Keep stacking!'}
          </p>
          <div className="wt-overlay-actions">
            <button className="wt-btn primary" onClick={play}>
              Play again
            </button>
            <button className="wt-btn" onClick={onOnline}>
              🌐 Race online
            </button>
          </div>
          {modePicker}
          <Leaderboard scores={family} />
        </div>
      )
    }
    return null
  }

  return (
    <div className="wt">
      <WobblyStage ref={stage} mode={mode} personalBest={personalBest} overlay={overlay} onGameEnd={recordGame} />
    </div>
  )
}
