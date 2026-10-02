// src/components/WorkoutBuilder.jsx
// "Build your own" form. Covers everything the upload format can express:
// rep ranges, ladder or weight progression, per-side chains, days,
// supersets, units, rest and set/rep overrides, warm-up and cool-down
// tick-lists and a deload schedule. It can start blank or from a copy of an
// existing programme (`seed`, in the file format from toProgramFile), and
// anything per-exercise it has no field for (rep overrides, form videos) is
// carried over untouched for any exercise line that keeps its name. Each
// exercise can carry its own how-to cues (`guide`), edited in ChainCues.

import { useState, useId } from "react";
import { validateProgram } from "../lib/workoutSchema";
import { createProgram } from "../lib/workoutApi";
import { guideFor } from "../data/exerciseGuides";

const PALETTE = ["#7a2e4e", "#1f3d2b", "#e8743b", "#3b9ee8", "#9b51e0", "#c9a227", "#2a9d8f", "#d1495b"];

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const repsOf = (r) => (r == null ? { min: "", max: "" } : typeof r === "object" ? { min: r.min, max: r.max } : { min: r, max: r });
const numOrNull = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

const blankChain = (i = 0) => ({
  key: Math.random().toString(36).slice(2),
  id: "",
  section: "",
  label: "",
  sub: "",
  color: PALETTE[i % PALETTE.length],
  day: "",
  superset: "",
  mode: "ladder",
  incrementKg: 2.5,
  startKg: 20,
  perSide: false,
  unit: "reps",
  rest: "",
  sets: "",
  repMin: "",
  repMax: "",
  exercisesText: "",
  extras: {},
});

const blankSection = (when = "start") => ({
  key: Math.random().toString(36).slice(2),
  id: "",
  label: when === "start" ? "Warm-up" : "Cool-down",
  when,
  select: "multi",
  color: when === "start" ? "#c9a227" : "#2a9d8f",
  optionsText: "",
});

/** Programme file (documented format) -> form state. */
function fromFile(file) {
  const r = repsOf(file.targets?.reps);
  return {
    name: file.name ? `${file.name} (copy)` : "",
    description: file.description ?? "",
    author: file.author ?? "",
    sets: file.targets?.sets ?? 3,
    repMin: r.min === "" ? 8 : r.min,
    repMax: r.max === "" ? 12 : r.max,
    streak: file.targets?.streak ?? 3,
    rest: file.rest_seconds ?? 90,
    perWeek: file.sessions_per_week ?? 3,
    days: (file.days || []).join(", "),
    deloadEvery: file.deload?.every_weeks ?? "",
    deloadPercent: file.deload?.percent ?? 10,
    sections: (file.record_sections || []).map((s) => ({
      ...blankSection(s.when ?? "start"),
      id: s.id,
      label: s.label,
      when: s.when ?? "",
      select: s.select ?? "multi",
      color: s.color ?? "#c9a227",
      optionsText: (s.options || []).join("\n"),
    })),
    chains: (file.chains || []).map((c, i) => {
      const exs = (c.exercises || []).map((e) => (typeof e === "string" ? { name: e } : e));
      const units = exs.map((e) => e.unit ?? "reps");
      const unit = units.sort((a, b) => units.filter((u) => u === b).length - units.filter((u) => u === a).length)[0] ?? "reps";
      const extras = {};
      exs.forEach(({ name, note: _note, unit: u, ...rest }) => {
        const keep = { ...rest, ...(u && u !== unit ? { unit: u } : {}) };
        if (Object.keys(keep).length) extras[name] = keep;
      });
      const cr = repsOf(c.targets?.reps);
      return {
        ...blankChain(i),
        id: c.id,
        section: c.section ?? "",
        label: c.label ?? "",
        sub: c.sub ?? "",
        color: c.color ?? PALETTE[i % PALETTE.length],
        day: c.day ?? "",
        superset: c.superset_group ?? "",
        mode: c.progression?.mode === "load" ? "load" : "ladder",
        incrementKg: c.progression?.increment_kg ?? 2.5,
        startKg: c.start_load_kg ?? 20,
        perSide: !!c.per_side,
        unit,
        rest: c.rest_seconds ?? "",
        sets: c.targets?.sets ?? "",
        repMin: cr.min,
        repMax: cr.max,
        exercisesText: exs.map((e) => (e.note ? `${e.name} | ${e.note}` : e.name)).join("\n"),
        extras,
      };
    }),
  };
}

