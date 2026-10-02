// src/components/WorkoutLogger.jsx
// The set logger. Sets are ticked off one at a time as they're done, each
// with its own weight; last time's numbers sit greyed in every empty box
// (falling back to the set above, then the target), and ticking an empty set
// takes them as they are. Nothing reaches the database
// until "Finish exercise", so the streak is judged once, on the whole
// exercise. Ticks live in the tracker's on-device draft, so closing this (or
// the page) keeps them.
//
// A superset passes several chains: ticking a set on one moves straight to
// the next, and the rest only starts after the last one in the round.

import { useState, useEffect } from "react";
import { effectiveTarget, describeTarget, judgeSide } from "../lib/workoutSchema";
import { getChainHistory } from "../lib/workoutApi";
import { primeBeep } from "../lib/workoutLive";

const blankRow = () => ({ kg: "", a: "", l: "", r: "", done: false });

/** A chain's draft, or a fresh one if there isn't one for its current rung. */
export function draftFor(drafts, chain, idx, program) {
  const d = drafts?.[chain.id];
  if (d && d.idx === idx) return d;
  const target = effectiveTarget(program, chain, chain.exercises[idx]);
  return { idx, rows: Array.from({ length: target.sets }, blankRow), note: "", rpe: "" };
}

export const doneCount = (draft) => (draft?.rows || []).filter((r) => r.done).length;

/** Turn a draft's ticked rows into the `entry` logSet expects. */
export function entryFromDraft(chain, draft) {
  const done = draft.rows.filter((r) => r.done);
  const kg = (r) => (r.kg === "" ? null : r.kg);
  if (chain.per_side) {
    return {
      left: done.filter((r) => r.l !== "").map((r) => ({ amount: r.l, kg: kg(r) })),
      right: done.filter((r) => r.r !== "").map((r) => ({ amount: r.r, kg: kg(r) })),
    };
  }
  return { sets: done.map((r) => ({ amount: r.a, kg: kg(r) })) };
}

const fmtDay = (iso) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** From newest-first history rows: last session's sets at this rung, and past notes. */
function digestHistory(rows, idx) {
  const atRung = rows.filter((r) => r.exercise_index === idx);
  const lastKey = atRung[0] ? (atRung[0].session_id ?? atRung[0].id) : null;
  const lastRows = atRung.filter((r) => (r.session_id ?? r.id) === lastKey);
  const sideSets = (side) => {
    const r = lastRows.find((x) => (x.side ?? null) === side);
    if (!r) return [];
    return r.amounts.map((amount, i) => ({ amount, kg: r.loads_kg?.[i] ?? r.load_kg ?? null }));
  };
  const notes = rows
    .filter((r) => r.note)
    .slice(0, 6)
    .map((r) => ({ id: r.id, when: r.performed_at, text: r.note, exercise: r.exercise_name }));
  return {
    last: lastRows.length ? { when: lastRows[0].performed_at, single: sideSets(null), left: sideSets("left"), right: sideSets("right") } : null,
    notes,
  };
}

