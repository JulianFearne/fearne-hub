// src/pages/WorkoutTracker.jsx
// Phase 3 + 4 :: the live tracker. Log sets against the loaded programme,
// advance the chains automatically, and rest between sets.

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { effectiveTarget, effectiveRest } from "../lib/workoutSchema";
import {
  getActiveEnrollment,
  getProgress,
  setChainPosition,
  logSet,
  startSession,
  finishSession,
} from "../lib/workoutApi";
import "../styles/workout.css";

export default function WorkoutTracker() {
  const navigate = useNavigate();

  const [program, setProgram] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [progress, setProgress] = useState({});
  const [records, setRecords] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [sessionStart, setSessionStart] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState(null);      // { mode: "log"|"pick", chainId }
  const [openChainList, setOpenChainList] = useState(null);
  const [rest, setRest] = useState(null);        // { seconds, label }

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ---- load ---------------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const enr = await getActiveEnrollment();
        if (!enr) { navigate("/workouts"); return; }

        const prog = enr.workout_programs;
        setProgram(prog.definition);
        setProgramId(prog.id);
        setProgress(await getProgress(prog.id));
        setRecords(Object.fromEntries((prog.definition.record_sections || []).map((s) => [s.id, []])));
      } catch (e) {
        setError(e.message || "Could not load your workout.");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // ---- ensure a session exists before the first log ------------------------
  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const s = await startSession(programId);
    setSessionId(s.id);
    setSessionStart(Date.now());
    return s.id;
  }, [sessionId, programId]);

  // ---- log sets -----------------------------------------------------------
  const handleLog = async (chain, amounts) => {
    setBusy(true);
    setError(null);
    try {
      const sid = await ensureSession();
      const cur = progress[chain.id] ?? { idx: 0, streak: 0 };

      const res = await logSet({
        program,
        programId,
        chain,
        amounts,
        sessionId: sid,
        currentIdx: cur.idx,
        currentStreak: cur.streak,
      });

      setProgress((p) => ({ ...p, [chain.id]: { idx: res.newIndex, streak: res.streak } }));
      setModal(null);

      const target = effectiveTarget(program, chain, chain.exercises[cur.idx]);
      if (res.advanced) showToast(`${chain.label}: levelled up to ${res.newExercise.name}`);
      else if (res.hitTarget) showToast(`${chain.label}: ${res.streak} of ${target.streak} toward the next rung`);
      else showToast(`${chain.label}: logged, streak back to zero`);

      setRest({ seconds: effectiveRest(program, chain), label: chain.label });
    } catch (e) {
      setError(e.message || "Could not save that set.");
    } finally {
      setBusy(false);
    }
  };

  // ---- reposition ---------------------------------------------------------
  const handleReposition = async (chain, index) => {
    try {
      await setChainPosition(programId, chain.id, index);
      setProgress((p) => ({ ...p, [chain.id]: { idx: index, streak: 0 } }));
      setModal(null);
      showToast(`${chain.label} moved to ${chain.exercises[index].name}`);
    } catch (e) {
      setError(e.message || "Could not move that chain.");
    }
  };

  // ---- finish -------------------------------------------------------------
  const handleFinish = async () => {
    if (!sessionId) { showToast("Log at least one set first."); return; }
    setBusy(true);
    try {
      const duration = sessionStart ? Math.round((Date.now() - sessionStart) / 1000) : null;
      await finishSession(sessionId, { recordSelections: records, durationSeconds: duration });
      showToast("Workout saved. Well done.");
      setSessionId(null);
      setSessionStart(null);
      setRecords(Object.fromEntries((program.record_sections || []).map((s) => [s.id, []])));
      setTimeout(() => navigate("/workouts/history"), 900);
    } catch (e) {
      setError(e.message || "Could not save the workout.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = (sectionId, option, single) => {
    setRecords((prev) => {
      const cur = prev[sectionId] || [];
      if (single) return { ...prev, [sectionId]: cur.includes(option) ? [] : [option] };
      return {
        ...prev,
        [sectionId]: cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option],
      };
    });
  };

  if (loading) {
    return (
      <div className="workout">
        <div className="workout-shell">
          <div className="workout-empty"><span className="workout-spinner" /> Loading your workout…</div>
        </div>
      </div>
    );
  }

  if (!program) return null;

  // group chains by section, preserving file order
  const sections = [];
  const bySection = {};
  (program.chains || []).forEach((c) => {
    if (!bySection[c.section]) { bySection[c.section] = []; sections.push(c.section); }
    bySection[c.section].push(c);
  });

  const activeChain = modal ? program.chains.find((c) => c.id === modal.chainId) : null;

  return (
    <div className="workout">
      <div className="workout-shell">
        <div className="workout-header">
          <div>
            <div className="workout-kicker">Now training</div>
            <h1>{program.name}</h1>
            <p className="workout-sub">
              {program.targets.sets}×{program.targets.reps} for {program.targets.streak} workouts running
              moves you up a rung.
            </p>
          </div>
          <button className="workout-btn workout-btn--ghost workout-btn--sm" onClick={() => navigate("/workouts")}>
            Change
          </button>
        </div>

        {error && <div className="workout-alert workout-alert--error">{error}</div>}

        {/* ---- tick-list sections ---- */}
        {(program.record_sections || []).map((sec) => (
          <div key={sec.id} className="workout-card workout-card--accent" style={{ "--w-accent": sec.color }}>
            <div className="workout-card__label" style={{ "--w-accent": sec.color, marginBottom: 9 }}>
              {sec.label}
            </div>
            <div className="workout-chips">
              {sec.options.map((opt) => (
                <button
                  key={opt}
                  className="workout-chip"
                  data-on={(records[sec.id] || []).includes(opt)}
                  onClick={() => toggleRecord(sec.id, opt, sec.select === "single")}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* ---- progression chains ---- */}
        {sections.map((section) => (
          <div key={section}>
            <div className="workout-section-heading">{section}</div>
            {bySection[section].map((chain) => {
              const cur = progress[chain.id] ?? { idx: 0, streak: 0 };
              const exercise = chain.exercises[cur.idx];
              const target = effectiveTarget(program, chain, exercise);
              const total = chain.exercises.length;
              const pct = Math.round(((cur.idx + 1) / total) * 100);
              const maxed = cur.idx >= total - 1;
              const listOpen = openChainList === chain.id;

              return (
                <div key={chain.id} className="workout-card workout-card--accent" style={{ "--w-accent": chain.color }}>
                  <div className="workout-card__top">
                    <div>
                      <div className="workout-card__label" style={{ "--w-accent": chain.color }}>{chain.label}</div>
                      {chain.sub && <div className="workout-card__sub">{chain.sub}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="workout-btn workout-btn--ghost workout-btn--sm"
                        onClick={() => setModal({ mode: "pick", chainId: chain.id })}
                      >
                        move
                      </button>
                      <button
                        className="workout-btn workout-btn--ghost workout-btn--sm"
                        onClick={() => setOpenChainList(listOpen ? null : chain.id)}
                      >
                        {listOpen ? "hide" : "chain"}
                      </button>
                    </div>
                  </div>

                  <div className="workout-exercise-name">{exercise.name}</div>
                  <div className="workout-step">
                    step {cur.idx + 1} of {total} · target {target.sets}×{target.reps}
                    {target.unit === "seconds" ? "s hold" : ""}
                    {maxed && " · top of the chain"}
                  </div>
                  {exercise.note && <p className="workout-card__sub" style={{ marginBottom: 8 }}>{exercise.note}</p>}

                  <div className="workout-track">
                    <div className="workout-track__fill" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="workout-streak">
                    {Array.from({ length: target.streak }).map((_, i) => (
                      <span key={i} className="workout-dot" data-on={i < cur.streak} />
                    ))}
                    <span className="workout-streak__label">
                      {cur.streak} of {target.streak} at target
                    </span>
                  </div>

                  <button
                    className="workout-btn workout-btn--primary workout-btn--block"
                    onClick={() => setModal({ mode: "log", chainId: chain.id })}
                  >
                    Log {target.unit === "seconds" ? "hold" : "sets"}
                  </button>

                  {listOpen && (
                    <ol className="workout-chain-list">
                      {chain.exercises.map((ex, i) => (
                        <li key={i} data-state={i === cur.idx ? "current" : i < cur.idx ? "done" : "todo"}>
                          {ex.name}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button
            className="workout-btn workout-btn--gold"
            style={{ flex: 1 }}
            onClick={handleFinish}
            disabled={busy || !sessionId}
          >
            Finish and save workout
          </button>
          <button className="workout-btn workout-btn--ghost" onClick={() => navigate("/workouts/history")}>
            History
          </button>
        </div>
      </div>

      {modal?.mode === "log" && activeChain && (
        <LogModal
          program={program}
          chain={activeChain}
          idx={(progress[activeChain.id] ?? { idx: 0 }).idx}
          busy={busy}
          onCancel={() => setModal(null)}
          onSave={(amounts) => handleLog(activeChain, amounts)}
        />
      )}

      {modal?.mode === "pick" && activeChain && (
        <PickModal
          chain={activeChain}
          idx={(progress[activeChain.id] ?? { idx: 0 }).idx}
          onCancel={() => setModal(null)}
          onPick={(i) => handleReposition(activeChain, i)}
        />
      )}

      {rest && (
        <RestTimer
          seconds={rest.seconds}
          label={rest.label}
          onDismiss={() => setRest(null)}
        />
      )}

      {toast && <div className="workout-toast">{toast}</div>}
    </div>
  );
}

/* ========================================================================== */
/* Log modal                                                                   */
/* ========================================================================== */

function LogModal({ program, chain, idx, busy, onCancel, onSave }) {
  const exercise = chain.exercises[idx];
  const target = effectiveTarget(program, chain, exercise);
  const isHold = target.unit === "seconds";

  const [amounts, setAmounts] = useState(() => Array(target.sets).fill(""));
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const setAt = (i, v) => setAmounts((p) => p.map((x, j) => (j === i ? v : x)));

  const filled = amounts.filter((v) => v !== "" && !Number.isNaN(parseInt(v, 10)));
  const willHit = filled.length >= target.sets && filled.every((v) => parseInt(v, 10) >= target.reps);

  return (
    <div className="workout-overlay" onClick={onCancel}>
      <div className="workout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workout-kicker" style={{ color: chain.color }}>
          {chain.section} · {chain.label}
        </div>
        <h2 style={{ margin: "6px 0 3px" }}>{exercise.name}</h2>
        <p className="workout-card__sub">
          Target {target.sets} × {target.reps}{isHold ? " seconds" : " reps"}
        </p>

        <div className="workout-sets-row">
          {amounts.map((v, i) => (
            <div key={i}>
              <label htmlFor={`set-${i}`}>Set {i + 1}</label>
              <input
                id={`set-${i}`}
                ref={i === 0 ? firstRef : null}
                type="number"
                min="0"
                inputMode="numeric"
                placeholder={isHold ? "secs" : "reps"}
                value={v}
                onChange={(e) => setAt(i, e.target.value)}
              />
            </div>
          ))}
        </div>

        {filled.length > 0 && (
          <div className={`workout-alert ${willHit ? "workout-alert--ok" : "workout-alert--warn"}`}>
            {willHit
              ? "That hits the target. One more step toward levelling up."
              : "Below target, so the streak resets. Still worth logging."}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="workout-btn workout-btn--ghost" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="workout-btn workout-btn--primary"
            style={{ flex: 2 }}
            onClick={() => onSave(amounts)}
            disabled={busy || filled.length === 0}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Reposition modal                                                            */
/* ========================================================================== */

function PickModal({ chain, idx, onCancel, onPick }) {
  return (
    <div className="workout-overlay" onClick={onCancel}>
      <div className="workout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workout-kicker" style={{ color: chain.color }}>{chain.label}</div>
        <h2 style={{ margin: "6px 0 3px" }}>Move along the chain</h2>
        <p className="workout-card__sub" style={{ marginBottom: 14 }}>
          Jumping to a new rung resets that chain's streak.
        </p>

        <div className="workout-ladder">
          {chain.exercises.map((ex, i) => (
            <button
              key={i}
              data-state={i === idx ? "current" : i < idx ? "done" : "todo"}
              onClick={() => onPick(i)}
            >
              <span className="idx">{i + 1}</span>
              <span style={{ flex: 1 }}>{ex.name}</span>
              {ex.unit === "seconds" && <span className="workout-pill">hold</span>}
              {i === idx && <span>✓</span>}
            </button>
          ))}
        </div>

        <button className="workout-btn workout-btn--ghost workout-btn--block" style={{ marginTop: 14 }} onClick={onCancel}>
          Close
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Rest timer                                                                  */
/* ========================================================================== */

function RestTimer({ seconds, label, onDismiss }) {
  const [left, setLeft] = useState(seconds);
  const [paused, setPaused] = useState(false);
  const wakeRef = useRef(null);

  // keep the screen awake while resting, where the browser supports it
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if ("wakeLock" in navigator) {
          const lock = await navigator.wakeLock.request("screen");
          if (cancelled) { lock.release(); return; }
          wakeRef.current = lock;
        }
      } catch { /* not supported, no problem */ }
    })();
    return () => {
      cancelled = true;
      try { wakeRef.current?.release(); } catch { /* already gone */ }
      wakeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (paused || left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, paused]);

  // one short buzz when the rest is up, if the device does that
  useEffect(() => {
    if (left === 0 && "vibrate" in navigator) {
      try { navigator.vibrate([120, 60, 120]); } catch { /* ignore */ }
    }
  }, [left]);

  const done = left <= 0;
  const pct = Math.max(0, Math.min(100, (left / seconds) * 100));
  const mm = Math.floor(Math.abs(left) / 60);
  const ss = String(Math.abs(left) % 60).padStart(2, "0");

  return (
    <div className="workout-timer" data-done={done}>
      <div className="workout-timer__count">{done ? "Go" : `${mm}:${ss}`}</div>
      <div style={{ flex: 1 }}>
        <div className="workout-timer__label">{done ? `${label} rest over` : `Resting · ${label}`}</div>
        <div className="workout-timer__bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      {!done && (
        <button onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
      )}
      <button onClick={onDismiss}>{done ? "Done" : "Skip"}</button>
    </div>
  );
}
