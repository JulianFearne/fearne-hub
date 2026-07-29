// src/pages/WorkoutHistory.jsx
// Phase 5 :: session history, per-chain progression, and the weight tracker.
// Charts are hand-rolled SVG so this page adds no new dependencies.

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getActiveEnrollment,
  listSessions,
  listSetsForSession,
  listSetsForChain,
  listWeights,
  logWeight,
  deleteWeight,
  canLogWeight,
} from "../lib/workoutApi";
import "../styles/workout.css";

const TABS = [
  { id: "sessions", label: "Sessions" },
  { id: "progress", label: "Progress" },
  { id: "weight", label: "Weight" },
];

export default function WorkoutHistory() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("sessions");
  const [program, setProgram] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const enr = await getActiveEnrollment();
        if (enr) {
          setProgram(enr.workout_programs.definition);
          setProgramId(enr.workout_programs.id);
        }
      } catch (e) {
        setError(e.message || "Could not load your workout.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="workout">
      <div className="workout-shell">
        <div className="workout-header">
          <div>
            <div className="workout-kicker">Fearne Hub</div>
            <h1>Your history</h1>
            <p className="workout-sub">Everything you have logged, and how it is trending.</p>
          </div>
          <button className="workout-btn workout-btn--ghost workout-btn--sm" onClick={() => navigate("/workouts/tracker")}>
            Back to tracker
          </button>
        </div>

        {error && <div className="workout-alert workout-alert--error">{error}</div>}

        <div className="workout-tabs">
          {TABS.map((t) => (
            <button key={t.id} className="workout-tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="workout-empty"><span className="workout-spinner" /> Loading…</div>
        ) : (
          <>
            {tab === "sessions" && <SessionsPanel />}
            {tab === "progress" && <ProgressPanel program={program} programId={programId} />}
            {tab === "weight" && <WeightPanel />}
          </>
        )}
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Sessions                                                                    */
/* ========================================================================== */

function SessionsPanel() {
  const [sessions, setSessions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [sets, setSets] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setSessions(await listSessions(40)); }
      finally { setLoading(false); }
    })();
  }, []);

  const toggle = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!sets[id]) {
      const rows = await listSetsForSession(id);
      setSets((p) => ({ ...p, [id]: rows }));
    }
  };

  if (loading) return <div className="workout-empty"><span className="workout-spinner" /> Loading…</div>;
  if (!sessions.length) return <div className="workout-empty">No workouts logged yet. Go and do one.</div>;

  const weekCount = sessions.filter(
    (s) => Date.now() - new Date(s.performed_at).getTime() < 7 * 864e5
  ).length;

  return (
    <>
      <div className="workout-stat-row">
        <div className="workout-stat">
          <div className="val">{sessions.length}</div>
          <div className="cap">Total</div>
        </div>
        <div className="workout-stat">
          <div className="val">{weekCount}</div>
          <div className="cap">This week</div>
        </div>
        <div className="workout-stat">
          <div className="val">{streakWeeks(sessions)}</div>
          <div className="cap">Week streak</div>
        </div>
      </div>

      {sessions.map((s) => {
        const open = expanded === s.id;
        const rows = sets[s.id] || [];
        const picked = Object.values(s.record_selections || {}).flat();

        return (
          <div key={s.id} className="workout-card" style={{ cursor: "pointer" }} onClick={() => toggle(s.id)}>
            <div className="workout-card__top" style={{ marginBottom: open ? 12 : 0 }}>
              <div>
                <h3>{fmtDate(s.performed_at)}</h3>
                <div className="workout-card__sub">
                  {s.workout_programs?.name}
                  {s.duration_seconds ? ` · ${Math.round(s.duration_seconds / 60)} min` : ""}
                </div>
              </div>
              <span className="workout-pill">{open ? "close" : "view"}</span>
            </div>

            {open && (
              <>
                {rows.length === 0 && <p className="workout-card__sub">No sets recorded in this session.</p>}
                {rows.map((r) => (
                  <div key={r.id} className="workout-log-row">
                    <span className="dot" style={{ background: r.advanced ? "#c9a227" : "#2f5540" }} />
                    <div className="body">
                      <div className="name">{r.exercise_name}</div>
                      <div className="meta">
                        {r.amounts.join(" / ")} {r.unit === "seconds" ? "sec" : "reps"}
                        {r.advanced && " · levelled up"}
                        {!r.advanced && r.hit_target && " · target hit"}
                      </div>
                    </div>
                  </div>
                ))}

                {picked.length > 0 && (
                  <p className="workout-card__sub" style={{ marginTop: 10 }}>
                    Also did: {picked.join(", ")}
                  </p>
                )}
                {s.notes && <p className="workout-card__sub" style={{ marginTop: 6 }}>{s.notes}</p>}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ========================================================================== */
/* Progress per chain                                                          */
/* ========================================================================== */

function ProgressPanel({ program, programId }) {
  const [chainId, setChainId] = useState(program?.chains?.[0]?.id ?? null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const chain = program?.chains?.find((c) => c.id === chainId);

  useEffect(() => {
    if (!programId || !chainId) return;
    setLoading(true);
    listSetsForChain(programId, chainId, 120)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [programId, chainId]);

  if (!program) {
    return <div className="workout-empty">Load a workout first and your progress will show up here.</div>;
  }

  const levelUps = rows.filter((r) => r.advanced);
  const best = rows.reduce((m, r) => Math.max(m, ...r.amounts), 0);

  return (
    <>
      <div className="workout-tabs" style={{ marginBottom: 16 }}>
        {program.chains.map((c) => (
          <button key={c.id} className="workout-tab" data-active={chainId === c.id} onClick={() => setChainId(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="workout-empty"><span className="workout-spinner" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="workout-empty">Nothing logged for {chain?.label} yet.</div>
      ) : (
        <>
          <div className="workout-stat-row">
            <div className="workout-stat">
              <div className="val">{rows.length}</div>
              <div className="cap">Sessions</div>
            </div>
            <div className="workout-stat">
              <div className="val">{levelUps.length}</div>
              <div className="cap">Level ups</div>
            </div>
            <div className="workout-stat">
              <div className="val">{best}</div>
              <div className="cap">Best set</div>
            </div>
          </div>

          <div className="workout-card">
            <h3 style={{ marginBottom: 10 }}>Best set each session</h3>
            <LineChart
              points={rows.map((r) => ({
                x: new Date(r.performed_at).getTime(),
                y: Math.max(...r.amounts),
                flag: r.advanced,
              }))}
              unit={rows[0]?.unit === "seconds" ? "s" : ""}
              accent={chain?.color || "#1f3d2b"}
            />
            <p className="workout-card__sub" style={{ marginTop: 8 }}>
              Gold dots are the sessions where you moved up a rung. Dips are normal: the number
              resets when the exercise gets harder.
            </p>
          </div>

          <div className="workout-section-heading">Rungs climbed</div>
          {levelUps.length === 0 ? (
            <p className="workout-card__sub">No level ups on this chain yet. Keep at it.</p>
          ) : (
            levelUps.slice().reverse().map((r, i) => (
              <div key={i} className="workout-log-row">
                <span className="dot" style={{ background: "#c9a227" }} />
                <div className="body">
                  <div className="name">{r.exercise_name}</div>
                  <div className="meta">cleared with {r.amounts.join(" / ")}</div>
                </div>
                <div className="when">{fmtDate(r.performed_at, true)}</div>
              </div>
            ))
          )}
        </>
      )}
    </>
  );
}

/* ========================================================================== */
/* Weight                                                                      */
/* ========================================================================== */

function WeightPanel() {
  const [allowed, setAllowed] = useState(null);
  const [rows, setRows] = useState([]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await listWeights(180));
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await canLogWeight();
      setAllowed(ok);
      if (ok) await refresh();
    })();
  }, [refresh]);

  if (allowed === null) return <div className="workout-empty"><span className="workout-spinner" /> Loading…</div>;

  if (!allowed) {
    return (
      <div className="workout-empty">
        Weight tracking is available on adult accounts only. An admin can change this on the Admin page.
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await logWeight(value, date);
      setValue("");
      await refresh();
    } catch (e) {
      setError(e.message || "Could not save that weight.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await deleteWeight(id);
    await refresh();
  };

  const latest = rows.length ? rows[rows.length - 1] : null;
  const first = rows.length ? rows[0] : null;
  const change = latest && first ? (latest.weight_kg - first.weight_kg) : 0;
  const last30 = rows.filter((r) => Date.now() - new Date(r.logged_on).getTime() < 30 * 864e5);
  const avg30 = last30.length
    ? (last30.reduce((n, r) => n + Number(r.weight_kg), 0) / last30.length).toFixed(1)
    : null;

  return (
    <>
      <div className="workout-card">
        <h3 style={{ marginBottom: 12 }}>Log today's weight</h3>
        {error && <div className="workout-alert workout-alert--error">{error}</div>}
        <div className="workout-weight-grid">
          <div>
            <label htmlFor="wt">Weight (kg)</label>
            <input
              id="wt"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="78.4"
            />
          </div>
          <div style={{ width: 150 }}>
            <label htmlFor="wd">Date</label>
            <input id="wd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button className="workout-btn workout-btn--primary" onClick={save} disabled={busy || !value}>
            {busy ? "…" : "Save"}
          </button>
        </div>
        <p className="workout-card__sub">One entry per day. Saving again for the same date replaces it.</p>
      </div>

      {rows.length > 0 && (
        <>
          <div className="workout-stat-row">
            <div className="workout-stat">
              <div className="val">{latest.weight_kg}</div>
              <div className="cap">Latest kg</div>
            </div>
            <div className="workout-stat">
              <div className="val">{change > 0 ? "+" : ""}{change.toFixed(1)}</div>
              <div className="cap">Change</div>
            </div>
            {avg30 && (
              <div className="workout-stat">
                <div className="val">{avg30}</div>
                <div className="cap">30 day avg</div>
              </div>
            )}
          </div>

          <div className="workout-card">
            <h3 style={{ marginBottom: 10 }}>Trend</h3>
            <LineChart
              points={rows.map((r) => ({ x: new Date(r.logged_on).getTime(), y: Number(r.weight_kg) }))}
              unit="kg"
              accent="#1f3d2b"
            />
          </div>

          <div className="workout-section-heading">Entries</div>
          {rows.slice().reverse().slice(0, 30).map((r) => (
            <div key={r.id} className="workout-log-row">
              <span className="dot" style={{ background: "#c9a227" }} />
              <div className="body">
                <div className="name">{r.weight_kg} kg</div>
                {r.note && <div className="meta">{r.note}</div>}
              </div>
              <div className="when">{fmtDate(r.logged_on, true)}</div>
              <button className="workout-btn workout-btn--danger workout-btn--sm" onClick={() => remove(r.id)}>
                ✕
              </button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

/* ========================================================================== */
/* Tiny SVG line chart                                                         */
/* ========================================================================== */

function LineChart({ points, unit = "", accent = "#1f3d2b" }) {
  if (!points || points.length === 0) return null;

  const W = 640, H = 180, PAD = 28;

  if (points.length === 1) {
    return (
      <p className="workout-card__sub">
        Only one entry so far ({points[0].y}{unit}). The chart appears once there are two.
      </p>
    );
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const padY = spanY * 0.15;

  const sx = (x) => PAD + ((x - minX) / spanX) * (W - PAD * 2);
  const sy = (y) => H - PAD - ((y - (minY - padY)) / (spanY + padY * 2)) * (H - PAD * 2);

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L ${sx(maxX).toFixed(1)} ${H - PAD} L ${sx(minX).toFixed(1)} ${H - PAD} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Progress chart">
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#d9d0bb" strokeWidth="1" />
      <path d={area} fill={accent} opacity="0.08" />
      <path d={d} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(p.y)}
          r={p.flag ? 4.5 : 2.5}
          fill={p.flag ? "#c9a227" : accent}
        />
      ))}
      <text x={PAD} y={16} fontSize="11" fill="#6d7a68">{maxY}{unit}</text>
      <text x={PAD} y={H - PAD - 4} fontSize="11" fill="#6d7a68">{minY}{unit}</text>
    </svg>
  );
}

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function fmtDate(v, short = false) {
  const d = new Date(v);
  return d.toLocaleDateString("en-GB", short
    ? { day: "numeric", month: "short" }
    : { weekday: "short", day: "numeric", month: "long" });
}

/** Consecutive weeks, counting back from this week, containing a session. */
function streakWeeks(sessions) {
  if (!sessions.length) return 0;
  const weeks = new Set(
    sessions.map((s) => {
      const d = new Date(s.performed_at);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      return monday.getTime();
    })
  );
  const thisMonday = new Date();
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  let n = 0;
  let cursor = thisMonday.getTime();
  while (weeks.has(cursor)) { n += 1; cursor -= 7 * 864e5; }
  return n;
}
