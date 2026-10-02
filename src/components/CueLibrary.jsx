// src/components/CueLibrary.jsx
// The exercise cue library: every exercise the hub has cues for, A to Z and
// searchable, from the family's shared library (exercise_guides) and the
// cues built into the app. Opening one shows its cues; editing saves to the
// shared library, so every workout with that exercise picks up the change.
// "Add an exercise" puts a new one in for workouts still to come.

import { useState } from "react";
import { allGuides, guideKey } from "../data/exerciseGuides";
import { useSharedGuides, saveSharedGuides } from "../lib/sharedGuides";
import { GuideBody } from "./ExerciseGuide";

const PARTS = [
  { key: "setup", label: "Setup", hint: "Getting into position, one step per line" },
  { key: "cues", label: "Key cues", hint: "What to think about during each rep" },
  { key: "mistakes", label: "Watch out for", hint: "Common mistakes" },
];

export default function CueLibrary() {
  const shared = useSharedGuides();
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [editingKey, setEditingKey] = useState(null); // a key, or "new"
  const [message, setMessage] = useState(null);

  // shared entries win over built-in ones with the same name
  const entries = new Map();
  allGuides().forEach((g) => entries.set(g.key, { key: g.key, name: g.name, guide: g, source: "built-in" }));
  shared.forEach((v, key) => {
    const builtIn = entries.get(key);
    entries.set(key, {
      key,
      name: v.name,
      guide: { ...v.guide, focus: builtIn?.guide.focus },
      source: "family",
    });
  });

  const q = query.trim().toLowerCase();
  const list = [...entries.values()]
    .filter((e) => !q || e.name.toLowerCase().includes(q) || guideKey(e.name).includes(guideKey(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  const groups = [];
  list.forEach((e) => {
    const letter = /[a-z]/i.test(e.name[0]) ? e.name[0].toUpperCase() : "#";
    if (groups[groups.length - 1]?.letter !== letter) groups.push({ letter, items: [] });
    groups[groups.length - 1].items.push(e);
  });

  const familyCount = [...entries.values()].filter((e) => e.source === "family").length;

  const save = async (name, guide) => {
    setMessage(null);
    try {
      await saveSharedGuides([{ name, guide }]);
      setEditingKey(null);
      setOpenKey(guideKey(name));
      setMessage({ ok: true, text: `Saved. Every workout with ${name} now uses these cues.` });
    } catch (e) {
      setMessage({ ok: false, text: e.message });
    }
  };

  return (
    <div>
      <div className="fh-workout-card">
        <h2>Exercise cues</h2>
        <p className="fh-workout-card__sub" style={{ marginBottom: 12 }}>
          {entries.size} exercises{familyCount ? `, ${familyCount} with cues added by the family` : ""}. Any workout
          using one of these names shows its cues behind the "How to" button.
        </p>
        <label htmlFor="cue-search">Search</label>
        <input
          id="cue-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. squat, pull-up, plank"
        />
        <button
          className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
          style={{ marginTop: 10 }}
          onClick={() => { setEditingKey("new"); setMessage(null); }}
        >
          + Add an exercise
        </button>
      </div>

      {message && (
        <div className={`fh-workout-alert ${message.ok ? "fh-workout-alert--ok" : "fh-workout-alert--error"}`}>{message.text}</div>
      )}

      {editingKey === "new" && (
        <GuideEditor
          isNew
          initialName={query.trim()}
          onCancel={() => setEditingKey(null)}
          onSave={save}
          exists={(name) => entries.has(guideKey(name))}
        />
      )}

      {!list.length && <div className="fh-workout-empty">Nothing matches "{query}". Add it with "+ Add an exercise".</div>}

      {groups.map((g) => (
        <div key={g.letter}>
          <div className="fh-workout-section-heading">{g.letter}</div>
          {g.items.map((e) => {
            const open = openKey === e.key;
            return (
              <div key={e.key} className="fh-workout-cuelib__item">
                <button className="fh-workout-cuelib__head" onClick={() => setOpenKey(open ? null : e.key)} aria-expanded={open}>
                  <span>{e.name}</span>
                  {e.source === "family" && <span className="fh-workout-pill">family</span>}
                  <span aria-hidden="true">{open ? "▴" : "▾"}</span>
                </button>
                {open && editingKey !== e.key && (
                  <div className="fh-workout-cuelib__body">
                    <GuideBody guide={e.guide} />
                    <button
                      className="fh-workout-btn fh-workout-btn--ghost fh-workout-btn--sm"
                      style={{ marginTop: 8 }}
                      onClick={() => { setEditingKey(e.key); setMessage(null); }}
                    >
                      Edit cues
                    </button>
                  </div>
                )}
                {open && editingKey === e.key && (
                  <GuideEditor
                    initialName={e.name}
                    initial={e.guide}
                    onCancel={() => setEditingKey(null)}
                    onSave={save}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GuideEditor({ isNew = false, initialName = "", initial = null, exists, onCancel, onSave }) {
  const [name, setName] = useState(initialName);
  const [text, setText] = useState(() =>
    Object.fromEntries(PARTS.map((p) => [p.key, (initial?.[p.key] || []).join("\n")]))
  );
  const [saving, setSaving] = useState(false);
  const lines = (t) => t.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const guide = Object.fromEntries(PARTS.map((p) => [p.key, lines(text[p.key])]));
  const empty = PARTS.every((p) => !guide[p.key].length);
  const clash = isNew && name.trim() && exists?.(name);

  return (
    <div className="fh-workout-card fh-workout-cuelib__editor">
      {isNew ? (
        <>
          <label htmlFor="cue-name">Exercise name</label>
          <input id="cue-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Exactly as it appears in workouts" />
          {clash && <p className="fh-workout-card__sub" style={{ marginTop: 4 }}>That exercise already has cues: saving replaces them.</p>}
        </>
      ) : (
        <h3>{initialName}</h3>
      )}
      {PARTS.map((p) => (
        <div key={p.key} style={{ marginTop: 10 }}>
          <label htmlFor={`cue-${p.key}`}>{p.label}</label>
          <textarea
            id={`cue-${p.key}`}
            value={text[p.key]}
            placeholder={p.hint}
            onChange={(e) => setText((t) => ({ ...t, [p.key]: e.target.value }))}
            style={{ minHeight: 72, fontSize: 13 }}
          />
        </div>
      ))}
      <p className="fh-workout-card__sub" style={{ marginTop: 6 }}>
        Saved to the family's shared library: every workout with this exercise uses it, unless a programme brings its own.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button className="fh-workout-btn fh-workout-btn--ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button
          className="fh-workout-btn fh-workout-btn--primary"
          style={{ flex: 2 }}
          disabled={saving || empty || !name.trim()}
          onClick={async () => { setSaving(true); await onSave(name.trim(), guide); setSaving(false); }}
        >
          {saving ? "Saving…" : "Save cues"}
        </button>
      </div>
    </div>
  );
}
