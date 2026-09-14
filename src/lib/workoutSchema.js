// src/lib/workoutSchema.js
// Fearne Hub :: validate and normalise an uploaded workout program.
// Pure functions, no Supabase imports, so this is easy to unit test.

export const SCHEMA_VERSION = 2;
export const MAX_BYTES = 256 * 1024;

const ID_RE = /^[a-z0-9_]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#6abf69";
const PROGRESSION_MODES = new Set(["ladder", "load"]);

const clampInt = (v, lo, hi) => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};

const clampNumber = (v, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[], program: object|null }}
 */
export function validateProgram(raw) {
  const errors = [];
  const warnings = [];

  if (typeof raw === "string") {
    if (raw.length > MAX_BYTES) {
      return { ok: false, errors: [`File is too large (limit ${Math.round(MAX_BYTES / 1024)} KB).`], warnings, program: null };
    }
    try {
      raw = JSON.parse(raw);
    } catch (e) {
      return { ok: false, errors: [`Not valid JSON: ${e.message}`], warnings, program: null };
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["The file must contain a single JSON object."], warnings, program: null };
  }

  // ---- schema version -------------------------------------------------------
  if (raw.schema_version !== 1 && raw.schema_version !== 2) {
    errors.push(`schema_version must be 1 or 2 (got ${JSON.stringify(raw.schema_version)}).`);
  } else if (raw.schema_version === 1) {
    warnings.push("schema_version 1 was upgraded to 2 (rep ranges, load progression and per-side tracking are now available).");
  }

  // ---- name / description ---------------------------------------------------
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) errors.push("name is required.");
  else if (name.length > 120) errors.push("name must be 120 characters or fewer.");

  let description = typeof raw.description === "string" ? raw.description.trim() : "";
  if (description.length > 500) {
    description = description.slice(0, 500);
    warnings.push("description was truncated to 500 characters.");
  }

  // ---- targets --------------------------------------------------------------
  const targets = normaliseTargets(raw.targets, errors, "targets", true);

  // ---- rest / cadence -------------------------------------------------------
  let restSeconds = clampInt(raw.rest_seconds, 10, 600);
  if (raw.rest_seconds != null && restSeconds === null) {
    warnings.push("rest_seconds was not a number, defaulting to 90.");
  }
  if (restSeconds === null) restSeconds = 90;

  let sessionsPerWeek = clampInt(raw.sessions_per_week, 1, 7);
  if (sessionsPerWeek === null) sessionsPerWeek = 3;

  // ---- id uniqueness across chains + record sections ------------------------
  const seenIds = new Set();
  const claimId = (id, where) => {
    if (typeof id !== "string" || !ID_RE.test(id)) {
      errors.push(`${where}: id "${id}" must match a-z, 0-9 and underscores only.`);
      return false;
    }
    if (seenIds.has(id)) {
      errors.push(`${where}: duplicate id "${id}".`);
      return false;
    }
    seenIds.add(id);
    return true;
  };

  // ---- record sections ------------------------------------------------------
  const recordSections = [];
  if (raw.record_sections != null) {
    if (!Array.isArray(raw.record_sections)) {
      errors.push("record_sections must be an array.");
    } else {
      raw.record_sections.forEach((sec, i) => {
        const where = `record_sections[${i}]`;
        if (!sec || typeof sec !== "object") {
          errors.push(`${where} must be an object.`);
          return;
        }
        if (!claimId(sec.id, where)) return;

        const label = typeof sec.label === "string" ? sec.label.trim() : "";
        if (!label) { errors.push(`${where}: label is required.`); return; }

        const options = Array.isArray(sec.options)
          ? sec.options.filter(o => typeof o === "string" && o.trim()).map(o => o.trim()).slice(0, 40)
          : [];
        if (!options.length) { errors.push(`${where}: needs at least one option.`); return; }
        if (Array.isArray(sec.options) && sec.options.length > 40) {
          warnings.push(`${where}: only the first 40 options were kept.`);
        }

        recordSections.push({
          id: sec.id,
          label,
          color: pickColor(sec.color, where, warnings),
          select: sec.select === "single" ? "single" : "multi",
          options,
        });
      });
    }
  }

  // ---- chains ---------------------------------------------------------------
  const chains = [];
  if (!Array.isArray(raw.chains) || raw.chains.length === 0) {
    errors.push("chains must be a non-empty array.");
  } else {
    raw.chains.forEach((ch, i) => {
      const where = `chains[${i}]`;
      if (!ch || typeof ch !== "object") {
        errors.push(`${where} must be an object.`);
        return;
      }
      if (!claimId(ch.id, where)) return;

      const label = typeof ch.label === "string" ? ch.label.trim() : "";
      const section = typeof ch.section === "string" ? ch.section.trim() : "";
      if (!label) errors.push(`${where}: label is required.`);
      if (!section) errors.push(`${where}: section is required.`);

      const exercises = normaliseExercises(ch.exercises, where, errors, warnings);
      if (!exercises.length) return;

      let chainRest = clampInt(ch.rest_seconds, 10, 600);
      const chainTargets = ch.targets != null
        ? normaliseTargets(ch.targets, errors, `${where}.targets`, false)
        : null;

      const progression = normaliseProgression(ch.progression, where, warnings);

      let startLoadKg = clampNumber(ch.start_load_kg, 0, 500);
      if (startLoadKg === null) startLoadKg = 0;

      chains.push({
        id: ch.id,
        section,
        label,
        sub: typeof ch.sub === "string" ? ch.sub.trim() : "",
        color: pickColor(ch.color, where, warnings),
        rest_seconds: chainRest,          // null means inherit
        targets: chainTargets,            // null means inherit
        exercises,
        progression,                      // { mode: "ladder"|"load", incrementKg: number|null }
        per_side: ch.per_side === true,
        start_load_kg: startLoadKg,       // only meaningful in load mode
      });
    });
  }

  if (errors.length) return { ok: false, errors, warnings, program: null };

  return {
    ok: true,
    errors,
    warnings,
    program: {
      schema_version: SCHEMA_VERSION,
      name,
      description,
      author: typeof raw.author === "string" ? raw.author.trim().slice(0, 120) : "",
      sessions_per_week: sessionsPerWeek,
      rest_seconds: restSeconds,
      targets,
      record_sections: recordSections,
      chains,
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * `reps` can be a single number (repMin === repMax) or a { min, max } range,
 * so rep-range chains and plain single-target chains share one field.
 */
function normaliseRepRange(v, lo, hi, errors, where) {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") {
    const n = clampInt(v, lo, hi);
    if (n === null) return null;
    return { min: n, max: n };
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    const min = clampInt(v.min, lo, hi);
    const max = clampInt(v.max, lo, hi);
    if (min === null || max === null) return null;
    if (min > max) {
      errors.push(`${where}: reps.min must not be greater than reps.max.`);
      return null;
    }
    return { min, max };
  }
  return null;
}

function normaliseTargets(t, errors, where, required) {
  if (t == null) {
    if (required) errors.push(`${where} is required.`);
    return required ? { sets: 3, repMin: 12, repMax: 12, streak: 3 } : null;
  }
  if (typeof t !== "object" || Array.isArray(t)) {
    errors.push(`${where} must be an object.`);
    return required ? { sets: 3, repMin: 12, repMax: 12, streak: 3 } : null;
  }

  const sets = clampInt(t.sets, 1, 10);
  const range = normaliseRepRange(t.reps, 1, 100, errors, where);
  if (sets === null || range === null) {
    errors.push(`${where} needs a numeric sets and reps (or a reps.min/reps.max range).`);
    return required ? { sets: 3, repMin: 12, repMax: 12, streak: 3 } : null;
  }

  // A chain can override sets/reps but never streak: streak is always
  // resolved from the programme's top-level targets (see effectiveTarget).
  if (!required) return { sets, repMin: range.min, repMax: range.max };

  const streak = clampInt(t.streak, 1, 10);
  if (streak === null) {
    errors.push(`${where}.streak must be numeric (1-10).`);
    return { sets, repMin: range.min, repMax: range.max, streak: 3 };
  }
  return { sets, repMin: range.min, repMax: range.max, streak };
}

function normaliseProgression(p, where, warnings) {
  if (p == null) return { mode: "ladder", incrementKg: null };
  if (typeof p !== "object" || Array.isArray(p)) {
    warnings.push(`${where}.progression was not an object; using ladder mode.`);
    return { mode: "ladder", incrementKg: null };
  }

  let mode = "ladder";
  if (p.mode != null) {
    if (PROGRESSION_MODES.has(p.mode)) mode = p.mode;
    else warnings.push(`${where}.progression.mode "${p.mode}" is not recognised; using ladder.`);
  }
  if (mode !== "load") return { mode, incrementKg: null };

  let incrementKg = clampNumber(p.increment_kg, 0.25, 50);
  if (incrementKg === null) {
    incrementKg = 2.5;
    warnings.push(`${where}.progression.increment_kg was missing or invalid; defaulting to 2.5kg.`);
  }
  return { mode, incrementKg };
}

function normaliseExercises(list, where, errors, warnings) {
  if (!Array.isArray(list) || list.length === 0) {
    errors.push(`${where}: exercises must be a non-empty array.`);
    return [];
  }
  if (list.length > 80) warnings.push(`${where}: only the first 80 exercises were kept.`);

  const out = [];
  list.slice(0, 80).forEach((ex, j) => {
    const at = `${where}.exercises[${j}]`;

    if (typeof ex === "string") {
      const nm = ex.trim();
      if (!nm) { warnings.push(`${at} was blank and skipped.`); return; }
      out.push({ name: nm.slice(0, 120), unit: "reps", repMin: null, repMax: null, sets: null, note: "" });
      return;
    }

    if (!ex || typeof ex !== "object") {
      warnings.push(`${at} was not a string or object and was skipped.`);
      return;
    }

    const nm = typeof ex.name === "string" ? ex.name.trim() : "";
    if (!nm) { warnings.push(`${at} had no name and was skipped.`); return; }

    let unit = "reps";
    if (ex.unit === "seconds") {
      unit = "seconds";
    } else if (ex.unit === "weight") {
      // Load is tracked separately (per-chain progression), not as a third unit:
      // a weighted plank is still a seconds hold plus a load, not "weight" reps.
      unit = "reps";
      warnings.push(`${at}: unit "weight" isn't a unit here, load is tracked on the chain; using reps.`);
    }

    const hi = unit === "seconds" ? 3600 : 100;
    const range = ex.reps != null ? normaliseRepRange(ex.reps, 1, hi, errors, at) : null;
    if (ex.reps != null && range === null) {
      warnings.push(`${at}: reps override was invalid and was ignored.`);
    }

    out.push({
      name: nm.slice(0, 120),
      unit,
      repMin: range ? range.min : null,
      repMax: range ? range.max : null,
      sets: clampInt(ex.sets, 1, 10),
      note: typeof ex.note === "string" ? ex.note.trim().slice(0, 200) : "",
    });
  });

  if (!out.length) errors.push(`${where}: no usable exercises after validation.`);
  return out;
}

function pickColor(c, where, warnings) {
  if (typeof c === "string" && HEX_RE.test(c)) return c.toLowerCase();
  if (c != null) warnings.push(`${where}: colour "${c}" is not #rrggbb, using the default.`);
  return FALLBACK_COLOR;
}

// ---------------------------------------------------------------------------
// Resolve the effective target for a given exercise, walking the override chain:
// exercise -> chain -> program. Streak always comes from the programme's own
// targets: a chain can override sets/reps but never streak (see
// normaliseTargets), so reading it from `base` here would silently lose it
// whenever a chain provides its own targets override.
export function effectiveTarget(program, chain, exercise) {
  const base = chain?.targets || program.targets;
  return {
    sets: exercise?.sets ?? base.sets,
    repMin: exercise?.repMin ?? base.repMin,
    repMax: exercise?.repMax ?? base.repMax,
    streak: program.targets.streak,
    unit: exercise?.unit ?? "reps",
  };
}

export function effectiveRest(program, chain) {
  return chain?.rest_seconds ?? program.rest_seconds ?? 90;
}

/** Short human string for a resolved target, e.g. "3×5" or "3×6-8s". */
export function describeTarget(target) {
  const suffix = target.unit === "seconds" ? "s" : "";
  const repPart = target.repMin === target.repMax
    ? `${target.repMin}${suffix}`
    : `${target.repMin}-${target.repMax}${suffix}`;
  return `${target.sets}×${repPart}`;
}
