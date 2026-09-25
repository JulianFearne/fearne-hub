// src/lib/workoutApi.js
// Fearne Hub :: every Supabase call for the workout feature lives here.
// Pages import from this file only, so the query surface stays in one place.

import { supabase } from "../supabaseClient";
import { effectiveTarget } from "./workoutSchema";

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
 * Log one exercise's sets and apply the progression rule.
 *
 * Two thresholds, because rep ranges need both: `repMin` is the floor (any
 * set below it is a miss, streak resets to zero); `repMax` is the ceiling
 * (every set must reach it to bank a streak credit). Between the two the
 * session still counts (streak holds where it is).
 *
 * `amounts` is a flat array of set values for an ordinary chain, or
 * `{ left: [...], right: [...] }` when `chain.per_side` is true. Per side,
 * the weaker side gates progression: any miss on either side resets the
 * streak, and both sides must reach the ceiling to bank a credit. This is
 * deliberate (see docs/workout-handover.md) — do not change this to "either
 * side" without being asked.
 *
 * Completing the streak either advances the chain to the next exercise
 * (`progression.mode === "ladder"`) or adds `progression.incrementKg` to the
 * chain's working weight and stays on the same exercise (`"load"`).
 *
 * @returns {{advanced: boolean, streak: number, newIndex: number, newLoadKg: number|null,
 *            newExercise: object|null, hitTarget: boolean, allCeiling: boolean}}
 */
export async function logSet({ program, programId, chain, amounts, sessionId = null, currentIdx, currentStreak, currentLoadKg = null, rpe = null }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const exercise = chain.exercises[currentIdx];
  const target = effectiveTarget(program.definition ?? program, chain, exercise);
  const mode = chain.progression?.mode === "load" ? "load" : "ladder";

  const cleanSet = (arr) => (arr || []).map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v) && v >= 0);

  const sideOutcome = (clean) => {
    if (!clean.length) return null;
    const enoughSets = clean.length >= target.sets;
    const miss = !enoughSets || clean.some((v) => v < target.repMin);
    const ceiling = enoughSets && clean.every((v) => v >= target.repMax);
    return { clean, miss, ceiling };
  };

  // outcomes drive the streak/ceiling decision; insertRows is only the sides
  // that were actually logged (an untouched side gets no workout_sets row,
  // but still counts as a miss below - the weaker/missing side gates it)
  let outcomes;
  let insertRows;
  if (chain.per_side) {
    const left = sideOutcome(cleanSet(amounts?.left));
    const right = sideOutcome(cleanSet(amounts?.right));
    if (!left && !right) throw new Error("Enter at least one set for at least one side.");
    outcomes = [left ?? { miss: true, ceiling: false }, right ?? { miss: true, ceiling: false }];
    insertRows = [left && { side: "left", ...left }, right && { side: "right", ...right }].filter(Boolean);
  } else {
    const one = sideOutcome(cleanSet(amounts));
    if (!one) throw new Error("Enter at least one set.");
    outcomes = [one];
    insertRows = [{ side: null, ...one }];
  }

  const anyMiss = outcomes.some((r) => r.miss);
  const allCeiling = outcomes.every((r) => r.ceiling);
  const hitTarget = !anyMiss;

  let streak = anyMiss ? 0 : allCeiling ? currentStreak + 1 : currentStreak;
  let newIndex = currentIdx;
  let newLoadKg = currentLoadKg;
  let advanced = false;

  if (!anyMiss && allCeiling && streak >= target.streak) {
    if (mode === "load") {
      const inc = chain.progression?.incrementKg ?? 2.5;
      newLoadKg = Math.round(((currentLoadKg ?? 0) + inc) * 100) / 100;
      advanced = true;
    } else if (currentIdx < chain.exercises.length - 1) {
      newIndex = currentIdx + 1;
      advanced = true;
    }
    streak = 0;
  }

  // the weight actually lifted this session is the *current* working weight,
  // not the (possibly just-incremented) new one
  const loadForRow = mode === "load" ? currentLoadKg : null;
  const cleanRpe = clampRpe(rpe);

  const { error: setErr } = await supabase.from("workout_sets").insert(
    insertRows.map((r) => ({
      session_id: sessionId,
      user_id: user.id,
      program_id: programId,
      chain_id: chain.id,
      exercise_index: currentIdx,
      exercise_name: exercise.name,
      unit: target.unit,
      amounts: r.clean,
      side: r.side,
      load_kg: loadForRow,
      rpe: cleanRpe,
      hit_target: !r.miss,
      advanced,
    }))
  );
  if (setErr) throw setErr;

  const { error: progErr } = await supabase
    .from("workout_progress")
    .upsert(
      {
        user_id: user.id,
        program_id: programId,
        chain_id: chain.id,
        current_index: newIndex,
        streak,
        current_load_kg: mode === "load" ? newLoadKg : currentLoadKg,
      },
      { onConflict: "user_id,program_id,chain_id" }
    );
  if (progErr) throw progErr;

  return {
    advanced,
    streak,
    newIndex,
    newLoadKg,
    hitTarget,
    allCeiling,
    newExercise: advanced && mode === "ladder" ? chain.exercises[newIndex] : null,
  };
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
