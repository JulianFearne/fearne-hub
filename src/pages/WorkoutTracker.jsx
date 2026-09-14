// src/pages/WorkoutTracker.jsx
// Phase 3 + 4 :: the live tracker. Log sets against the loaded programme,
// advance the chains automatically, and rest between sets.

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { effectiveTarget, effectiveRest, describeTarget } from "../lib/workoutSchema";
import {
  getActiveEnrollment,
  getProgress,
  setChainPosition,
  logSet,
  deloadChain,
  startSession,
  finishSession,
} from "../lib/workoutApi";
import "../styles/workout.css";

const dayKey = (programId) => `fh-workout-last-day-${programId}`;

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
  const [dayFilter, setDayFilter] = useState("All");
  const [nextDayHint, setNextDayHint] = useState(null);
  const [supersetQueue, setSupersetQueue] = useState(null); // { group, currentId, remaining }

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ---- suggest which day is next, from what was last logged ---------------
  useEffect(() => {
    if (!program || !programId) { setNextDayHint(null); return; }
    const labels = program.days?.length
      ? program.days
      : Array.from(new Set((program.chains || []).map((c) => c.day).filter(Boolean)));
    if (labels.length < 2) { setNextDayHint(null); return; }
    try {
      const lastDay = localStorage.getItem(dayKey(programId));
      const idx = lastDay ? labels.indexOf(lastDay) : -1;
      setNextDayHint(labels[(idx + 1) % labels.length]);
    } catch {
      setNextDayHint(null);
    }
  }, [program, programId]);

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
  const handleLog = async (chain, amounts, rpe) => {
    setBusy(true);
    setError(null);
    try {
      const sid = await ensureSession();
      const cur = progress[chain.id] ?? { idx: 0, streak: 0, loadKg: chain.start_load_kg ?? 0 };
      const mode = chain.progression?.mode === "load" ? "load" : "ladder";

      const res = await logSet({
        program,
        programId,
        chain,
        amounts,
        sessionId: sid,
        currentIdx: cur.idx,
        currentStreak: cur.streak,
        currentLoadKg: cur.loadKg ?? 0,
        rpe,
      });

      setProgress((p) => ({
        ...p,
        [chain.id]: { idx: res.newIndex, streak: res.streak, loadKg: mode === "load" ? res.newLoadKg : cur.loadKg },
      }));
      setModal(null);

      if (chain.day) {
        try { localStorage.setItem(dayKey(programId), chain.day); } catch { /* ignore */ }
      }

      const target = effectiveTarget(program, chain, chain.exercises[cur.idx]);
      if (res.advanced && mode === "load") showToast(`${chain.label}: working weight up to ${res.newLoadKg}kg`);
      else if (res.advanced) showToast(`${chain.label}: levelled up to ${res.newExercise.name}`);
      else if (res.allCeiling) showToast(`${chain.label}: ${res.streak} of ${target.streak} toward the next step`);
      else if (res.hitTarget) showToast(`${chain.label}: logged, on target`);
      else showToast(`${chain.label}: logged, streak back to zero`);

      if (chain.per_side && amounts && Array.isArray(amounts.left) && Array.isArray(amounts.right)) {
        const sum = (arr) => arr.reduce((n, v) => n + (parseInt(v, 10) || 0), 0);
        const l = sum(amounts.left);
        const r = sum(amounts.right);
        const gap = Math.max(l, r) > 0 ? Math.abs(l - r) / Math.max(l, r) : 0;
        if (gap > 0.15) {
          const weaker = l < r ? "left" : "right";
          setTimeout(
            () => showToast(`${chain.label}: ${Math.round(gap * 100)}% left/right gap, ${weaker} side is behind`),
            3300
          );
        }
      }

      // a superset chains straight into its next exercise instead of resting,
      // with one shared rest only once every exercise in the group is logged
      if (supersetQueue && supersetQueue.currentId === chain.id) {
        const next = supersetQueue.remaining[0];
        if (next) {
          setSupersetQueue({ group: supersetQueue.group, currentId: next, remaining: supersetQueue.remaining.slice(1) });
          setModal({ mode: "log", chainId: next });
          return;
        }
        const group = supersetQueue.group;
        setSupersetQueue(null);
        setRest({
          seconds: Math.max(...group.map((c) => effectiveRest(program, c))),
          label: group.map((c) => c.label).join(" + "),
        });
        return;
      }

      setRest({ seconds: effectiveRest(program, chain), label: chain.label });
    } catch (e) {
      setError(e.message || "Could not save that set.");
    } finally {
      setBusy(false);
    }
  };

  // ---- deload ---------------------------------------------------------------
  const handleDeload = async (chain, currentLoadKg) => {
    if (!window.confirm(`Drop ${chain.label}'s working weight by 10% (from ${currentLoadKg}kg) and reset its streak?`)) return;
    try {
      const newLoadKg = await deloadChain(programId, chain.id, currentLoadKg);
      setProgress((p) => ({ ...p, [chain.id]: { ...(p[chain.id] || {}), streak: 0, loadKg: newLoadKg } }));
      showToast(`${chain.label}: deloaded to ${newLoadKg}kg`);
    } catch (e) {
      setError(e.message || "Could not deload that chain.");
    }
  };

  // ---- superset ---------------------------------------------------------
  const startSuperset = (group) => {
    setSupersetQueue({ group, currentId: group[0].id, remaining: group.slice(1).map((c) => c.id) });
    setModal({ mode: "log", chainId: group[0].id });
  };

  // ---- reposition ---------------------------------------------------------
  const handleReposition = async (chain, index) => {
    try {
      await setChainPosition(programId, chain.id, index);
      setProgress((p) => ({ ...p, [chain.id]: { ...(p[chain.id] || {}), idx: index, streak: 0 } }));
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
      <div className="fh-workout">
        <div className="fh-workout-shell">
          <div className="fh-workout-empty"><span className="fh-workout-spinner" /> Loading your workout…</div>
        </div>
      </div>
    );
  }

  if (!program) return null;

  const dayLabels = program.days?.length
    ? program.days
    : Array.from(new Set((program.chains || []).map((c) => c.day).filter(Boolean)));

  // chains with no day assigned show up under every day, as well as "All"
  const visibleChains = dayFilter === "All"
    ? program.chains
    : (program.chains || []).filter((c) => !c.day || c.day === dayFilter);

  // group visible chains by section, preserving file order
  const sections = [];
  const bySection = {};
  visibleChains.forEach((c) => {
    if (!bySection[c.section]) { bySection[c.section] = []; sections.push(c.section); }
    bySection[c.section].push(c);
  });

  // superset groups, computed from what's currently visible: a partner hidden
  // by the day filter just falls back to rendering its half solo
  const supersetGroups = {};
  visibleChains.forEach((c) => {
    if (c.superset_group) (supersetGroups[c.superset_group] ||= []).push(c);
  });
  const renderedGroups = new Set();

  const activeChain = modal ? program.chains.find((c) => c.id === modal.chainId) : null;

  return (
    <div className="fh-workout">
      <div className="fh-workout-shell">
        <div className="fh-workout-header">
          <div>
            <div className="fh-workout-kicker">Now training</div>
            <h1>{program.name}</h1>
            <p className="fh-workout-sub">
              {describeTarget({ ...program.targets, unit: "reps" })} for {program.targets.streak} workouts running
              moves a chain on: to the next rung, or up in weight for load chains.
            </p>
          </div>
          <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={() => navigate("/workouts")}>
            Change
          </button>
        </div>

        {error && <div className="fh-workout-alert fh-workout-alert--error">{error}</div>}

        {nextDayHint && dayFilter === "All" && (
          <div
            className="fh-workout-alert fh-workout-alert--ok"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}
          >
            <span>Next up: Day {nextDayHint}</span>
            <button
              className="fh-workout-btn fh-workout-btn--primary fh-workout-btn--sm"
              onClick={() => setDayFilter(nextDayHint)}
            >
              Show Day {nextDayHint}
            </button>
          </div>
        )}

        {dayLabels.length > 1 && (
          <div className="fh-workout-tabs">
            <button className="fh-workout-tab" data-active={dayFilter === "All"} onClick={() => setDayFilter("All")}>
              All
            </button>
            {dayLabels.map((d) => (
              <button key={d} className="fh-workout-tab" data-active={dayFilter === d} onClick={() => setDayFilter(d)}>
                Day {d}
              </button>
            ))}
          </div>
        )}

        {/* ---- tick-list sections ---- */}
        {(program.record_sections || []).map((sec) => (
          <div key={sec.id} className="fh-workout-card fh-workout-card--accent" style={{ "--w-accent": sec.color }}>
            <div className="fh-workout-card__label" style={{ "--w-accent": sec.color, marginBottom: 9 }}>
              {sec.label}
            </div>
            <div className="fh-workout-chips">
              {sec.options.map((opt) => (
                <button
                  key={opt}
                  className="fh-workout-chip"
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
            <div className="fh-workout-section-heading">{section}</div>
            {bySection[section].map((chain) => {
              const cur = progress[chain.id] ?? { idx: 0, streak: 0, loadKg: chain.start_load_kg ?? 0 };
              // a superset with 2+ visible members renders as one combined card,
              // shown once at the first member encountered; a lone member (its
              // partner hidden by the day filter) just falls back to solo below
              if (chain.superset_group) {
                const group = supersetGroups[chain.superset_group];
                if (group && group.length > 1) {
                  if (renderedGroups.has(chain.superset_group)) return null;
                  renderedGroups.add(chain.superset_group);
                  return (
                    <SupersetCard
                      key={chain.superset_group}
                      program={program}
                      group={group}
                      progress={progress}
                      onLog={startSuperset}
                    />
                  );
                }
              }

              const exercise = chain.exercises[cur.idx];
              const target = effectiveTarget(program, chain, exercise);
              const mode = chain.progression?.mode === "load" ? "load" : "ladder";
              const total = chain.exercises.length;
              const pct = Math.round(((cur.idx + 1) / total) * 100);
              const maxed = cur.idx >= total - 1;
              const listOpen = openChainList === chain.id;
              const logWord = target.unit === "seconds" ? "hold" : target.unit === "metres" ? "distance" : "sets";

              return (
                <div key={chain.id} className="fh-workout-card fh-workout-card--accent" style={{ "--w-accent": chain.color }}>
                  <div className="fh-workout-card__top">
                    <div>
                      <div className="fh-workout-card__label" style={{ "--w-accent": chain.color }}>{chain.label}</div>
                      {chain.sub && <div className="fh-workout-card__sub">{chain.sub}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {mode === "load" && (
                        <button
                          className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
                          onClick={() => handleDeload(chain, cur.loadKg ?? 0)}
                        >
                          deload
                        </button>
                      )}
                      <button
                        className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
                        onClick={() => setModal({ mode: "pick", chainId: chain.id })}
                      >
                        move
                      </button>
                      <button
                        className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
                        onClick={() => setOpenChainList(listOpen ? null : chain.id)}
                      >
                        {listOpen ? "hide" : "chain"}
                      </button>
                    </div>
                  </div>

                  <div className="fh-workout-exercise-name">
                    {exercise.name}
                    {exercise.video_url && (
                      <a
                        href={exercise.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="fh-workout-pill"
                        style={{ marginLeft: 8, textDecoration: "none", verticalAlign: "middle" }}
                      >
                        form video
                      </a>
                    )}
                  </div>
                  <div className="fh-workout-step">
                    {mode === "load"
                      ? <>target {describeTarget(target)} at {cur.loadKg ?? 0}kg</>
                      : <>step {cur.idx + 1} of {total} · target {describeTarget(target)}{maxed && " · top of the chain"}</>}
                  </div>
                  {exercise.note && <p className="fh-workout-card__sub" style={{ marginBottom: 8 }}>{exercise.note}</p>}

                  <div className="fh-workout-track">
                    <div className="fh-workout-track__fill" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="fh-workout-streak">
                    {Array.from({ length: target.streak }).map((_, i) => (
                      <span key={i} className="fh-workout-dot" data-on={i < cur.streak} />
                    ))}
                    <span className="fh-workout-streak__label">
                      {cur.streak} of {target.streak} at target
                    </span>
                  </div>

                  <button
                    className="fh-workout-btn fh-workout-btn--primary fh-workout-btn--block"
                    onClick={() => setModal({ mode: "log", chainId: chain.id })}
                  >
                    Log {logWord}
                  </button>

                  {listOpen && (
                    <ol className="fh-workout-chain-list">
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
            className="fh-workout-btn fh-workout-btn--gold"
            style={{ flex: 1 }}
            onClick={handleFinish}
            disabled={busy || !sessionId}
          >
            Finish and save workout
          </button>
          <button className="fh-workout-btn fh-workout-btn--ghost" onClick={() => navigate("/workouts/history")}>
            History
          </button>
        </div>
      </div>

      {modal?.mode === "log" && activeChain && (
        <LogModal
          key={activeChain.id}
          program={program}
          chain={activeChain}
          idx={(progress[activeChain.id] ?? { idx: 0 }).idx}
          loadKg={(progress[activeChain.id] ?? {}).loadKg ?? activeChain.start_load_kg ?? 0}
          busy={busy}
          supersetStep={
            supersetQueue && supersetQueue.currentId === activeChain.id
              ? { index: supersetQueue.group.length - supersetQueue.remaining.length, total: supersetQueue.group.length }
              : null
          }
          onCancel={() => { setModal(null); setSupersetQueue(null); }}
          onSave={(amounts, rpe) => handleLog(activeChain, amounts, rpe)}
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

      {toast && <div className="fh-workout-toast">{toast}</div>}
    </div>
  );
}

/* ========================================================================== */
/* Superset card                                                              */
/* ========================================================================== */

function SupersetCard({ program, group, progress, onLog }) {
  const accent = group[0].color;
  return (
    <div className="fh-workout-card fh-workout-card--accent" style={{ "--w-accent": accent }}>
      <div className="fh-workout-card__top">
        <span className="fh-workout-pill">Superset</span>
      </div>

      {group.map((chain, i) => {
        const cur = progress[chain.id] ?? { idx: 0, streak: 0, loadKg: chain.start_load_kg ?? 0 };
        const exercise = chain.exercises[cur.idx];
        const target = effectiveTarget(program, chain, exercise);
        const mode = chain.progression?.mode === "load" ? "load" : "ladder";
        return (
          <div key={chain.id} style={{ marginBottom: i < group.length - 1 ? 14 : 10 }}>
            <div className="fh-workout-card__label" style={{ "--w-accent": chain.color }}>{chain.label}</div>
            <div className="fh-workout-exercise-name" style={{ fontSize: "1.05em" }}>
              {exercise.name}
              {exercise.video_url && (
                <a
                  href={exercise.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="fh-workout-pill"
                  style={{ marginLeft: 8, textDecoration: "none", verticalAlign: "middle" }}
                >
                  form video
                </a>
              )}
            </div>
            <div className="fh-workout-step">
              {mode === "load" ? <>target {describeTarget(target)} at {cur.loadKg ?? 0}kg</> : <>target {describeTarget(target)}</>}
            </div>
            <div className="fh-workout-streak">
              {Array.from({ length: target.streak }).map((_, si) => (
                <span key={si} className="fh-workout-dot" data-on={si < cur.streak} />
              ))}
              <span className="fh-workout-streak__label">{cur.streak} of {target.streak} at target</span>
            </div>
            {i < group.length - 1 && (
              <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 12, marginTop: 8 }}>+ straight into</div>
            )}
          </div>
        );
      })}

      <button className="fh-workout-btn fh-workout-btn--primary fh-workout-btn--block" onClick={() => onLog(group)}>
        Log superset
      </button>
    </div>
  );
}

/* ========================================================================== */
/* Log modal                                                                   */
/* ========================================================================== */

function LogModal({ program, chain, idx, loadKg, busy, supersetStep, onCancel, onSave }) {
  const exercise = chain.exercises[idx];
  const target = effectiveTarget(program, chain, exercise);
  const mode = chain.progression?.mode === "load" ? "load" : "ladder";

  const makeBlank = () => Array(target.sets).fill("");
  const [left, setLeft] = useState(makeBlank);
  const [right, setRight] = useState(() => (chain.per_side ? makeBlank() : null));
  const [rpe, setRpe] = useState("");
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const setAt = (setter, i, v) => setter((p) => p.map((x, j) => (j === i ? v : x)));

  const filledOf = (arr) => (arr || []).filter((v) => v !== "" && !Number.isNaN(parseInt(v, 10)));
  const reachesCeiling = (arr) => {
    const filled = filledOf(arr);
    return filled.length >= target.sets && filled.every((v) => parseInt(v, 10) >= target.repMax);
  };
  const belowFloor = (arr) => filledOf(arr).some((v) => parseInt(v, 10) < target.repMin);

  const leftFilled = filledOf(left);
  const rightFilled = chain.per_side ? filledOf(right) : [];
  // a per-side log can be saved with just one side filled in (the other
  // reads as a miss and gates the streak, same as a weaker side would)
  const canSave = chain.per_side ? leftFilled.length > 0 || rightFilled.length > 0 : leftFilled.length > 0;
  const anyFilled = leftFilled.length > 0 || rightFilled.length > 0;
  const sideWillMiss = (arr) => filledOf(arr).length === 0 || belowFloor(arr);
  const willMiss = chain.per_side ? sideWillMiss(left) || sideWillMiss(right) : belowFloor(left);
  const willCeiling = chain.per_side ? reachesCeiling(left) && reachesCeiling(right) : reachesCeiling(left);

  const save = () => onSave(chain.per_side ? { left, right } : left, rpe === "" ? null : rpe);

  return (
    <div className="fh-workout-overlay" onClick={onCancel}>
      <div className="fh-workout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fh-workout-kicker" style={{ color: chain.color }}>
          {chain.section} · {chain.label}
          {supersetStep && ` · superset ${supersetStep.index} of ${supersetStep.total}`}
        </div>
        <h2 style={{ margin: "6px 0 3px" }}>{exercise.name}</h2>
        <p className="fh-workout-card__sub">
          Target {describeTarget(target)}
          {mode === "load" && ` at ${loadKg ?? 0}kg`}
        </p>

        {chain.per_side ? (
          <>
            <div className="fh-workout-section-heading" style={{ margin: "14px 0 6px" }}>Left</div>
            <SetsRow amounts={left} unit={target.unit} idPrefix="l" firstRef={firstRef} onChange={(i, v) => setAt(setLeft, i, v)} />
            <div className="fh-workout-section-heading" style={{ margin: "14px 0 6px" }}>Right</div>
            <SetsRow amounts={right} unit={target.unit} idPrefix="r" onChange={(i, v) => setAt(setRight, i, v)} />
          </>
        ) : (
          <SetsRow amounts={left} unit={target.unit} idPrefix="s" firstRef={firstRef} onChange={(i, v) => setAt(setLeft, i, v)} />
        )}

        <div style={{ maxWidth: 140, marginTop: 12 }}>
          <label htmlFor="rpe">RPE (optional)</label>
          <input
            id="rpe"
            type="number"
            min="1"
            max="10"
            step="0.5"
            inputMode="decimal"
            placeholder="1-10"
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
          />
        </div>

        {anyFilled && (
          <div className={`fh-workout-alert ${willMiss ? "fh-workout-alert--warn" : "fh-workout-alert--ok"}`}>
            {willMiss
              ? "Below target, so the streak resets. Still worth logging."
              : willCeiling
                ? mode === "load"
                  ? "At the top of the range. One more like this and the weight goes up."
                  : "That hits the target. One more step toward levelling up."
                : "Between the two, so this counts and the streak holds where it is."}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="fh-workout-btn fh-workout-btn--ghost" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="fh-workout-btn fh-workout-btn--primary"
            style={{ flex: 2 }}
            onClick={save}
            disabled={busy || !canSave}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetsRow({ amounts, unit, idPrefix, firstRef, onChange }) {
  const placeholder = unit === "seconds" ? "secs" : unit === "metres" ? "metres" : "reps";
  return (
    <div className="fh-workout-sets-row">
      {amounts.map((v, i) => (
        <div key={i}>
          <label htmlFor={`${idPrefix}-set-${i}`}>Set {i + 1}</label>
          <input
            id={`${idPrefix}-set-${i}`}
            ref={i === 0 ? firstRef : null}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={placeholder}
            value={v}
            onChange={(e) => onChange(i, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

/* ========================================================================== */
/* Reposition modal                                                            */
/* ========================================================================== */

function PickModal({ chain, idx, onCancel, onPick }) {
  return (
    <div className="fh-workout-overlay" onClick={onCancel}>
      <div className="fh-workout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fh-workout-kicker" style={{ color: chain.color }}>{chain.label}</div>
        <h2 style={{ margin: "6px 0 3px" }}>Move along the chain</h2>
        <p className="fh-workout-card__sub" style={{ marginBottom: 14 }}>
          Jumping to a new rung resets that chain's streak.
        </p>

        <div className="fh-workout-ladder">
          {chain.exercises.map((ex, i) => (
            <button
              key={i}
              data-state={i === idx ? "current" : i < idx ? "done" : "todo"}
              onClick={() => onPick(i)}
            >
              <span className="idx">{i + 1}</span>
              <span style={{ flex: 1 }}>{ex.name}</span>
              {ex.unit === "seconds" && <span className="fh-workout-pill">hold</span>}
              {ex.unit === "metres" && <span className="fh-workout-pill">distance</span>}
              {ex.video_url && (
                <a
                  href={ex.video_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="fh-workout-pill"
                  style={{ textDecoration: "none" }}
                >
                  ▶
                </a>
              )}
              {i === idx && <span>✓</span>}
            </button>
          ))}
        </div>

        <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--block" style={{ marginTop: 14 }} onClick={onCancel}>
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
    <div className="fh-workout-timer" data-done={done}>
      <div className="fh-workout-timer__count">{done ? "Go" : `${mm}:${ss}`}</div>
      <div style={{ flex: 1 }}>
        <div className="fh-workout-timer__label">{done ? `${label} rest over` : `Resting · ${label}`}</div>
        <div className="fh-workout-timer__bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      {!done && (
        <button onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
      )}
      <button onClick={onDismiss}>{done ? "Done" : "Skip"}</button>
    </div>
  );
}
