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
    .select("id, name, description, author_id, source, definition, created_at")
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
 */
export async function enrollInProgram(programId, startPositions = {}) {
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
    .select("chain_id, current_index, streak")
    .eq("user_id", user.id)
    .eq("program_id", programId);
  if (error) throw error;

  const map = {};
  (data ?? []).forEach((r) => {
    map[r.chain_id] = { idx: r.current_index, streak: r.streak };
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

// ---------------------------------------------------------------------------
// Logging sets, and the progression rule
// ---------------------------------------------------------------------------

/**
 * Log one exercise's sets and apply the progression rule.
 *
 * Rule: every set must meet the target amount, and there must be at least
 * `target.sets` of them. Do that `target.streak` workouts running and the
 * chain advances one rung. Any miss resets the streak to zero.
 *
 * @returns {{advanced: boolean, streak: number, newIndex: number, newExercise: object|null, hitTarget: boolean}}
 */
export async function logSet({ program, programId, chain, amounts, sessionId = null, currentIdx, currentStreak }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to be signed in.");

  const exercise = chain.exercises[currentIdx];
  const target = effectiveTarget(program.definition ?? program, chain, exercise);

  const clean = amounts.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v) && v >= 0);
  if (!clean.length) throw new Error("Enter at least one set.");

  const hitTarget = clean.length >= target.sets && clean.every((v) => v >= target.reps);

  let streak = hitTarget ? currentStreak + 1 : 0;
  let newIndex = currentIdx;
  let advanced = false;

  if (hitTarget && streak >= target.streak) {
    if (currentIdx < chain.exercises.length - 1) {
      newIndex = currentIdx + 1;
      advanced = true;
    }
    streak = 0;
  }

  const { error: setErr } = await supabase.from("workout_sets").insert({
    session_id: sessionId,
    user_id: user.id,
    program_id: programId,
    chain_id: chain.id,
    exercise_index: currentIdx,
    exercise_name: exercise.name,
    unit: target.unit,
    amounts: clean,
    hit_target: hitTarget,
    advanced,
  });
  if (setErr) throw setErr;

  const { error: progErr } = await supabase
    .from("workout_progress")
    .upsert(
      { user_id: user.id, program_id: programId, chain_id: chain.id, current_index: newIndex, streak },
      { onConflict: "user_id,program_id,chain_id" }
    );
  if (progErr) throw progErr;

  return {
    advanced,
    streak,
    newIndex,
    hitTarget,
    newExercise: advanced ? chain.exercises[newIndex] : null,
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
    .select("exercise_index, exercise_name, amounts, unit, hit_target, advanced, performed_at")
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
