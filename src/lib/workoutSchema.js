// src/lib/workoutSchema.js
// Fearne Hub :: validate and normalise an uploaded workout program.
// Pure functions, no Supabase imports, so this is easy to unit test.

export const SCHEMA_VERSION = 1;
export const MAX_BYTES = 256 * 1024;

const ID_RE = /^[a-z0-9_]+$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#6abf69";

const clampInt = (v, lo, hi) => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return null;
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
  if (raw.schema_version !== SCHEMA_VERSION) {
    errors.push(`schema_version must be ${SCHEMA_VERSION} (got ${JSON.stringify(raw.schema_version)}).`);
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

      chains.push({
        id: ch.id,
        section,
        label,
        sub: typeof ch.sub === "string" ? ch.sub.trim() : "",
        color: pickColor(ch.color, where, warnings),
        rest_seconds: chainRest,          // null means inherit
        targets: chainTargets,            // null means inherit
        exercises,
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

function normaliseTargets(t, errors, where, required) {
  if (t == null) {
    if (required) errors.push(`${where} is required.`);
    return required ? { sets: 3, reps: 12, streak: 3 } : null;
  }
  if (typeof t !== "object" || Array.isArray(t)) {
    errors.push(`${where} must be an object.`);
    return required ? { sets: 3, reps: 12, streak: 3 } : null;
  }
  const sets = clampInt(t.sets, 1, 10);
  const reps = clampInt(t.reps, 1, 100);
  const streak = clampInt(t.streak, 1, 10);
  if (sets === null || reps === null || streak === null) {
    errors.push(`${where} needs numeric sets, reps and streak.`);
    return required ? { sets: 3, reps: 12, streak: 3 } : null;
  }
  return { sets, reps, streak };
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
      out.push({ name: nm.slice(0, 120), unit: "reps", reps: null, sets: null, note: "" });
      return;
    }

    if (!ex || typeof ex !== "object") {
      warnings.push(`${at} was not a string or object and was skipped.`);
      return;
    }

    const nm = typeof ex.name === "string" ? ex.name.trim() : "";
    if (!nm) { warnings.push(`${at} had no name and was skipped.`); return; }

    const unit = ex.unit === "seconds" ? "seconds" : "reps";
    out.push({
      name: nm.slice(0, 120),
      unit,
      reps: clampInt(ex.reps, 1, unit === "seconds" ? 3600 : 100),
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
// exercise -> chain -> program
export function effectiveTarget(program, chain, exercise) {
  const base = chain?.targets || program.targets;
  return {
    sets: exercise?.sets ?? base.sets,
    reps: exercise?.reps ?? base.reps,
    streak: base.streak,
    unit: exercise?.unit ?? "reps",
  };
}

export function effectiveRest(program, chain) {
  return chain?.rest_seconds ?? program.rest_seconds ?? 90;
}