const blankForm = () => ({
  name: "",
  description: "",
  sets: 3,
  repMin: 8,
  repMax: 12,
  streak: 3,
  rest: 90,
  perWeek: 3,
  days: "",
  deloadEvery: "",
  deloadPercent: 10,
  sections: [blankSection("start"), blankSection("end")],
  chains: [blankChain(0)],
});

/** Form state -> programme file, for validateProgram. */
function toFile(f) {
  const range = (min, max) => {
    const a = numOrNull(min), b = numOrNull(max ?? min);
    if (a == null && b == null) return null;
    const lo = a ?? b, hi = b ?? a;
    return lo === hi ? lo : { min: lo, max: hi };
  };
  const usedIds = new Set();
  const uniqueId = (wanted, fallback) => {
    let base = slug(wanted) || fallback, id = base, n = 2;
    while (usedIds.has(id)) id = `${base}_${n++}`;
    usedIds.add(id);
    return id;
  };
  const days = f.days.split(",").map((d) => d.trim()).filter(Boolean);

  return {
    schema_version: 2,
    name: f.name.trim(),
    description: f.description.trim(),
    ...(f.author ? { author: f.author } : {}),
    sessions_per_week: Number(f.perWeek),
    rest_seconds: Number(f.rest),
    targets: { sets: Number(f.sets), reps: range(f.repMin, f.repMax), streak: Number(f.streak) },
    ...(days.length ? { days } : {}),
    ...(numOrNull(f.deloadEvery) ? { deload: { every_weeks: Number(f.deloadEvery), percent: Number(f.deloadPercent) || 10 } } : {}),
    record_sections: f.sections
      .filter((s) => s.label.trim() && s.optionsText.trim())
      .map((s) => ({
        id: uniqueId(s.id || s.label, "list"),
        label: s.label.trim(),
        color: s.color,
        select: s.select,
        ...(s.when ? { when: s.when } : {}),
        options: s.optionsText.split("\n").map((o) => o.trim()).filter(Boolean),
      })),
    chains: f.chains.map((c, i) => {
      const reps = range(c.repMin, c.repMax);
      return {
        id: uniqueId(c.id || c.label, `chain_${i + 1}`),
        section: c.section.trim() || "General",
        label: c.label.trim(),
        ...(c.sub.trim() ? { sub: c.sub.trim() } : {}),
        color: c.color,
        ...(c.day ? { day: c.day } : {}),
        ...(c.superset.trim() ? { superset_group: slug(c.superset) } : {}),
        ...(numOrNull(c.rest) ? { rest_seconds: Number(c.rest) } : {}),
        ...(numOrNull(c.sets) && reps != null ? { targets: { sets: Number(c.sets), reps } } : {}),
        progression: c.mode === "load" ? { mode: "load", increment_kg: Number(c.incrementKg) || 2.5 } : { mode: "ladder" },
        ...(c.mode === "load" ? { start_load_kg: Number(c.startKg) || 0 } : {}),
        ...(c.perSide ? { per_side: true } : {}),
        exercises: c.exercisesText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [name, ...noteParts] = line.split("|");
            const nm = name.trim();
            const note = noteParts.join("|").trim();
            const extra = c.extras[nm] || {};
            return { name: nm, unit: extra.unit ?? c.unit, ...extra, ...(note ? { note } : {}) };
          }),
      };
    }),
  };
}

