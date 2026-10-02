// src/lib/workoutStats.js
// Fearne Hub :: turn logged workout_sets rows into per-chain progress
// summaries for the History dashboard. Pure, no Supabase.

const unitSuffix = (unit) => (unit === "seconds" ? "s" : unit === "metres" ? "m" : "");
const round05 = (n) => Math.round(n * 2) / 2;

/** Estimated one-rep max (Epley). Only meaningful for reps of 12 or fewer. */
export function estimateOneRepMax(kg, reps) {
  if (!kg || !reps || reps > 12) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

/** One entry per session for a chain, oldest first, both sides folded together. */
function sessionsOf(rows) {
  const byKey = new Map();
  rows.forEach((r) => {
    const k = r.session_id ?? r.id;
    if (!byKey.has(k)) byKey.set(k, { when: new Date(r.performed_at).getTime(), rows: [] });
    byKey.get(k).rows.push(r);
  });
  return [...byKey.values()].sort((a, b) => a.when - b.when);
}

const setsOf = (r) => (r.amounts || []).map((amount, i) => ({ amount, kg: r.loads_kg?.[i] ?? r.load_kg ?? null }));

/**
 * Summarise one chain's history.
 *
 * Load chains chart the heaviest weight lifted each session, and track the
 * best estimated one-rep max. Ladder chains chart which rung you're on; a
 * ladder that hasn't moved rung (or has only one) charts the best set
 * instead, so a plank still shows its seconds going up.
 *
 * @returns {null | { kind, start, now, delta, deltaUp, points, sessions, best, bestLabel, latestNote }}
 */
export function summariseChain(chain, rows) {
  if (!rows?.length) return null;
  const mode = chain.progression?.mode === "load" ? "load" : "ladder";
  const sessions = sessionsOf(rows);
  const unit = rows[rows.length - 1].unit;
  const sfx = unitSuffix(unit);

  if (mode === "load") {
    const points = sessions.map((s) => {
      const kgs = s.rows.flatMap(setsOf).map((x) => Number(x.kg)).filter((n) => Number.isFinite(n));
      return { x: s.when, y: kgs.length ? Math.max(...kgs) : 0, flag: s.rows.some((r) => r.advanced) };
    }).filter((p) => p.y > 0);
    if (!points.length) return null;
    let best = null;
    if (unit === "reps") {
      rows.flatMap(setsOf).forEach(({ amount, kg }) => {
        const e = estimateOneRepMax(Number(kg), amount);
        if (e && (!best || e > best)) best = e;
      });
    }
    const start = points[0].y;
    const now = points[points.length - 1].y;
    const d = round05(now - start);
    return {
      kind: "load",
      start: `${start}kg`,
      now: `${now}kg`,
      delta: d === 0 ? "no change yet" : `${d > 0 ? "+" : ""}${d}kg`,
      deltaUp: d > 0,
      points,
      sessions: sessions.length,
      best: best ? `${round05(best)}kg` : null,
      bestLabel: "best estimated max",
    };
  }

  const rungs = new Set(rows.map((r) => r.exercise_index));
  if (rungs.size > 1) {
    const points = sessions.map((s) => ({
      x: s.when,
      y: Math.max(...s.rows.map((r) => r.exercise_index)) + 1,
      flag: s.rows.some((r) => r.advanced),
      label: s.rows[0].exercise_name,
    }));
    const firstRow = sessions[0].rows[0];
    const lastRow = sessions[sessions.length - 1].rows[0];
    const climbed = lastRow.exercise_index - firstRow.exercise_index;
    const atCurrent = rows.filter((r) => r.exercise_index === lastRow.exercise_index).flatMap((r) => r.amounts);
    return {
      kind: "ladder",
      start: firstRow.exercise_name,
      now: lastRow.exercise_name,
      delta: climbed === 0 ? "same rung" : `${climbed > 0 ? "+" : ""}${climbed} rung${Math.abs(climbed) === 1 ? "" : "s"}`,
      deltaUp: climbed > 0,
      points,
      sessions: sessions.length,
      best: atCurrent.length ? `${Math.max(...atCurrent)}${sfx || " reps"}` : null,
      bestLabel: "best set on this rung",
    };
  }

  const points = sessions.map((s) => ({
    x: s.when,
    y: Math.max(...s.rows.flatMap((r) => r.amounts)),
    flag: s.rows.some((r) => r.advanced),
  }));
  const start = points[0].y;
  const now = points[points.length - 1].y;
  const d = now - start;
  return {
    kind: "amount",
    start: `${start}${sfx || " reps"}`,
    now: `${now}${sfx || " reps"}`,
    delta: d === 0 ? "no change yet" : `${d > 0 ? "+" : ""}${d}${sfx || " reps"}`,
    deltaUp: d > 0,
    points,
    sessions: sessions.length,
    best: `${Math.max(...points.map((p) => p.y))}${sfx || " reps"}`,
    bestLabel: "best set",
  };
}
