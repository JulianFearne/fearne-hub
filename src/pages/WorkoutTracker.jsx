// src/pages/WorkoutTracker.jsx
// Phase 3 + 4 :: the live tracker. Log sets against the loaded programme,
// advance the chains automatically, and rest between sets. The workout in
// progress (session, ticked sets, rest timer) is kept on the device by
// workoutLive.js, so closing the page part way through loses nothing.

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { effectiveTarget, effectiveRest, describeTarget, sectionPlacement } from "../lib/workoutSchema";
import {
  getActiveEnrollment,
  getProgress,
  setChainPosition,
  logSet,
  deloadChain,
  startSession,
  finishSession,
} from "../lib/workoutApi";
import { loadLive, saveLive, clearLive, emptyLive, startRest, togglePause, buildRunItems, nextOpenItem } from "../lib/workoutLive";
import WorkoutLogger, { draftFor, doneCount, entryFromDraft } from "../components/WorkoutLogger";
import WorkoutRestTimer from "../components/WorkoutRestTimer";
import ExerciseGuide from "../components/ExerciseGuide";
import "../styles/workout.css";

const dayKey = (programId) => `fh-workout-last-day-${programId}`;

export default function WorkoutTracker() {
  const navigate = useNavigate();

  const [program, setProgram] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [progress, setProgress] = useState({});
  const [live, setLive] = useState(emptyLive); // { sessionId, sessionStart, drafts, rest }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState(null);      // { mode: "pick", chainId }
  const [loggerIds, setLoggerIds] = useState(null); // chain ids open in the set logger (2+ for a superset)
  const [openChainList, setOpenChainList] = useState(null);
  const [dayFilter, setDayFilter] = useState("All");
  const [nextDayHint, setNextDayHint] = useState(null);

  const [showOverview, setShowOverview] = useState(false); // peek at the overview mid-session
  const { sessionId, sessionStart, drafts, rest, run } = live;
  const records = live.records || {}; // tick-list choices, kept with the rest of the live workout
  const inRun = !!run && !showOverview;
  // the chains being logged: the bottom sheet's, or the session's current item
  const activeIds = loggerIds ?? (inRun && run.current != null ? run.items[run.current] : []);
  const patchLive = useCallback((patch) => {
    setLive((l) => {
      const next = { ...l, ...(typeof patch === "function" ? patch(l) : patch) };
      if (programId) saveLive(programId, next);
      return next;
    });
  }, [programId]);

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
        setLive(loadLive(prog.id));
        setProgress(await getProgress(prog.id));
      } catch (e) {
        setError(e.message || "Could not load your workout.");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // ---- ensure a session exists before the first log ------------------------
  // one request in flight at a time, so a tick and a quick "finish" can't
  // open two sessions between them
  const sessionReq = useRef(null);
  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    if (!sessionReq.current) {
      sessionReq.current = startSession(programId)
        .then((s) => {
          patchLive((l) => ({ sessionId: s.id, sessionStart: l.sessionStart ?? Date.now() }));
          return s.id;
        })
        .catch((e) => { sessionReq.current = null; throw e; });
    }
    return sessionReq.current;
  }, [sessionId, programId, patchLive]);

  // ---- ticking sets off ------------------------------------------------------
  const setDraft = (chainId, draft) => patchLive((l) => ({ drafts: { ...l.drafts, [chainId]: draft } }));

  const handleTick = ({ isLastOfRound }) => {
    // the session row is made in the background; a dropped connection at the
    // gym shouldn't stop a set being ticked, and finishing retries it
    if (!sessionId) ensureSession().catch(() => {});
    if (!sessionStart) patchLive({ sessionStart: Date.now() });
    if (!isLastOfRound) return; // superset: straight into the next exercise
    const group = activeIds.map((id) => program.chains.find((c) => c.id === id));
    patchLive({
      rest: startRest(Math.max(...group.map((c) => effectiveRest(program, c))), group.map((c) => c.label).join(" + ")),
    });
  };

  // ---- save one exercise: the streak is judged here, once ------------------
  const commitChain = async (chain, sid) => {
    const cur = progress[chain.id] ?? { idx: 0, streak: 0, loadKg: chain.start_load_kg ?? 0 };
    const draft = draftFor(drafts, chain, cur.idx, program);
    const mode = chain.progression?.mode === "load" ? "load" : "ladder";
    const entry = entryFromDraft(chain, draft);

    const res = await logSet({
      program,
      programId,
      chain,
      entry,
      sessionId: sid,
      currentIdx: cur.idx,
      currentStreak: cur.streak,
      currentLoadKg: cur.loadKg ?? 0,
      rpe: draft.rpe === "" ? null : draft.rpe,
      note: draft.note,
    });

    setProgress((p) => ({
      ...p,
      [chain.id]: { idx: res.newIndex, streak: res.streak, loadKg: mode === "load" ? res.newLoadKg : cur.loadKg },
    }));
    patchLive((l) => {
      const { [chain.id]: _gone, ...rest } = l.drafts;
      return { drafts: rest };
    });
    if (chain.day) {
      try { localStorage.setItem(dayKey(programId), chain.day); } catch { /* ignore */ }
    }

    const msgs = [];
    const target = effectiveTarget(program, chain, chain.exercises[cur.idx]);
    if (res.advanced && mode === "load") msgs.push(`${chain.label}: working weight up to ${res.newLoadKg}kg`);
    else if (res.advanced) msgs.push(`${chain.label}: levelled up to ${res.newExercise.name}`);
    else if (res.allCeiling) msgs.push(`${chain.label}: ${res.streak} of ${target.streak} toward the next step`);
    else if (res.hitTarget) msgs.push(`${chain.label}: saved, on target`);
    else msgs.push(`${chain.label}: saved, streak back to zero`);

    if (chain.per_side && entry.left.length && entry.right.length) {
      const sum = (arr) => arr.reduce((n, v) => n + (parseInt(v.amount, 10) || 0), 0);
      const l = sum(entry.left);
      const r = sum(entry.right);
      const gap = Math.max(l, r) > 0 ? Math.abs(l - r) / Math.max(l, r) : 0;
      if (gap > 0.15) msgs.push(`${chain.label}: ${Math.round(gap * 100)}% left/right gap, ${l < r ? "left" : "right"} side is behind`);
    }
    if (res.migrationMissing) msgs.push("Saved without per-set weights and notes: workout-schema-v5.sql still needs running.");

    // for the end-of-session summary
    const allSets = chain.per_side ? [...entry.left, ...entry.right] : entry.sets;
    const volume = allSets.reduce((n, x) => n + (Number(x.kg) || 0) * (parseInt(x.amount, 10) || 0), 0);
    const logged = {
      chainId: chain.id,
      label: chain.label,
      exercise: chain.exercises[cur.idx].name,
      sets: chain.per_side ? Math.max(entry.left.length, entry.right.length) : entry.sets.length,
      volume: Math.round(volume),
      advanced: res.advanced,
      hitTarget: res.hitTarget,
      message: msgs[0].replace(`${chain.label}: `, ""),
    };
    patchLive((l) => (l.run ? { run: { ...l.run, log: [...l.run.log.filter((x) => x.chainId !== chain.id), logged] } } : {}));
    return msgs;
  };

  const showToasts = (msgs) => msgs.forEach((m, i) => setTimeout(() => showToast(m), i * 3300));

  const handleFinishExercise = async () => {
    setBusy(true);
    setError(null);
    try {
      const sid = await ensureSession();
      const msgs = [];
      for (const id of activeIds) {
        const chain = program.chains.find((c) => c.id === id);
        const cur = progress[chain.id] ?? { idx: 0 };
        if (doneCount(draftFor(drafts, chain, cur.idx, program)) > 0) msgs.push(...(await commitChain(chain, sid)));
      }
      if (loggerIds) {
        // logged from the overview mid-session: tick it off in the session too
        const ids = loggerIds;
        patchLive((l) => {
          if (!l.run) return {};
          const i = l.run.items.findIndex((item) => item.some((id) => ids.includes(id)));
          return i < 0 ? {} : { run: { ...l.run, done: [...new Set([...l.run.done, i])] } };
        });
        setLoggerIds(null);
      } else {
        moveOn(true);
      }
      showToasts(msgs);
    } catch (e) {
      setError(e.message || "Could not save that exercise. Your ticked sets are still here, try again.");
    } finally {
      setBusy(false);
    }
  };

  // each new exercise in a session starts at the top of the page
  const runCurrent = run?.current;
  useEffect(() => {
    if (runCurrent !== undefined) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [runCurrent]);

  // ---- guided session: one exercise (or superset) at a time ----------------
  const startRun = (day) => {
    const items = buildRunItems(program, day);
    if (!items.length) { showToast("Nothing to do on that day."); return; }
    patchLive((l) => ({ run: { day, items, current: 0, done: [], log: [] }, sessionStart: l.sessionStart ?? Date.now() }));
    setShowOverview(false);
    if (day) { try { localStorage.setItem(dayKey(programId), day); } catch { /* ignore */ } }
    ensureSession().catch(() => {});
  };

  // finished: mark it done and go to the next one still open; skipped: just move on
  const moveOn = (finished) => {
    patchLive((l) => {
      if (!l.run || l.run.current == null) return {};
      const done = finished ? [...new Set([...l.run.done, l.run.current])] : l.run.done;
      const r = { ...l.run, done };
      const next = nextOpenItem(r, l.run.current);
      if (!finished && next === l.run.current) return {};
      return { run: { ...r, current: next } };
    });
  };

  const skipItem = () => {
    if (run && nextOpenItem(run, run.current) === run.current) { showToast("That's the last one left."); return; }
    moveOn(false);
  };

  const jumpTo = (i) => patchLive((l) => ({ run: { ...l.run, current: i, warmupDone: true } }));
  const toSummary = () => patchLive((l) => ({ run: { ...l.run, current: null } }));

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
  const pendingChains = (program?.chains || []).filter(
    (c) => doneCount(draftFor(drafts, c, (progress[c.id] ?? { idx: 0 }).idx, program)) > 0
  );

  const handleFinish = async () => {
    if (!sessionId && !pendingChains.length) { showToast("Tick off at least one set first."); return; }
    setBusy(true);
    setError(null);
    try {
      // exercises with sets ticked but not finished are saved as they stand
      const sid = await ensureSession();
      const msgs = [];
      for (const chain of pendingChains) msgs.push(...(await commitChain(chain, sid)));
      const duration = sessionStart ? Math.round((Date.now() - sessionStart) / 1000) : null;
      await finishSession(sid, { recordSelections: records, durationSeconds: duration });
      clearLive(programId);
      setLive(emptyLive());
      sessionReq.current = null;
      showToast(msgs.length ? `Workout saved. ${msgs[msgs.length - 1]}` : "Workout saved. Well done.");
      setShowOverview(false);
      setTimeout(() => navigate("/workouts/history"), 900);
    } catch (e) {
      setError(e.message || "Could not save the workout.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecord = (sectionId, option, single) => {
    patchLive((l) => {
      const prev = l.records || {};
      const cur = prev[sectionId] || [];
      const next = single
        ? (cur.includes(option) ? [] : [option])
        : cur.includes(option) ? cur.filter((x) => x !== option) : [...cur, option];
      return { records: { ...prev, [sectionId]: next } };
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
  const chainById = (id) => program.chains.find((c) => c.id === id);
  const restTimer = (inline) => rest && (
    <WorkoutRestTimer
      inline={inline}
      rest={rest}
      onTogglePause={() => patchLive((l) => ({ rest: togglePause(l.rest) }))}
      onDismiss={() => patchLive({ rest: null })}
    />
  );
  const startDay = dayFilter !== "All" ? dayFilter : nextDayHint ?? dayLabels[0] ?? null;
  const startSections = (program.record_sections || []).filter((sec) => sectionPlacement(sec) === "start");
  const endSections = (program.record_sections || []).filter((sec) => sectionPlacement(sec) === "end");
  const recordCard = (sec) => (
    <div key={sec.id} className="fh-workout-card fh-workout-card--accent" style={{ "--w-accent": sec.color, marginTop: 14 }}>
      <div className="fh-workout-card__label" style={{ "--w-accent": sec.color, marginBottom: 9 }}>{sec.label}</div>
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
  );
  const startItems = buildRunItems(program, startDay);

  // ---- guided session ------------------------------------------------------
  if (inRun) {
    const itemLabel = (ids) => ids.map((id) => chainById(id)?.label).join(" + ");
    const elapsedHeader = (
      <div className="fh-workout-run__bar">
        <div>
          <div className="fh-workout-kicker">{run.day ? `Day ${run.day}` : program.name}</div>
          <Elapsed since={sessionStart} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={() => setShowOverview(true)}>
            Overview
          </button>
          {run.current != null && (
            <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={toSummary}>
              End workout
            </button>
          )}
        </div>
      </div>
    );
    const steps = (
      <ol className="fh-workout-run__steps">
        {startSections.length > 0 && (
          <li>
            <button
              data-state={!run.warmupDone && run.current != null ? "current" : "done"}
              onClick={() => patchLive((l) => ({ run: { ...l.run, warmupDone: false, current: l.run.current ?? nextOpenItem(l.run, -1) ?? 0 } }))}
              aria-label="Warm-up"
            >
              W
            </button>
          </li>
        )}
        {run.items.map((ids, i) => (
          <li key={i}>
            <button
              data-state={run.done.includes(i) ? "done" : i === run.current && (run.warmupDone || !startSections.length) ? "current" : "todo"}
              onClick={() => jumpTo(i)}
              aria-label={`${i + 1}. ${itemLabel(ids)}${run.done.includes(i) ? ", done" : ""}`}
            >
              {run.done.includes(i) ? "✓" : i + 1}
            </button>
          </li>
        ))}
      </ol>
    );

    if (run.current != null && !run.warmupDone && startSections.length) {
      return (
        <div className="fh-workout">
          <div className="fh-workout-shell">
            {elapsedHeader}
            {steps}
            <h1 style={{ margin: "10px 0 4px" }}>Warm up first</h1>
            <p className="fh-workout-card__sub">Tick what you did, then start the exercises.</p>
            {startSections.map(recordCard)}
            <button
              className="fh-workout-btn fh-workout-btn--primary fh-workout-btn--block"
              style={{ marginTop: 18 }}
              onClick={() => patchLive((l) => ({ run: { ...l.run, warmupDone: true } }))}
            >
              Start exercises
            </button>
          </div>
          {toast && <div className="fh-workout-toast">{toast}</div>}
        </div>
      );
    }

    if (run.current != null) {
      const ids = run.items[run.current];
      const nextIdx = nextOpenItem(run, run.current);
      return (
        <div className="fh-workout">
          <div className="fh-workout-shell">
            {error && <div className="fh-workout-alert fh-workout-alert--error">{error}</div>}
            <WorkoutLogger
              key={`${run.current}:${ids.join("+")}`}
              page
              header={
                <>
                  {elapsedHeader}
                  {steps}
                  <p className="fh-workout-run__count">
                    Exercise {run.current + 1} of {run.items.length}
                    {nextIdx != null && nextIdx !== run.current && ` · next: ${itemLabel(run.items[nextIdx])}`}
                  </p>
                </>
              }
              program={program}
              programId={programId}
              chains={ids.map(chainById)}
              progress={progress}
              drafts={drafts}
              busy={busy}
              timer={restTimer(true)}
              onDraft={setDraft}
              onTick={handleTick}
              onFinish={handleFinishExercise}
              onSkip={skipItem}
            />
          </div>
          {toast && <div className="fh-workout-toast">{toast}</div>}
        </div>
      );
    }

    // summary
    const log = run.log || [];
    const skipped = run.items.map((ids, i) => ({ ids, i })).filter(({ i }) => !run.done.includes(i));
    const totalSets = log.reduce((n, x) => n + x.sets, 0);
    const volume = log.reduce((n, x) => n + x.volume, 0);
    const minutes = sessionStart ? Math.max(1, Math.round((Date.now() - sessionStart) / 60000)) : null;
    return (
      <div className="fh-workout">
        <div className="fh-workout-shell">
          {elapsedHeader}
          <h1 style={{ margin: "10px 0 14px" }}>{skipped.length ? "Nearly there" : "Workout done"}</h1>
          {error && <div className="fh-workout-alert fh-workout-alert--error">{error}</div>}

          <div className="fh-workout-stat-row">
            {minutes != null && <div className="fh-workout-stat"><div className="val">{minutes}</div><div className="cap">{minutes === 1 ? "Minute" : "Minutes"}</div></div>}
            <div className="fh-workout-stat"><div className="val">{log.length}</div><div className="cap">Exercises</div></div>
            <div className="fh-workout-stat"><div className="val">{totalSets}</div><div className="cap">Sets</div></div>
            {volume > 0 && <div className="fh-workout-stat"><div className="val">{volume.toLocaleString("en-GB")}</div><div className="cap">kg lifted</div></div>}
          </div>

          {log.map((x) => (
            <div key={x.chainId} className="fh-workout-log-row">
              <span className="dot" style={{ background: x.advanced ? "var(--secondary)" : x.hitTarget ? "var(--success)" : "var(--ink-faint)" }} />
              <div className="body">
                <div className="name">{x.exercise}</div>
                <div className="meta">{x.sets} set{x.sets === 1 ? "" : "s"} · {x.message}</div>
              </div>
              {x.advanced && <span className="fh-workout-pill">level up</span>}
            </div>
          ))}

          {skipped.length > 0 && (
            <div className="fh-workout-card" style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 8 }}>Not done yet</h3>
              {skipped.map(({ ids, i }) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span>{itemLabel(ids)}</span>
                  <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={() => jumpTo(i)}>Do it now</button>
                </div>
              ))}
              <p className="fh-workout-card__sub" style={{ marginTop: 6 }}>Or save without them, that's fine too.</p>
            </div>
          )}

          {endSections.map(recordCard)}

          <button
            className="fh-workout-btn fh-workout-btn--gold fh-workout-btn--block"
            style={{ marginTop: 18 }}
            onClick={handleFinish}
            disabled={busy || (!sessionId && !pendingChains.length)}
          >
            {busy ? "Saving…" : "Save workout"}
          </button>
          {!sessionId && !pendingChains.length && (
            <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--block" style={{ marginTop: 8 }} onClick={() => { clearLive(programId); setLive(emptyLive()); }}>
              Nothing logged, discard
            </button>
          )}
        </div>
        {toast && <div className="fh-workout-toast">{toast}</div>}
      </div>
    );
  }

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

        {run ? (
          <div className="fh-workout-card fh-workout-run__start">
            <div>
              <h3>Workout in progress{run.day ? ` · Day ${run.day}` : ""}</h3>
              <p className="fh-workout-card__sub">{run.done.length} of {run.items.length} done</p>
            </div>
            <button className="fh-workout-btn fh-workout-btn--primary" onClick={() => setShowOverview(false)}>
              Resume
            </button>
          </div>
        ) : startItems.length > 0 && (
          <div className="fh-workout-card fh-workout-run__start">
            <div>
              <h3>{startDay ? `Day ${startDay}` : "Today's workout"}{startDay && startDay === nextDayHint ? " is up next" : ""}</h3>
              <p className="fh-workout-card__sub">
                {startSections.length > 0 && "Warm-up, then "}
                {startItems.length} exercise{startItems.length === 1 ? "" : "s"}, one at a time
                {endSections.length > 0 && ", then cool-down"}
              </p>
            </div>
            <button className="fh-workout-btn fh-workout-btn--primary" onClick={() => startRun(startDay)}>
              Start
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
                      drafts={drafts}
                      onLog={(group) => setLoggerIds(group.map((c) => c.id))}
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
              const ticked = doneCount(draftFor(drafts, chain, cur.idx, program));

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

                  <div className="fh-workout-exercise-name">{exercise.name}</div>
                  <div className="fh-workout-step">
                    {mode === "load"
                      ? <>target {describeTarget(target)} at {cur.loadKg ?? 0}kg</>
                      : <>step {cur.idx + 1} of {total} · target {describeTarget(target)}{maxed && " · top of the chain"}</>}
                  </div>
                  <ExerciseGuide key={`${chain.id}:${cur.idx}`} exercise={exercise} />

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
                    onClick={() => setLoggerIds([chain.id])}
                  >
                    {ticked > 0 ? `Carry on · ${ticked} of ${target.sets} done` : `Log ${logWord}`}
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
            disabled={busy || (!sessionId && !pendingChains.length)}
          >
            Finish and save workout
          </button>
          <button className="fh-workout-btn fh-workout-btn--ghost" onClick={() => navigate("/workouts/history")}>
            History
          </button>
        </div>
      </div>

      {loggerIds && (
        <WorkoutLogger
          key={loggerIds.join("+")}
          program={program}
          programId={programId}
          chains={loggerIds.map((id) => program.chains.find((c) => c.id === id))}
          progress={progress}
          drafts={drafts}
          busy={busy}
          timer={restTimer(true)}
          onDraft={setDraft}
          onTick={handleTick}
          onFinish={handleFinishExercise}
          onClose={() => setLoggerIds(null)}
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

      {!loggerIds && restTimer(false)}

      {toast && <div className="fh-workout-toast">{toast}</div>}
    </div>
  );
}

/* ========================================================================== */
/* Superset card                                                              */
/* ========================================================================== */

function SupersetCard({ program, group, progress, drafts, onLog }) {
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
        {group.some((c) => doneCount(draftFor(drafts, c, (progress[c.id] ?? { idx: 0 }).idx, program)) > 0)
          ? "Carry on with superset"
          : "Log superset"}
      </button>
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
/* Elapsed session time                                                       */
/* ========================================================================== */

function Elapsed({ since }) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return <div className="fh-workout-run__clock">0:00</div>;
  const secs = Math.max(0, Math.floor((Date.now() - since) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const ss = String(secs % 60).padStart(2, "0");
  return <div className="fh-workout-run__clock">{h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`}</div>;
}
