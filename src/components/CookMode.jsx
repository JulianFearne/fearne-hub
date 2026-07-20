import { useEffect, useRef, useState } from 'react'

function detectTimerSeconds(text) {
  let best = 0
  let m
  const hrRe = /(\d+)\s*(?:hrs?|hours?)\s*(?:(\d+)\s*(?:mins?|minutes?))?/gi
  while ((m = hrRe.exec(text))) {
    const s = +m[1] * 3600 + (m[2] ? +m[2] * 60 : 0)
    if (s > best) best = s
  }
  const minRe = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:mins?|minutes?)/gi
  while ((m = minRe.exec(text))) {
    const s = (m[2] ? +m[2] : +m[1]) * 60
    if (s > best) best = s
  }
  const secRe = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(?:secs?|seconds?)/gi
  while ((m = secRe.exec(text))) {
    const s = m[2] ? +m[2] : +m[1]
    if (s > best) best = s
  }
  return best
}

function fmtTime(s) {
  s = Math.max(0, s)
  const h = Math.floor(s / 3600)
  const min = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${min}:${String(sec).padStart(2, '0')}`
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g)
      g.connect(ctx.destination)
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.3)
    })
  } catch (e) {
    /* audio not available, fail silently */
  }
}

export default function CookMode({ recipe, onExit }) {
  const [step, setStep] = useState(0)
  const [ingOpen, setIngOpen] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const intervalRef = useRef(null)
  const wakeLockRef = useRef(null)

  const stepText = recipe.steps[step]
  const total = detectTimerSeconds(stepText || '')

  useEffect(() => {
    setRemaining(total)
    setRunning(false)
    setFinished(false)
    clearInterval(intervalRef.current)
  }, [step, total])

  useEffect(() => {
    try {
      navigator.wakeLock?.request('screen').then((l) => (wakeLockRef.current = l)).catch(() => {})
    } catch (e) {
      /* wake lock not supported, fail silently */
    }
    return () => {
      clearInterval(intervalRef.current)
      try {
        wakeLockRef.current?.release()
      } catch (e) {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') handleNext()
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'Escape') onExit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function toggleTimer() {
    if (running) {
      clearInterval(intervalRef.current)
      setRunning(false)
      return
    }
    const start = remaining <= 0 ? total : remaining
    setRemaining(start)
    setFinished(false)
    setRunning(true)
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          setFinished(true)
          beep()
          return 0
        }
        return r - 1
      })
    }, 1000)
  }

  function resetTimer() {
    clearInterval(intervalRef.current)
    setRunning(false)
    setFinished(false)
    setRemaining(total)
  }

  function handlePrev() {
    if (step > 0) setStep(step - 1)
  }
  function handleNext() {
    if (step < recipe.steps.length - 1) setStep(step + 1)
    else onExit()
  }

  return (
    <div className="rb-cook-overlay">
      <div className="rb-cook-header">
        <div className="rb-cook-title">
          {recipe.emoji} {recipe.title}
        </div>
        <div>
          <button className="rb-cook-hbtn" onClick={() => setIngOpen((o) => !o)}>
            🧾 Ingredients
          </button>
          <button className="rb-cook-hbtn" onClick={onExit}>
            ✕ Exit
          </button>
        </div>
      </div>

      <div className="rb-cook-progress">
        {recipe.steps.map((_, i) => (
          <div key={i} className={`rb-cook-dot ${i < step ? 'done' : i === step ? 'current' : ''}`} />
        ))}
      </div>

      <div className="rb-cook-body-wrap">
        <div className="rb-cook-main">
          <div className="rb-cook-step-label">
            Step {step + 1} of {recipe.steps.length}
          </div>
          <div className="rb-cook-step-text">{stepText}</div>

          {total > 0 && (
            <div className={`rb-cook-timer ${finished ? 'finished' : ''}`}>
              <div className="rb-cook-timer-display">{fmtTime(remaining)}</div>
              <button className="rb-cook-tbtn" onClick={toggleTimer}>
                {running ? '⏸ Pause' : remaining <= 0 || remaining === total ? '▶ Start timer' : '▶ Resume'}
              </button>
              <button className="rb-cook-tbtn secondary" onClick={resetTimer}>
                ↺ Reset
              </button>
            </div>
          )}
        </div>

        <div className={`rb-cook-ing-panel ${ingOpen ? 'open' : ''}`}>
          <h4>Ingredients</h4>
          <ul>
            {recipe.ingredients.map((i, idx) =>
              i.group ? (
                <li key={idx} className="rb-ing-group">
                  {i.group}
                </li>
              ) : (
                <li key={idx}>
                  {i.name}
                  {i.amount ? (
                    <>
                      {' — '}
                      <strong>{i.amount}</strong>
                    </>
                  ) : null}
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      <div className="rb-cook-footer">
        <button className="rb-cook-nav-btn" onClick={handlePrev} disabled={step === 0}>
          ← Back
        </button>
        <span className="rb-cook-count">
          {step + 1} / {recipe.steps.length}
        </span>
        <button className="rb-cook-nav-btn primary" onClick={handleNext}>
          {step === recipe.steps.length - 1 ? '✓ Finish' : 'Next →'}
        </button>
      </div>
    </div>
  )
}