export default function WorkoutLogger({
  program, programId, chains, progress, drafts, busy, timer,
  onDraft, onTick, onFinish, onClose,
}) {
  const [tab, setTab] = useState(0);
  const [history, setHistory] = useState({}); // chainId -> digest

  useEffect(() => {
    let cancelled = false;
    chains.forEach(async (c) => {
      try {
        const rows = await getChainHistory(programId, c.id);
        const idx = (progress[c.id] ?? { idx: 0 }).idx;
        if (!cancelled) setHistory((h) => ({ ...h, [c.id]: digestHistory(rows, idx) }));
      } catch {
        if (!cancelled) setHistory((h) => ({ ...h, [c.id]: { last: null, notes: [] } }));
      }
    });
    return () => { cancelled = true; };
    // only on open: progress changes after finishing, by which point this has closed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chain = chains[Math.min(tab, chains.length - 1)];
  const cur = progress[chain.id] ?? { idx: 0, streak: 0, loadKg: chain.start_load_kg ?? 0 };
  const exercise = chain.exercises[cur.idx];
  const target = effectiveTarget(program, chain, exercise);
  const mode = chain.progression?.mode === "load" ? "load" : "ladder";
  const workingKg = mode === "load" ? (cur.loadKg ?? 0) : null;
  const draft = draftFor(drafts, chain, cur.idx, program);
  const hist = history[chain.id];
  const unitWord = target.unit === "seconds" ? "secs" : target.unit === "metres" ? "metres" : "reps";

  const setDraft = (patch) => onDraft(chain.id, { ...draft, ...patch });
  const setRow = (i, patch) => setDraft({ rows: draft.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  // greyed values: last session's numbers for this set, and the working
  // weight for the prescribed sets (it may have gone up since last time)
  const ghost = (i) => {
    const prevRow = draft.rows[i - 1];
    const lastKg = hist?.last?.single?.[i]?.kg ?? hist?.last?.left?.[i]?.kg;
    const kg = mode !== "load"
      ? ""
      : i < target.sets
        ? workingKg
        : lastKg ?? (prevRow ? (prevRow.kg !== "" ? prevRow.kg : ghost(i - 1).kg) : workingKg);
    // reps: last time's for this set, else the set above's, else the top of
    // the target range, so every set can be ticked in one tap
    const amount = (field, lastSets) => {
      const fromLast = lastSets?.[i]?.amount;
      if (fromLast != null) return fromLast;
      if (prevRow) return prevRow[field] !== "" ? prevRow[field] : ghost(i - 1)[field];
      return target.repMax ?? "";
    };
    return {
      kg: kg ?? "",
      a: amount("a", hist?.last?.single),
      l: amount("l", hist?.last?.left),
      r: amount("r", hist?.last?.right),
    };
  };

  const valueOr = (v, g) => (v !== "" && v != null ? String(v) : g !== "" && g != null ? String(g) : "");

  const tick = (i) => {
    primeBeep();
    const row = draft.rows[i];
    if (row.done) { setRow(i, { done: false }); return; }
    const g = ghost(i);
    const filled = {
      kg: mode === "load" ? valueOr(row.kg, g.kg) : row.kg,
      a: valueOr(row.a, g.a),
      l: valueOr(row.l, g.l),
      r: valueOr(row.r, g.r),
    };
    const ok = chain.per_side ? filled.l !== "" || filled.r !== "" : filled.a !== "";
    if (!ok) return;
    setRow(i, { ...filled, done: true });

    const isLastOfRound = tab >= chains.length - 1;
    if (!isLastOfRound) setTab(tab + 1);
    else if (chains.length > 1) setTab(0);
    onTick({ chain, isLastOfRound });
  };

  const canTick = (i) => {
    const row = draft.rows[i];
    if (row.done) return true;
    const g = ghost(i);
    return chain.per_side ? valueOr(row.l, g.l) !== "" || valueOr(row.r, g.r) !== "" : valueOr(row.a, g.a) !== "";
  };

  const addSet = () => setDraft({ rows: [...draft.rows, blankRow()] });
  const removeSet = (i) => setDraft({ rows: draft.rows.filter((_, j) => j !== i) });

  // how the ticked sets stand against the target, for the hint line
  const done = doneCount(draft);
  const entry = entryFromDraft(chain, draft);
  const judged = chain.per_side
    ? [judgeSide(entry.left, target, { mode, workingLoadKg: workingKg }), judgeSide(entry.right, target, { mode, workingLoadKg: workingKg })]
    : [judgeSide(entry.sets, target, { mode, workingLoadKg: workingKg })];
  const willMiss = judged.some((o) => !o || o.miss);
  const willCeiling = judged.every((o) => o?.ceiling);

  const anyDone = chains.some((c) => doneCount(draftFor(drafts, c, (progress[c.id] ?? { idx: 0 }).idx, program)) > 0);

  const lastSummary = (() => {
    const l = hist?.last;
    if (!l) return null;
    const fmt = (sets) => sets.map((s) => (s.kg != null && mode === "load" ? `${s.amount}×${s.kg}kg` : s.amount)).join(", ");
    const body = chain.per_side ? `L ${fmt(l.left) || "none"} · R ${fmt(l.right) || "none"}` : fmt(l.single);
    return `Last time (${fmtDay(l.when)}): ${body}`;
  })();

  return (
    <div className="fh-workout-overlay" onClick={onClose}>
      <div className="fh-workout-modal fh-workout-logger" onClick={(e) => e.stopPropagation()}>
        <div className="fh-workout-logger__head">
          <div className="fh-workout-kicker" style={{ color: chain.color }}>
            {chain.section} · {chain.label}
          </div>
          <button className="fh-workout-logger__close" onClick={onClose} aria-label="Close, keeping your ticked sets">×</button>
        </div>

        {chains.length > 1 && (
          <div className="fh-workout-tabs" style={{ marginTop: 8 }}>
            {chains.map((c, i) => {
              const n = doneCount(draftFor(drafts, c, (progress[c.id] ?? { idx: 0 }).idx, program));
              return (
                <button key={c.id} className="fh-workout-tab" data-active={i === tab} onClick={() => setTab(i)}>
                  {c.label}{n > 0 && ` · ${n}`}
                </button>
              );
            })}
          </div>
        )}

        <h2 style={{ margin: "6px 0 3px" }}>{exercise.name}</h2>
        <p className="fh-workout-card__sub">
          Target {describeTarget(target)}
          {mode === "load" && ` at ${workingKg}kg`}
          {` · ${done} of ${target.sets} done`}
        </p>
        {lastSummary && <p className="fh-workout-logger__last">{lastSummary}</p>}

        {timer}

        <div className="fh-workout-setlist">
          <div className="fh-workout-setrow fh-workout-setrow--head" data-weight={mode === "load"} data-sides={!!chain.per_side}>
            <span>Set</span>
            {mode === "load" && <span>kg</span>}
            {chain.per_side ? <><span>Left</span><span>Right</span></> : <span>{unitWord}</span>}
            <span />
          </div>
          {draft.rows.map((row, i) => {
            const g = ghost(i);
            const extra = i >= target.sets;
            const input = (field, label) => (
              <input
                type="number"
                min="0"
                step={field === "kg" ? "0.5" : "1"}
                inputMode={field === "kg" ? "decimal" : "numeric"}
                aria-label={`Set ${i + 1} ${label}`}
                placeholder={g[field] === "" ? "" : String(g[field])}
                value={row[field]}
                disabled={row.done}
                onChange={(e) => setRow(i, { [field]: e.target.value })}
              />
            );
            return (
              <div
                key={i}
                className="fh-workout-setrow"
                data-done={row.done}
                data-weight={mode === "load"}
                data-sides={!!chain.per_side}
              >
                <span className="fh-workout-setrow__n">
                  {i + 1}
                  {extra && !row.done && (
                    <button className="fh-workout-setrow__remove" onClick={() => removeSet(i)} aria-label={`Remove set ${i + 1}`}>×</button>
                  )}
                </span>
                {mode === "load" && input("kg", "weight in kg")}
                {chain.per_side ? <>{input("l", `left ${unitWord}`)}{input("r", `right ${unitWord}`)}</> : input("a", unitWord)}
                <button
                  className="fh-workout-setrow__tick"
                  data-done={row.done}
                  onClick={() => tick(i)}
                  disabled={!canTick(i)}
                  aria-label={row.done ? `Untick set ${i + 1}` : `Tick off set ${i + 1}`}
                >
                  ✓
                </button>
              </div>
            );
          })}
          <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={addSet}>
            + Add set{mode === "load" ? " (drop set)" : ""}
          </button>
        </div>

        {done > 0 && done < target.sets && (
          <p className="fh-workout-card__sub" style={{ marginBottom: 12 }}>
            {target.sets - done} to go. Greyed numbers are last time's: tick an empty set to use them.
          </p>
        )}
        {done >= target.sets && (
          <div className={`fh-workout-alert ${willMiss ? "fh-workout-alert--warn" : "fh-workout-alert--ok"}`}>
            {willMiss
                ? "Below target, so the streak resets. Still worth logging."
                : willCeiling
                  ? mode === "load"
                    ? "At the top of the range. Keep this up and the weight goes up."
                    : "That hits the target. One more step toward levelling up."
                  : "Between the two, so this counts and the streak holds where it is."}
          </div>
        )}

        <label htmlFor="ex-note">Notes</label>
        <textarea
          id="ex-note"
          rows={2}
          maxLength={500}
          placeholder="e.g. did 4 negatives, left knee niggly"
          value={draft.note}
          onChange={(e) => setDraft({ note: e.target.value })}
        />
        {hist?.notes?.length > 0 && (
          <ul className="fh-workout-notes">
            {hist.notes.map((n) => (
              <li key={n.id}>
                <span className="when">{fmtDay(n.when)}{n.exercise !== exercise.name ? ` · ${n.exercise}` : ""}</span>
                {n.text}
              </li>
            ))}
          </ul>
        )}

        <div style={{ maxWidth: 140, margin: "12px 0" }}>
          <label htmlFor="rpe">RPE (optional)</label>
          <input
            id="rpe"
            type="number"
            min="1"
            max="10"
            step="0.5"
            inputMode="decimal"
            placeholder="1-10"
            value={draft.rpe}
            onChange={(e) => setDraft({ rpe: e.target.value })}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="fh-workout-btn fh-workout-btn--ghost" style={{ flex: 1 }} onClick={onClose}>
            Close
          </button>
          <button
            className="fh-workout-btn fh-workout-btn--primary"
            style={{ flex: 2 }}
            onClick={onFinish}
            disabled={busy || !anyDone}
          >
            {busy ? "Saving…" : chains.length > 1 ? "Finish superset" : "Finish exercise"}
          </button>
        </div>
      </div>
    </div>
  );
}
