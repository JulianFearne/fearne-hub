// src/pages/WorkoutHub.jsx
// Phase 2 :: the workout front page. Choose, create or upload a program,
// then load it against your profile.

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { validateProgram } from "../lib/workoutSchema";
import {
  listPrograms,
  createProgram,
  deleteProgram,
  seedBuiltinProgram,
  getActiveEnrollment,
  enrollInProgram,
  getCurrentUser,
} from "../lib/workoutApi";
import builtinProgram from "../data/programs/calisthenics-bta.json";
import "../styles/workout.css";

const TABS = [
  { id: "library", label: "Choose a workout" },
  { id: "upload", label: "Upload JSON" },
  { id: "create", label: "Build your own" },
];

export default function WorkoutHub() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("library");
  const [programs, setPrograms] = useState([]);
  const [activeEnrollment, setActiveEnrollment] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [pendingProgram, setPendingProgram] = useState(null); // program awaiting start-position setup

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await getCurrentUser();
      setUserId(user?.id ?? null);
      try {
        await seedBuiltinProgram(builtinProgram);
      } catch {
        /* seeding is best-effort, never block the page */
      }
      const [list, enr] = await Promise.all([listPrograms(), getActiveEnrollment()]);
      setPrograms(list);
      setActiveEnrollment(enr);
    } catch (e) {
      setError(e.message || "Could not load workouts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleLoad = async (program, startPositions) => {
    try {
      await enrollInProgram(program.id, startPositions || {});
      navigate("/workouts/tracker");
    } catch (e) {
      setError(e.message || "Could not load that workout.");
    }
  };

  const handleDelete = async (program) => {
    if (!window.confirm(`Delete "${program.name}"? Everyone loses access to it.`)) return;
    try {
      await deleteProgram(program.id);
      showToast("Workout deleted.");
      refresh();
    } catch (e) {
      setError(e.message || "Could not delete that workout.");
    }
  };

  return (
    <div className="workout">
      <div className="workout-shell">
        <div className="workout-header">
          <div>
            <div className="workout-kicker">Fearne Hub</div>
            <h1>Workouts</h1>
            <p className="workout-sub">
              Pick a programme, upload one, or build your own. Your progress is tracked per person.
            </p>
          </div>
          {activeEnrollment && (
            <button className="workout-btn workout-btn--gold" onClick={() => navigate("/workouts/tracker")}>
              Continue →
            </button>
          )}
        </div>

        {error && <div className="workout-alert workout-alert--error">{error}</div>}

        <div className="workout-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="workout-tab"
              data-active={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="workout-empty"><span className="workout-spinner" /> Loading workouts…</div>
        ) : (
          <>
            {tab === "library" && (
              <Library
                programs={programs}
                userId={userId}
                activeProgramId={activeEnrollment?.program_id}
                onPick={setPendingProgram}
                onDelete={handleDelete}
              />
            )}
            {tab === "upload" && (
              <UploadPanel
                onSaved={(p) => { showToast("Workout added."); refresh(); setTab("library"); setPendingProgram(p); }}
              />
            )}
            {tab === "create" && (
              <BuilderPanel
                onSaved={(p) => { showToast("Workout created."); refresh(); setTab("library"); setPendingProgram(p); }}
              />
            )}
          </>
        )}
      </div>

      {pendingProgram && (
        <StartPositionModal
          program={pendingProgram}
          onCancel={() => setPendingProgram(null)}
          onConfirm={(positions) => handleLoad(pendingProgram, positions)}
        />
      )}

      {toast && <div className="workout-toast">{toast}</div>}
    </div>
  );
}

/* ========================================================================== */
/* Library                                                                     */
/* ========================================================================== */