export default function WorkoutBuilder({ seed = null, onSaved }) {
  const [form, setForm] = useState(() => (seed ? fromFile(seed) : blankForm()));
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => (seed ? null : 0)); // which chain card is expanded

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const patchChain = (i, patch) => set({ chains: form.chains.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const patchSection = (i, patch) => set({ sections: form.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveChain = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= form.chains.length) return;
    const next = [...form.chains];
    [next[i], next[j]] = [next[j], next[i]];
    set({ chains: next });
    setOpen(j);
  };
  const dayOptions = form.days.split(",").map((d) => d.trim()).filter(Boolean);

  const save = async () => {
    const r = validateProgram(toFile(form));
    setResult(r);
    if (!r.ok) return;
    setSaving(true);
    setError(null);
    try {
      onSaved(await createProgram(r.program, "custom"));
    } catch (e) {
      setError(e.message || "Could not save that workout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fh-workout-card fh-workout-builder">
      <h2>{seed ? "Edit a copy" : "Build a workout"}</h2>
      <p className="fh-workout-card__sub" style={{ marginBottom: 16 }}>
        {seed
          ? "Saved as a new programme, so the original and anyone using it are untouched."
          : "One chain per movement. A ladder moves to the next exercise when you hit the target; a weight chain adds weight instead."}
      </p>

      <label htmlFor="wk-name">Name</label>
      <input id="wk-name" type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Morning strength" />

      <label htmlFor="wk-desc" style={{ marginTop: 12 }}>Description</label>
      <textarea id="wk-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} style={{ minHeight: 56 }} />

      <div className="fh-workout-section-heading">Default target</div>
      <div className="fh-workout-builder__row">
        <Num label="Sets" value={form.sets} onChange={(v) => set({ sets: v })} min={1} max={10} />
        <Num label="Reps from" value={form.repMin} onChange={(v) => set({ repMin: v })} min={1} max={100} />
        <Num label="Reps to" value={form.repMax} onChange={(v) => set({ repMax: v })} min={1} max={100} />
        <Num label="In a row" value={form.streak} onChange={(v) => set({ streak: v })} min={1} max={10} />
        <Num label="Rest (s)" value={form.rest} onChange={(v) => set({ rest: v })} min={10} max={600} />
        <Num label="Per week" value={form.perWeek} onChange={(v) => set({ perWeek: v })} min={1} max={7} />
      </div>
      <p className="fh-workout-card__sub">
        Every set at the top of the range, {form.streak} workouts running, moves a chain on. A set below the bottom resets it.
      </p>

      <div className="fh-workout-builder__row" style={{ marginTop: 12 }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label htmlFor="wk-days">Days (optional)</label>
          <input id="wk-days" type="text" value={form.days} onChange={(e) => set({ days: e.target.value })} placeholder="A, B" />
        </div>
        <Num label="Deload every (weeks)" value={form.deloadEvery} onChange={(v) => set({ deloadEvery: v })} min={2} max={12} placeholder="off" wide />
        {numOrNull(form.deloadEvery) && (
          <Num label="Deload % lighter" value={form.deloadPercent} onChange={(v) => set({ deloadPercent: v })} min={5} max={50} wide />
        )}
      </div>

      <div className="fh-workout-section-heading">Chains</div>
      {form.chains.map((c, i) => {
        const isOpen = open === i;
        const count = c.exercisesText.split("\n").filter((l) => l.trim()).length;
        return (
          <div key={c.key} className="fh-workout-builder__chain" style={{ "--w-accent": c.color }}>
            <button className="fh-workout-builder__chain-head" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
              <span>
                <strong>{c.label || `Chain ${i + 1}`}</strong>
                <span className="fh-workout-card__sub">
                  {" "}· {c.mode === "load" ? "weight" : "ladder"} · {count} exercise{count === 1 ? "" : "s"}
                  {c.day ? ` · day ${c.day}` : ""}{c.superset ? ` · superset ${c.superset}` : ""}
                </span>
              </span>
              <span aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
            </button>

            {isOpen && (
              <div className="fh-workout-builder__chain-body">
                <div className="fh-workout-builder__row">
                  <Text label="Name" value={c.label} onChange={(v) => patchChain(i, { label: v })} placeholder="Squat" />
                  <Text label="Section" value={c.section} onChange={(v) => patchChain(i, { section: v })} placeholder="Legs" />
                </div>
                <Text label="Subtitle (optional)" value={c.sub} onChange={(v) => patchChain(i, { sub: v })} placeholder="Back squat, to parallel" />

                <label style={{ marginTop: 10 }}>Colour</label>
                <div className="fh-workout-builder__swatches">
                  {PALETTE.map((col) => (
                    <button
                      key={col}
                      style={{ background: col }}
                      data-on={c.color === col}
                      aria-label={`Colour ${col}`}
                      onClick={() => patchChain(i, { color: col })}
                    />
                  ))}
                </div>

                <label style={{ marginTop: 10 }}>Progression</label>
                <div className="fh-workout-chips">
                  <button className="fh-workout-chip" data-on={c.mode === "ladder"} onClick={() => patchChain(i, { mode: "ladder" })}>
                    Ladder: next exercise
                  </button>
                  <button className="fh-workout-chip" data-on={c.mode === "load"} onClick={() => patchChain(i, { mode: "load" })}>
                    Weight: add kg
                  </button>
                </div>
                {c.mode === "load" && (
                  <div className="fh-workout-builder__row" style={{ marginTop: 8 }}>
                    <Num label="Start kg" value={c.startKg} onChange={(v) => patchChain(i, { startKg: v })} min={0} max={500} step="0.5" />
                    <Num label="Add kg" value={c.incrementKg} onChange={(v) => patchChain(i, { incrementKg: v })} min={0.25} max={50} step="0.25" />
                  </div>
                )}

                <div className="fh-workout-builder__row" style={{ marginTop: 10 }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label>Measured in</label>
                    <select aria-label="Measured in" value={c.unit} onChange={(e) => patchChain(i, { unit: e.target.value })}>
                      <option value="reps">Reps</option>
                      <option value="seconds">Seconds (holds)</option>
                      <option value="metres">Metres (carries)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label>Day</label>
                    <select aria-label="Day" value={c.day} onChange={(e) => patchChain(i, { day: e.target.value })} disabled={!dayOptions.length}>
                      <option value="">Every day</option>
                      {dayOptions.map((d) => <option key={d} value={d}>Day {d}</option>)}
                    </select>
                  </div>
                </div>

                <label className="fh-workout-builder__check">
                  <input type="checkbox" checked={c.perSide} onChange={(e) => patchChain(i, { perSide: e.target.checked })} />
                  Log left and right separately (single arm or leg)
                </label>

                <div className="fh-workout-builder__row">
                  <Text label="Superset with (optional)" value={c.superset} onChange={(v) => patchChain(i, { superset: v })} placeholder="e.g. a1: same name on both" />
                  <Num label="Rest (s)" value={c.rest} onChange={(v) => patchChain(i, { rest: v })} min={10} max={600} placeholder={String(form.rest)} />
                </div>
                <div className="fh-workout-builder__row">
                  <Num label="Sets" value={c.sets} onChange={(v) => patchChain(i, { sets: v })} min={1} max={10} placeholder={String(form.sets)} />
                  <Num label={`${c.unit === "reps" ? "Reps" : c.unit === "seconds" ? "Secs" : "Metres"} from`} value={c.repMin} onChange={(v) => patchChain(i, { repMin: v })} min={1} max={5000} placeholder={String(form.repMin)} />
                  <Num label="to" value={c.repMax} onChange={(v) => patchChain(i, { repMax: v })} min={1} max={5000} placeholder={String(form.repMax)} />
                </div>
                <p className="fh-workout-card__sub">Leave sets and reps blank to use the default target.</p>

                <label style={{ marginTop: 10 }}>
                  {c.mode === "load" ? "Exercise (usually just one)" : "Exercises, easiest first, one per line"}
                </label>
                <textarea
                  aria-label="Exercises"
                  value={c.exercisesText}
                  onChange={(e) => patchChain(i, { exercisesText: e.target.value })}
                  placeholder={c.mode === "load" ? "Back squat | Bar on upper back, to parallel" : "Wall push-up\nIncline push-up\nKneeling push-up | Hips in line\nPush-up"}
                  style={{ minHeight: 110, fontSize: 13 }}
                />
                <p className="fh-workout-card__sub">Add a tip after a bar: <code>Name | tip</code>.</p>

                <ChainCues
                  chain={c}
                  onExtras={(name, patch) =>
                    patchChain(i, { extras: { ...c.extras, [name]: { ...(c.extras[name] || {}), ...patch } } })}
                />

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={() => moveChain(i, -1)} disabled={i === 0}>Move up</button>
                  <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={() => moveChain(i, 1)} disabled={i === form.chains.length - 1}>Move down</button>
                  {form.chains.length > 1 && (
                    <button
                      className="fh-workout-btn fh-workout-btn--danger fh-workout-btn--sm"
                      onClick={() => { set({ chains: form.chains.filter((_, j) => j !== i) }); setOpen(null); }}
                    >
                      Remove chain
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--block"
        onClick={() => { set({ chains: [...form.chains, blankChain(form.chains.length)] }); setOpen(form.chains.length); }}
        style={{ marginBottom: 14 }}
      >
        + Add a chain
      </button>

      <div className="fh-workout-section-heading">Tick-lists</div>
      <p className="fh-workout-card__sub" style={{ marginBottom: 8 }}>
        Things to tick off rather than track: warm-up moves at the start of a session, cool-down stretches at the end.
        Lists with no items are left out.
      </p>
      {form.sections.map((sec, i) => (
        <div key={sec.key} className="fh-workout-builder__chain" style={{ "--w-accent": sec.color }}>
          <div className="fh-workout-builder__chain-body">
            <div className="fh-workout-builder__row">
              <Text label="Heading" value={sec.label} onChange={(v) => patchSection(i, { label: v })} />
              <div style={{ flex: 1, minWidth: 120 }}>
                <label>Shown</label>
                <select aria-label="Shown" value={sec.when} onChange={(e) => patchSection(i, { when: e.target.value })}>
                  <option value="start">At the start</option>
                  <option value="end">At the end</option>
                  <option value="">Guess from the heading</option>
                </select>
              </div>
            </div>
            <label className="fh-workout-builder__check">
              <input type="checkbox" checked={sec.select === "single"} onChange={(e) => patchSection(i, { select: e.target.checked ? "single" : "multi" })} />
              Pick one only
            </label>
            <label>Items, one per line</label>
            <textarea
              aria-label="Items"
              value={sec.optionsText}
              onChange={(e) => patchSection(i, { optionsText: e.target.value })}
              placeholder={sec.when === "end" ? "Hamstring stretch\nChild's pose" : "Brisk walk, 2 min\nHip circles\nArm circles"}
              style={{ minHeight: 80, fontSize: 13 }}
            />
            <button
              className="fh-workout-btn fh-workout-btn--danger fh-workout-btn--sm"
              style={{ marginTop: 8 }}
              onClick={() => set({ sections: form.sections.filter((_, j) => j !== i) })}
            >
              Remove list
            </button>
          </div>
        </div>
      ))}
      <button
        className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--block"
        onClick={() => set({ sections: [...form.sections, { ...blankSection("end"), label: "" }] })}
        style={{ marginBottom: 14 }}
      >
        + Add a tick-list
      </button>

      {error && <div className="fh-workout-alert fh-workout-alert--error">{error}</div>}
      {result && !result.ok && (
        <div className="fh-workout-alert fh-workout-alert--error">
          <strong>Not quite there:</strong>
          <ul>{result.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {result?.ok && result.warnings.length > 0 && (
        <div className="fh-workout-alert fh-workout-alert--warn">
          <ul>{result.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      <button className="fh-workout-btn fh-workout-btn--primary fh-workout-btn--block" onClick={save} disabled={saving}>
        {saving ? "Saving…" : seed ? "Save as a new workout" : "Create workout"}
      </button>
    </div>
  );
}

/* ---- how-to cues per exercise ------------------------------------------ */

const GUIDE_PARTS = [
  { key: "setup", label: "Setup", hint: "Getting into position, one step per line" },
  { key: "cues", label: "Key cues", hint: "What to think about during each rep" },
  { key: "mistakes", label: "Watch out for", hint: "Common mistakes" },
];

function ChainCues({ chain, onExtras }) {
  const [editing, setEditing] = useState(null);
  const [resets, setResets] = useState(0); // remounts the boxes when cues are filled or cleared from outside
  const names = [...new Set(
    chain.exercisesText.split("\n").map((l) => l.split("|")[0].trim()).filter(Boolean)
  )];
  if (!names.length) return null;

  const setPart = (name, key, text) => {
    const guide = { setup: [], cues: [], mistakes: [], ...(chain.extras[name]?.guide || {}) };
    guide[key] = text.split("\n").map((x) => x.trim()).filter(Boolean);
    const empty = !guide.setup.length && !guide.cues.length && !guide.mistakes.length;
    onExtras(name, { guide: empty ? undefined : guide });
  };

  return (
    <div className="fh-workout-builder__cues">
      <label>How-to cues</label>
      <p className="fh-workout-card__sub" style={{ marginBottom: 6 }}>
        Shown behind each exercise's "How to" button. Exercises the hub already knows have built-in cues; anything
        written here replaces them. Cues follow the exercise's name, so renaming a line starts it fresh.
      </p>
      {names.map((name) => {
        const own = chain.extras[name]?.guide;
        const builtIn = guideFor(name);
        const open = editing === name;
        const textOf = (key) => (own?.[key] || []).join("\n");
        return (
          <div key={name} className="fh-workout-builder__cue">
            <div className="fh-workout-builder__cue-head">
              <span>{name}</span>
              <span className="fh-workout-pill">{own ? "your cues" : builtIn ? "built-in cues" : "no cues yet"}</span>
              <button className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm" onClick={() => setEditing(open ? null : name)}>
                {open ? "Done" : own ? "Edit cues" : "Write cues"}
              </button>
            </div>
            {open && (
              <div style={{ marginTop: 8 }}>
                {!own && builtIn && (
                  <button
                    className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
                    style={{ marginBottom: 8 }}
                    onClick={() => { onExtras(name, { guide: { setup: builtIn.setup, cues: builtIn.cues, mistakes: builtIn.mistakes } }); setResets((n) => n + 1); }}
                  >
                    Start from the built-in cues
                  </button>
                )}
                {GUIDE_PARTS.map((part) => (
                  <div key={part.key} style={{ marginBottom: 8 }}>
                    <label>{part.label}</label>
                    <LinesBox
                      key={`${part.key}:${resets}`}
                      label={`${name}: ${part.label}`}
                      initial={textOf(part.key)}
                      placeholder={part.hint}
                      onLines={(text) => setPart(name, part.key, text)}
                    />
                  </div>
                ))}
                {own && (
                  <button className="fh-workout-btn fh-workout-btn--danger fh-workout-btn--sm" onClick={() => { onExtras(name, { guide: undefined }); setResets((n) => n + 1); }}>
                    Remove my cues{builtIn ? " (use the built-in ones)" : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A textarea of lines that keeps what you type (blank lines and all) while it's open. */
function LinesBox({ label, initial, placeholder, onLines }) {
  const [text, setText] = useState(initial);
  return (
    <textarea
      aria-label={label}
      value={text}
      placeholder={placeholder}
      onChange={(e) => { setText(e.target.value); onLines(e.target.value); }}
      style={{ minHeight: 64, fontSize: 13 }}
    />
  );
}

function Num({ label, value, onChange, min, max, step = "1", placeholder, wide = false }) {
  const id = useId();
  return (
    <div style={{ width: wide ? 130 : 84 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ textAlign: "center" }}
      />
    </div>
  );
}

function Text({ label, value, onChange, placeholder }) {
  const id = useId();
  return (
    <div style={{ flex: 1, minWidth: 130 }}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export { fromFile, toFile };
