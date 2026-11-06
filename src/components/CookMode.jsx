import { useEffect, useRef, useState } from 'react'
import Button from './ds/Button.jsx'
import IconButton from './ds/IconButton.jsx'

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
  // The timer counts down to a stored end time rather than ticking a counter,
  // so switching apps or the phone locking doesn't stall it: coming back shows
  // the true time left. Same approach as the workout rest timer.
  const [endsAt, setEndsAt] = useState(null) // ms timestamp while running
  const [pausedLeft, setPausedLeft] = useState(null) // seconds left while paused
  const [, setNow] = useState(Date.now())
  const beepedRef = useRef(false)
  const wakeLockRef = useRef(null)
  const ingRef = useRef(null)

  const stepText = recipe.steps[step]
  const total = detectTimerSeconds(stepText || '')

  const running = endsAt != null
  const remaining = running
    ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    : pausedLeft ?? total
  const finished = running && remaining <= 0

  useEffect(() => {
    setEndsAt(null)
    setPausedLeft(null)
  }, [step, total])

  // Re-render while running, and straight away when the page comes back.
  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    const t = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running])

  // Beep when it runs out, or on returning to the page if it ran out meanwhile.
  useEffect(() => {
    if (!finished) {
      beepedRef.current = false
      return
    }
    const tryBeep = () => {
      if (!beepedRef.current && document.visibilityState === 'visible') {
        beepedRef.current = true
        beep()
      }
    }
    tryBeep()
    document.addEventListener('visibilitychange', tryBeep)
    return () => document.removeEventListener('visibilitychange', tryBeep)
  }, [finished])

  // The panel sits below the step and timer, which on a phone is off-screen,
  // so bring it into view when it opens.
  useEffect(() => {
    if (ingOpen) ingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [ingOpen])

  // Keep the screen awake. The lock drops whenever the page is hidden, so take
  // it again on the way back.
  useEffect(() => {
    let cancelled = false
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLockRef.current) {
          const lock = await navigator.wakeLock.request('screen')
          if (cancelled) {
            lock.release()
            return
          }
          wakeLockRef.current = lock
          lock.addEventListener?.('release', () => {
            wakeLockRef.current = null
          })
        }
      } catch (e) {
        /* wake lock not supported, fail silently */
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      try {
        wakeLockRef.current?.release()
      } catch (e) {
        /* already gone */
      }
      wakeLockRef.current = null
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
    if (running && !finished) {
      setPausedLeft(remaining)
      setEndsAt(null)
      return
    }
    const start = finished || remaining <= 0 ? total : remaining
    setPausedLeft(null)
    setEndsAt(Date.now() + start * 1000)
  }

  function resetTimer() {
    setEndsAt(null)
    setPausedLeft(null)
  }

  function handlePrev() {
    if (step > 0) setStep(step - 1)
  }
  function handleNext() {
    if (step < recipe.steps.length - 1) setStep(step + 1)
    else onExit()
  }

  return (
    <div className="fh-cook">
      <div className="fh-cook__top">
        <p className="fh-cook__title">{recipe.title}</p>
        <Button
          variant="quiet"
          size="sm"
          icon="list-checks"
          aria-expanded={ingOpen}
          onClick={() => setIngOpen((o) => !o)}
        >
          Ingredients
        </Button>
        <IconButton icon="x" label="Exit Cook Mode" variant="onFeature" onClick={onExit} />
      </div>

      <div className="fh-cook__dots">
        {recipe.steps.map((_, i) => (
          <div
            key={i}
            className={`fh-cook__dot${i < step ? ' fh-cook__dot--done' : i === step ? ' fh-cook__dot--current' : ''}`}
          />
        ))}
      </div>

      <div className="fh-cook__body">
        <p className="fh-cook__label">
          Step {step + 1} of {recipe.steps.length}
        </p>
        <p className="fh-cook__step">{stepText}</p>

        {total > 0 && (
          <div className={`fh-cook__timer${finished ? ' fh-cook__timer--finished' : ''}`}>
            <span className="fh-cook__timer-time">{fmtTime(remaining)}</span>
            <Button variant="secondary" icon={running && !finished ? 'pause' : 'play'} onClick={toggleTimer}>
              {running && !finished ? 'Pause' : finished || remaining === total ? 'Start timer' : 'Resume'}
            </Button>
            <Button variant="quiet" onClick={resetTimer}>
              Reset
            </Button>
          </div>
        )}

        {ingOpen && (
          <div className="fh-cook__ingredients" ref={ingRef}>
            <h4>Ingredients</h4>
            <ul>
              {recipe.ingredients.map((i, idx) =>
                i.group ? (
                  <li key={idx} style={{ fontWeight: 'var(--fw-semibold)' }}>
                    {i.group}
                  </li>
                ) : (
                  <li key={idx}>
                    {i.name}
                    {i.amount ? ` — ${i.amount}` : ''}
                  </li>
                )
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="fh-cook__foot">
        <Button variant="quiet" icon="chevron-left" onClick={handlePrev} disabled={step === 0}>
          Back
        </Button>
        <span className="fh-cook__count">
          {step + 1} / {recipe.steps.length}
        </span>
        <Button variant="secondary" onClick={handleNext}>
          {step === recipe.steps.length - 1 ? 'Finish cooking' : 'Next step'}
        </Button>
      </div>
    </div>
  )
}