function Library({ programs, userId, activeProgramId, onPick, onDelete }) {
  if (!programs.length) {
    return <div className="workout-empty">No workouts yet. Upload one or build your own.</div>;
  }

  return (
    <>
      {programs.map((p) => {
        const def = p.definition || {};
        const chains = def.chains?.length ?? 0;
        const steps = (def.chains || []).reduce((n, c) => n + (c.exercises?.length ?? 0), 0);
        const isActive = p.id === activeProgramId;
        const mine = p.author_id === userId;

        return (
          <div key={p.id} className="workout-card workout-program-card" onClick={() => onPick(p)}>
            <div className="workout-card__top">
              <div>
                <h2>{p.name}</h2>
                {p.description && <p className="workout-card__sub">{p.description}</p>}
              </div>
              {isActive && <span className="workout-pill workout-pill--active">Loaded</span>}
            </div>

            <div className="workout-program-meta">
              <span className="workout-pill">{chains} chains</span>
              <span className="workout-pill">{steps} steps</span>
              {def.targets && (
                <span className="workout-pill">
                  {def.targets.sets}×{def.targets.reps}, {def.targets.streak} in a row
                </span>
              )}
              {def.sessions_per_week && <span className="workout-pill">{def.sessions_per_week}/week</span>}
              {p.source === "builtin" && <span className="workout-pill">Built in</span>}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                className="workout-btn workout-btn--primary workout-btn--sm"
                onClick={(e) => { e.stopPropagation(); onPick(p); }}
              >
                {isActive ? "Reload" : "Load this"}
              </button>
              {mine && p.source !== "builtin" && (
                <button
                  className="workout-btn workout-btn--danger workout-btn--sm"
                  onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ========================================================================== */
/* Upload                                                                      */
/* ========================================================================== */

function UploadPanel({ onSaved }) {
  const [result, setResult] = useState(null);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const run = (text) => {
    setError(null);
    setRaw(text);
    setResult(validateProgram(text));
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    run(text);
  };

  const save = async () => {
    if (!result?.ok) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await createProgram(result.program, "upload");
      onSaved(saved);
      setResult(null);
      setRaw("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e.message || "Could not save that workout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workout-card">
      <h2>Upload a workout file</h2>
      <p className="workout-card__sub" style={{ marginBottom: 14 }}>
        JSON in the Fearne workout format. See docs/workout-program-format.md, or ask Claude to
        generate one using that spec.
      </p>

      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ marginBottom: 12 }} />

      <label htmlFor="wk-paste">Or paste it here</label>
      <textarea
        id="wk-paste"
        value={raw}
        onChange={(e) => run(e.target.value)}
        placeholder='{ "schema_version": 1, "name": "...", ... }'
        style={{ minHeight: 130, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
      />

      {error && <div className="workout-alert workout-alert--error" style={{ marginTop: 12 }}>{error}</div>}

      {result && !result.ok && (
        <div className="workout-alert workout-alert--error" style={{ marginTop: 12 }}>
          <strong>This file cannot be imported:</strong>
          <ul>{result.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {result?.warnings?.length > 0 && (
        <div className="workout-alert workout-alert--warn" style={{ marginTop: 12 }}>
          <strong>Imported with adjustments:</strong>
          <ul>{result.warnings.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      {result?.ok && (
        <>
          <div className="workout-alert workout-alert--ok" style={{ marginTop: 12 }}>
            <strong>{result.program.name}</strong> looks good: {result.program.chains.length} chains,{" "}
            {result.program.chains.reduce((n, c) => n + c.exercises.length, 0)} steps,{" "}
            {result.program.record_sections.length} tick-lists.
          </div>
          <button className="workout-btn workout-btn--primary workout-btn--block" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Add to the library"}
          </button>
        </>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Builder                                                                     */
/* ========================================================================== */

const blankChain = () => ({
  id: "",
  section: "",
  label: "",
  sub: "",
  color: "#1f3d2b",
  exercisesText: "",
});

function BuilderPanel({ onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(12);
  const [streak, setStreak] = useState(3);
  const [rest, setRest] = useState(90);
  const [perWeek, setPerWeek] = useState(3);
  const [chains, setChains] = useState([blankChain()]);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const patchChain = (i, patch) =>
    setChains((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const build = () => ({
    schema_version: 1,
    name: name.trim(),
    description: description.trim(),
    sessions_per_week: Number(perWeek),
    rest_seconds: Number(rest),
    targets: { sets: Number(sets), reps: Number(reps), streak: Number(streak) },
    record_sections: [],
    chains: chains.map((c) => ({
      id: c.id.trim() || slug(c.label),
      section: c.section.trim() || "General",
      label: c.label.trim(),
      sub: c.sub.trim(),
      color: c.color,
      exercises: c.exercisesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    })),
  });

  const check = () => {
    const r = validateProgram(build());
    setResult(r);
    return r;
  };

  const save = async () => {
    const r = check();
    if (!r.ok) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await createProgram(r.program, "custom");
      onSaved(saved);
    } catch (e) {
      setError(e.message || "Could not save that workout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="workout-card">
      <h2>Build a workout</h2>
      <p className="workout-card__sub" style={{ marginBottom: 16 }}>
        One chain per muscle pattern. List the exercises easiest first, one per line.
      </p>

      <label htmlFor="wk-name">Name</label>
      <input id="wk-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claire's morning routine" />

      <label htmlFor="wk-desc" style={{ marginTop: 12 }}>Description</label>
      <textarea id="wk-desc" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 56 }} />

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <NumField label="Sets" value={sets} onChange={setSets} min={1} max={10} />
        <NumField label="Reps" value={reps} onChange={setReps} min={1} max={100} />
        <NumField label="Streak" value={streak} onChange={setStreak} min={1} max={10} />
        <NumField label="Rest (s)" value={rest} onChange={setRest} min={10} max={600} />
        <NumField label="Per week" value={perWeek} onChange={setPerWeek} min={1} max={7} />
      </div>

      <div className="workout-section-heading">Chains</div>

      {chains.map((c, i) => (
        <div key={i} className="workout-card" style={{ background: "#faf7ef" }}>
          <div className="workout-card__top">
            <strong style={{ fontSize: 13 }}>Chain {i + 1}</strong>
            {chains.length > 1 && (
              <button
                className="workout-btn workout-btn--danger workout-btn--sm"
                onClick={() => setChains((p) => p.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label>Section</label>
              <input type="text" value={c.section} onChange={(e) => patchChain(i, { section: e.target.value })} placeholder="Push" />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label>Label</label>
              <input type="text" value={c.label} onChange={(e) => patchChain(i, { label: e.target.value })} placeholder="Pushups" />
            </div>
          </div>

          <label style={{ marginTop: 10 }}>Exercises, easiest first, one per line</label>
          <textarea
            value={c.exercisesText}
            onChange={(e) => patchChain(i, { exercisesText: e.target.value })}
            placeholder={"Wall pushups\nIncline pushup\nNormal pushup"}
            style={{ minHeight: 96, fontSize: 13 }}
          />
        </div>
      ))}

      <button
        className="workout-btn workout-btn--ghost workout-btn--block"
        onClick={() => setChains((p) => [...p, blankChain()])}
        style={{ marginBottom: 14 }}
      >
        + Add another chain
      </button>

      {error && <div className="workout-alert workout-alert--error">{error}</div>}

      {result && !result.ok && (
        <div className="workout-alert workout-alert--error">
          <strong>Not quite there:</strong>
          <ul>{result.errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}

      <button className="workout-btn workout-btn--primary workout-btn--block" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Create workout"}
      </button>
    </div>
  );
}

function NumField({ label, value, onChange, min, max }) {
  return (
    <div style={{ width: 84 }}>
      <label>{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ textAlign: "center" }}
      />
    </div>
  );
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "chain";
}

/* ========================================================================== */
/* Start position modal                                                        */
/* ========================================================================== */

function StartPositionModal({ program, onCancel, onConfirm }) {
  const def = program.definition || program;
  const chains = def.chains || [];
  const [positions, setPositions] = useState(() => Object.fromEntries(chains.map((c) => [c.id, 0])));
  const [openChain, setOpenChain] = useState(chains[0]?.id ?? null);

  return (
    <div className="workout-overlay" onClick={onCancel}>
      <div className="workout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workout-kicker">Starting point</div>
        <h2 style={{ marginBottom: 4 }}>{def.name}</h2>
        <p className="workout-card__sub" style={{ marginBottom: 16 }}>
          You do not have to start at the bottom. Pick the hardest version you can already do
          comfortably in each chain.
        </p>

        {chains.map((c) => {
          const isOpen = openChain === c.id;
          const cur = positions[c.id] ?? 0;
          return (
            <div key={c.id} className="workout-card" style={{ background: "#fffdf7", marginBottom: 8 }}>
              <div
                className="workout-card__top"
                style={{ cursor: "pointer", marginBottom: isOpen ? 10 : 0 }}
                onClick={() => setOpenChain(isOpen ? null : c.id)}
              >
                <div>
                  <div className="workout-card__label" style={{ "--w-accent": c.color }}>{c.label}</div>
                  <div className="workout-card__sub">{c.exercises[cur]?.name ?? c.exercises[cur]}</div>
                </div>
                <span className="workout-pill">{isOpen ? "close" : `${cur + 1}/${c.exercises.length}`}</span>
              </div>

              {isOpen && (
                <div className="workout-ladder">
                  {c.exercises.map((ex, i) => {
                    const nm = ex?.name ?? ex;
                    const state = i === cur ? "current" : i < cur ? "done" : "todo";
                    return (
                      <button
                        key={i}
                        data-state={state}
                        onClick={() => setPositions((p) => ({ ...p, [c.id]: i }))}
                      >
                        <span className="idx">{i + 1}</span>
                        <span style={{ flex: 1 }}>{nm}</span>
                        {ex?.unit === "seconds" && <span className="workout-pill">hold</span>}
                        {i === cur && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="workout-btn workout-btn--ghost" style={{ flex: 1 }} onClick={onCancel}>
            Cancel
          </button>
          <button className="workout-btn workout-btn--primary" style={{ flex: 2 }} onClick={() => onConfirm(positions)}>
            Load and start
          </button>
        </div>
      </div>
    </div>
  );
}
