// src/lib/workoutApi.js
// Fearne Hub :: every Supabase call for the workout feature lives here.
// Pages import from this file only, so the query surface stays in one place.

import { supabase } from "../supabaseClient";
import { effectiveTarget, cleanSets, judgeSide, decideProgression, mergeSplitSets } from "./workoutSchema";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user ?? null;
}

/** Can this person use the weight tracker? Adults and admins only. */
export async function canLogWeight() {
  const { data, error } = await supabase.rpc("is_adult");
  if (error) return false;
  return data === true;
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export async function listPrograms() {
  const { data, error } = await supabase
    .from("workout_programs")
    .select("id, name, description, author_id, source, definition, created_at, delete_requested_by, delete_requested_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getProgram(id) {
  const { data, error } = await supabase
    .from("workout_programs")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * @param {object} definition  output of validateProgram().program
 * @param {"builtin"|"custom"|"upload"} source
 */
export async function createProgram(definition, source = "custom") {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const { data, error } = await supabase
    .from("workout_programs")
    .insert({
      name: definition.name,
      description: definition.description || null,
      author_id: user.id,
      source,
      schema_version: definition.schema_version,
      definition,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProgram(id) {
  const { error } = await supabase.from("workout_programs").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Flag a programme for deletion without deleting it. Works on any
 * programme, including a builtin one or someone else's, since only an
 * admin can actually delete those - see request_program_delete() in
 * _reference/workout-schema-v4.sql.
 */
export async function requestDeleteProgram(id) {
  const { error } = await supabase.rpc("request_program_delete", { p_program_id: id });
  if (error) throw error;
}

/**
 * Insert the bundled calisthenics program once, if nobody has added it yet.
 * Safe to call on every load of the hub.
 */
export async function seedBuiltinProgram(builtinJson) {
  const { data: existing, error } = await supabase
    .from("workout_programs")
    .select("id")
    .eq("source", "builtin")
    .eq("name", builtinJson.name)
    .limit(1);
  if (error) throw error;
  if (existing && existing.length) return existing[0];
  return createProgram(builtinJson, "builtin");
}

// ---------------------------------------------------------------------------
// Enrolment: which program you currently have loaded
// ---------------------------------------------------------------------------

export async function getActiveEnrollment() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("workout_enrollments")
    .select("id, program_id, started_at, workout_programs(*)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Load a program against the signed-in profile.
 * @param {object} startPositions  optional { chainId: index } starting rungs
 * @param {object} startLoads      optional { chainId: kg } starting weights for load chains,
 *                                 falling back to the chain's own start_load_kg when omitted
 */
export async function enrollInProgram(programId, startPositions = {}, startLoads = {}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  // stand down any other active program
  await supabase
    .from("workout_enrollments")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("is_active", true);

  const { error: upErr } = await supabase
    .from("workout_enrollments")
    .upsert(
      { user_id: user.id, program_id: programId, is_active: true, started_at: new Date().toISOString() },
      { onConflict: "user_id,program_id" }
    );
  if (upErr) throw upErr;

  const program = await getProgram(programId);
  const rows = (program.definition.chains || []).map((c) => ({
    user_id: user.id,
    program_id: programId,
    chain_id: c.id,
    current_index: Number.isInteger(startPositions[c.id]) ? startPositions[c.id] : 0,
    streak: 0,
    current_load_kg: c.progression?.mode === "load"
      ? (Number.isFinite(Number(startLoads[c.id])) ? Number(startLoads[c.id]) : (c.start_load_kg ?? 0))
      : null,
  }));

  if (rows.length) {
    const { error } = await supabase
      .from("workout_progress")
      .upsert(rows, { onConflict: "user_id,program_id,chain_id" });
    if (error) throw error;
  }
  return program;
}

export async function leaveProgram(programId) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase
    .from("workout_enrollments")
    .update({ is_active: false })
    .eq("user_id", user.id)
    .eq("program_id", programId);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export async function getProgress(programId) {
  const user = await getCurrentUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from("workout_progress")
    .select("chain_id, current_index, streak, current_load_kg")
    .eq("user_id", user.id)
    .eq("program_id", programId);
  if (error) throw error;

  const map = {};
  (data ?? []).forEach((r) => {
    map[r.chain_id] = { idx: r.current_index, streak: r.streak, loadKg: r.current_load_kg };
  });
  return map;
}

export async function setChainPosition(programId, chainId, index) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const { error } = await supabase
    .from("workout_progress")
    .upsert(
      { user_id: user.id, program_id: programId, chain_id: chainId, current_index: index, streak: 0 },
      { onConflict: "user_id,program_id,chain_id" }
    );
  if (error) throw error;
}

/**
 * Drop a load chain's working weight after a bad run or a break, and reset
 * its streak. Fixed at 10%, rounded to the nearest half kilo.
 */
export async function deloadChain(programId, chainId, currentLoadKg, percent = 10) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const newLoadKg = Math.round((Number(currentLoadKg) || 0) * (1 - percent / 100) * 2) / 2;

  const { error } = await supabase
    .from("workout_progress")
    .upsert(
      { user_id: user.id, program_id: programId, chain_id: chainId, current_load_kg: newLoadKg, streak: 0 },
      { onConflict: "user_id,program_id,chain_id" }
    );
  if (error) throw error;
  return newLoadKg;
}

// ---------------------------------------------------------------------------
// Logging sets, and the progression rule
// ---------------------------------------------------------------------------

/** RPE (rate of perceived exertion), 1-10 in half-point steps. Optional. */
function clampRpe(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(10, Math.max(1, n)) * 2) / 2;
}

/**
 * Log one exercise (all the sets ticked off for it) and apply the
 * progression rule.
 *
 * Two thresholds, because rep ranges need both: `repMin` is the floor (any
 * set below it is a miss, streak resets to zero); `repMax` is the ceiling
 * (every set must reach it to bank a streak credit). Between the two the
 * session still counts (streak holds where it is). Which sets are judged is
 * decided by `judgeSide` in workoutSchema.js: drop sets below the working
 * weight, and sets beyond the prescribed number, are recorded but don't
 * count either way.
 *
 * `entry` is `{ sets: [{ amount, kg }] }` for an ordinary chain, or
 * `{ left: [...], right: [...] }` when `chain.per_side` is true. Per side,
 * the weaker side gates progression: any miss on either side resets the
 * streak, and both sides must reach the ceiling to bank a credit. This is
 * deliberate (see docs/workout-handover.md), do not change this to "either
 * side" without being asked.
 *
 * Completing the streak either advances the chain to the next exercise
 * (`progression.mode === "ladder"`) or adds `progression.incrementKg` to the
 * chain's working weight and stays on the same exercise (`"load"`).
 *
 * @returns {{advanced: boolean, streak: number, newIndex: number, newLoadKg: number|null,
 *            newExercise: object|null, hitTarget: boolean, allCeiling: boolean,
 *            migrationMissing: boolean}}
 */
export async function logSet({ program, programId, chain, entry, sessionId = null, currentIdx, currentStreak, currentLoadKg = null, rpe = null, note = null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const exercise = chain.exercises[currentIdx];
  const target = effectiveTarget(program.definition ?? program, chain, exercise);
  const mode = chain.progression?.mode === "load" ? "load" : "ladder";
  const judgeOpts = { mode, workingLoadKg: currentLoadKg };

  // outcomes drive the streak/ceiling decision; logged is only the sides
  // that were actually logged (an untouched side gets no workout_sets row,
  // but still counts as a miss - the weaker/missing side gates it)
  const sideList = chain.per_side
    ? [{ side: "left", sets: cleanSets(entry?.left) }, { side: "right", sets: cleanSets(entry?.right) }]
    : [{ side: null, sets: cleanSets(entry?.sets) }];
  const outcomes = sideList.map((s) => judgeSide(s.sets, target, judgeOpts));
  const logged = sideList.map((s, i) => ({ ...s, outcome: outcomes[i] })).filter((s) => s.sets.length);
  if (!logged.length) throw new Error("Tick off at least one set first.");

  const res = decideProgression({ outcomes, target, chain, currentIdx, currentStreak, currentLoadKg });

  // the weight actually lifted this session is the *current* working weight,
  // not the (possibly just-incremented) new one
  const loadForRow = mode === "load" ? currentLoadKg : null;
  const cleanRpe = clampRpe(rpe);
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

  const rows = logged.map((s, i) => ({
    session_id: sessionId,
    user_id: user.id,
    program_id: programId,
    chain_id: chain.id,
    exercise_index: currentIdx,
    exercise_name: exercise.name,
    unit: target.unit,
    amounts: s.sets.map((x) => x.amount),
    loads_kg: s.sets.some((x) => x.kg != null) ? s.sets.map((x) => x.kg) : null,
    note: i === 0 ? cleanNote : null,
    side: s.side,
    load_kg: loadForRow,
    rpe: cleanRpe,
    hit_target: !s.outcome.miss,
    advanced: res.advanced,
  }));

  // loads_kg and note arrive with workout-schema-v5.sql; until that's run,
  // save without them rather than lose the workout
  let migrationMissing = false;
  let { error: setErr } = await supabase.from("workout_sets").insert(rows);
  if (setErr && isMissingColumn(setErr, ["loads_kg", "note"])) {
    migrationMissing = true;
    ({ error: setErr } = await supabase
      .from("workout_sets")
      .insert(rows.map(({ loads_kg: _l, note: _n, ...rest }) => rest)));
  }
  if (setErr) throw setErr;

  const { error: progErr } = await supabase
    .from("workout_progress")
    .upsert(
      {
        user_id: user.id,
        program_id: programId,
        chain_id: chain.id,
        current_index: res.newIndex,
        streak: res.streak,
        current_load_kg: mode === "load" ? res.newLoadKg : currentLoadKg,
      },
      { onConflict: "user_id,program_id,chain_id" }
    );
  if (progErr) throw progErr;

  return {
    ...res,
    migrationMissing,
    newExercise: res.advanced && mode === "ladder" ? chain.exercises[res.newIndex] : null,
  };
}

function isMissingColumn(error, columns) {
  const msg = `${error?.message ?? ""} ${error?.details ?? ""}`;
  return columns.some((c) => msg.includes(`'${c}'`) || msg.includes(`"${c}"`));
}

/**
 * Recent entries for one chain, newest first: feeds the greyed "last time"
 * numbers and the past notes in the set logger.
 */
export async function getChainHistory(programId, chainId, limit = 60) {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .eq("chain_id", chainId)
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Tidying exercises that were saved in pieces
// ---------------------------------------------------------------------------

const localDay = (iso) => new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD
const splitKey = (r) => `${r.chain_id}|${r.exercise_index}|${r.side ?? ""}`;
const loadsOf = (r) => r.loads_kg ?? (r.amounts || []).map(() => r.load_kg ?? null);

/**
 * Days in the last few weeks where one exercise was saved as more than one
 * entry (the old logger saved a whole exercise per tap, so logging set by
 * set left it in pieces).
 * @returns {Promise<{ day: string, exercises: string[] }[]>}
 */
export async function listSplitDays(programId, days = 21) {
  const user = await getCurrentUser();
  if (!user || !programId) return [];

  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabase
    .from("workout_sets")
    .select("chain_id, exercise_index, exercise_name, side, performed_at")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .gte("performed_at", since);
  if (error) throw error;

  const counts = {};
  (data ?? []).forEach((r) => {
    const k = `${localDay(r.performed_at)}#${splitKey(r)}`;
    (counts[k] ||= { day: localDay(r.performed_at), name: r.exercise_name, n: 0 }).n += 1;
  });
  const byDay = {};
  Object.values(counts).filter((c) => c.n > 1).forEach((c) => {
    (byDay[c.day] ||= new Set()).add(c.name);
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, names]) => ({ day, exercises: [...names] }));
}

/**
 * Stitch one day's split entries back into one entry per exercise, pull the
 * day's sets into a single session, and re-run each affected chain's streak
 * so the misses the pieces caused are undone.
 */
export async function tidySplitDay(program, programId, day) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");
  const def = program.definition ?? program;

  // a generous window around the local day, then filter exactly
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from.getTime() + 864e5);
  const { data: all, error } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .gte("performed_at", from.toISOString())
    .lt("performed_at", to.toISOString())
    .order("performed_at", { ascending: true });
  if (error) throw error;
  const rows = (all ?? []).filter((r) => localDay(r.performed_at) === day);
  if (!rows.length) return { merged: 0 };

  // keep the day's finished session if there is one, else the earliest
  const sessionIds = [...new Set(rows.map((r) => r.session_id).filter(Boolean))];
  let keepSession = rows.find((r) => r.session_id)?.session_id ?? null;
  if (sessionIds.length > 1) {
    const { data: sess } = await supabase
      .from("workout_sessions")
      .select("id, duration_seconds, performed_at")
      .in("id", sessionIds)
      .order("performed_at", { ascending: true });
    keepSession = (sess || []).find((s) => s.duration_seconds != null)?.id ?? sess?.[0]?.id ?? keepSession;
  }

  const groups = {};
  rows.forEach((r) => (groups[splitKey(r)] ||= []).push(r));
  const hasLoadsColumn = "loads_kg" in rows[0];

  // delete first: if this account can't delete, stop before anything changes
  const doomed = Object.values(groups).filter((g) => g.length > 1).flatMap((g) => g.slice(1).map((r) => r.id));
  if (doomed.length) {
    const { data: gone, error: delErr } = await supabase.from("workout_sets").delete().in("id", doomed).select("id");
    if (delErr) throw delErr;
    if ((gone ?? []).length !== doomed.length) {
      throw new Error("Couldn't remove the split entries. Run _reference/workout-schema-v5.sql in Supabase first, then try again.");
    }
  }

  const touchedChains = new Set();
  for (const g of Object.values(groups)) {
    const first = g[0];
    const patch = { session_id: keepSession };
    if (g.length > 1) {
      touchedChains.add(first.chain_id);
      const chain = def.chains.find((c) => c.id === first.chain_id);
      const merged = mergeSplitSets(g.map((r) => ({ amounts: r.amounts, loads: loadsOf(r) })));
      patch.amounts = merged.amounts;
      if (hasLoadsColumn && merged.loads.some((v) => v != null)) patch.loads_kg = merged.loads;
      patch.advanced = g.some((r) => r.advanced);
      const notes = g.map((r) => r.note).filter(Boolean);
      if (hasLoadsColumn && notes.length) patch.note = notes.join(" · ").slice(0, 500);
      if (chain) {
        const target = effectiveTarget(def, chain, chain.exercises[first.exercise_index]);
        const mode = chain.progression?.mode === "load" ? "load" : "ladder";
        const sets = merged.amounts.map((amount, i) => ({ amount, kg: merged.loads[i] }));
        patch.hit_target = !judgeSide(sets, target, { mode, workingLoadKg: first.load_kg })?.miss;
      }
    } else if (first.session_id === keepSession) {
      continue;
    }
    const { error: upErr } = await supabase.from("workout_sets").update(patch).eq("id", first.id);
    if (upErr) throw upErr;
  }

  // sessions left empty by the move
  const emptied = sessionIds.filter((id) => id !== keepSession);
  if (emptied.length) await supabase.from("workout_sessions").delete().in("id", emptied);

  for (const chainId of touchedChains) {
    const chain = def.chains.find((c) => c.id === chainId);
    if (chain) await replayChainStreak(def, programId, chain);
  }
  return { merged: touchedChains.size };
}

/**
 * Rebuild a chain's streak from its logged entries since it last moved on,
 * using the same rule as logging. Used after tidying, where the pieces had
 * each been judged (and failed) as a whole exercise.
 */
async function replayChainStreak(def, programId, chain) {
  const user = await getCurrentUser();
  const mode = chain.progression?.mode === "load" ? "load" : "ladder";

  const { data: prog } = await supabase
    .from("workout_progress")
    .select("current_index, streak, current_load_kg")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .eq("chain_id", chain.id)
    .maybeSingle();
  let idx = prog?.current_index ?? 0;
  let loadKg = prog?.current_load_kg != null ? Number(prog.current_load_kg) : (chain.start_load_kg ?? null);

  const { data: rows, error } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .eq("chain_id", chain.id)
    .order("performed_at", { ascending: true });
  if (error) throw error;

  // one entry per session (or per row, for old session-less rows)
  const entries = [];
  const byKey = {};
  (rows ?? []).forEach((r) => {
    const k = `${r.session_id ?? r.id}|${r.exercise_index}`;
    if (!byKey[k]) { byKey[k] = { rows: [] }; entries.push(byKey[k]); }
    byKey[k].rows.push(r);
  });

  // only the run since the chain last moved on counts toward the streak
  let start = 0;
  entries.forEach((e, i) => {
    const r = e.rows[0];
    const moved = e.rows.some((x) => x.advanced) || r.exercise_index !== idx
      || (mode === "load" && loadKg != null && r.load_kg != null && Number(r.load_kg) !== loadKg);
    if (moved) start = i + 1;
  });

  const target = effectiveTarget(def, chain, chain.exercises[idx]);
  let streak = 0;
  for (const e of entries.slice(start)) {
    const side = (s) => e.rows.find((r) => (r.side ?? null) === s);
    const toSets = (r) => (r ? r.amounts.map((amount, i) => ({ amount, kg: loadsOf(r)[i] })) : []);
    const outcomes = (chain.per_side ? [side("left"), side("right")] : [side(null)])
      .map((r) => (r ? judgeSide(toSets(r), target, { mode, workingLoadKg: loadKg }) : null));
    const res = decideProgression({ outcomes, target, chain, currentIdx: idx, currentStreak: streak, currentLoadKg: loadKg });
    streak = res.streak;
    if (res.advanced) {
      idx = res.newIndex;
      loadKg = res.newLoadKg;
      await supabase.from("workout_sets").update({ advanced: true }).in("id", e.rows.map((r) => r.id));
    }
  }

  const { error: upErr } = await supabase
    .from("workout_progress")
    .upsert(
      { user_id: user.id, program_id: programId, chain_id: chain.id, current_index: idx, streak, current_load_kg: mode === "load" ? loadKg : prog?.current_load_kg ?? null },
      { onConflict: "user_id,program_id,chain_id" }
    );
  if (upErr) throw upErr;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function startSession(programId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({ user_id: user.id, program_id: programId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function finishSession(sessionId, { recordSelections = {}, durationSeconds = null, notes = null } = {}) {
  const { error } = await supabase
    .from("workout_sessions")
    .update({
      record_selections: recordSelections,
      duration_seconds: durationSeconds,
      notes,
    })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function listSessions(limit = 30) {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("id, performed_at, duration_seconds, record_selections, notes, program_id, workout_programs(name)")
    .eq("user_id", user.id)
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listSetsForSession(sessionId) {
  const { data, error } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("session_id", sessionId)
    .order("performed_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** History for one chain, oldest first, for the progression graph. */
export async function listSetsForChain(programId, chainId, limit = 100) {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workout_sets")
    .select("exercise_index, exercise_name, amounts, unit, hit_target, advanced, performed_at, load_kg, side, rpe")
    .eq("user_id", user.id)
    .eq("program_id", programId)
    .eq("chain_id", chainId)
    .order("performed_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Body weight
// ---------------------------------------------------------------------------

export async function listWeights(limit = 180) {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("body_weight_logs")
    .select("id, logged_on, weight_kg, note")
    .eq("user_id", user.id)
    .order("logged_on", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function logWeight(weightKg, loggedOn = null, note = null) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const kg = Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) {
    throw new Error("Enter a weight between 0 and 500 kg.");
  }

  const { data, error } = await supabase
    .from("body_weight_logs")
    .upsert(
      {
        user_id: user.id,
        logged_on: loggedOn || new Date().toISOString().slice(0, 10),
        weight_kg: kg,
        note,
      },
      { onConflict: "user_id,logged_on" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWeight(id) {
  const { error } = await supabase.from("body_weight_logs").delete().eq("id", id);
  if (error) throw error;
}
