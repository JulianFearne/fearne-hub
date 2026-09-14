# Fearne Hub :: Workout Tracker — handover brief

Drop this in `docs/` and point a Claude Code session at it. It carries everything
needed to continue the feature without re-deriving decisions.

Last updated: 14 September 2026. Schema v2.

---

## 1. What this is

A workout tracking feature inside Fearne Hub, a private family web app. Three screens:

- `/workouts` — programme library. Browse shared programmes, upload JSON, or build one in a form.
- `/workouts/tracker` — the live tracker. Log sets, progress automatically, rest between sets.
- `/workouts/history` — sessions, per-chain progression, left/right symmetry, body weight.

It started as a conversion of a calisthenics progression poster and was extended to
handle barbell training. Both models now work in one schema.

---

## 2. Stack and repo conventions

| Thing | Value |
|---|---|
| Repo | `JulianFearne/fearne-hub` |
| Stack | Vite + React + React Router, Supabase (auth, Postgres, RLS) |
| Deploy | GitHub Pages via Actions on push to `main` |
| Routing | `HashRouter`-free; uses a `404.html` SPA fallback |
| Auth | `ProtectedRoute` wrapper, `profiles` table with `role` (`admin`/`adult`/`kid`) and `approved` |

**House conventions that matter:**

- **UK English throughout.** In UI copy, comments and docs.
- **No em dashes.** Use commas, colons or brackets.
- **Scoped CSS.** Every feature stylesheet is namespaced under a single root class.
  This feature uses `.workout`. Never add unscoped global selectors.
- **Design tokens:** forest green `#1f3d2b`, cream `#f6f1e4`, gold `#c9a227`.
  Headings in Fraunces, body in Inter.
- **Path discipline.** Julian commits via the GitHub web UI, where folders are created
  by typing the full path in the filename box. Missing `src/lib/` or `src/data/programs/`
  has caused build failures before. Verify paths exist before assuming a bug is logical.
- **No new npm dependencies without asking.** Charts are hand-rolled SVG for this reason.

---

## 3. File inventory

| Path | Purpose |
|---|---|
| `src/lib/workoutSchema.js` | Validator and normaliser. Pure functions, no Supabase. Also exports `effectiveTarget`, `effectiveRest`, `describeTarget`. |
| `src/lib/workoutApi.js` | Every Supabase call. Pages import from here only. Contains the progression engine in `logSet`. |
| `src/styles/workout.css` | Scoped under `.workout`. |
| `src/pages/WorkoutHub.jsx` | Library, upload panel, builder form, start-position modal. |
| `src/pages/WorkoutTracker.jsx` | Live tracker, log modal, reposition modal, rest timer. |
| `src/pages/WorkoutHistory.jsx` | Sessions, progress charts, symmetry, body weight. |
| `src/data/programs/calisthenics-bta.json` | Seed programme, schema v1, auto-inserted on first hub load. |
| `docs/workout-program-format.md` | The JSON spec. Read this before generating any programme file. |

Routes live in `src/App.jsx`, all three wrapped in `ProtectedRoute`.

---

## 4. Data model

Six tables plus two views, all RLS enabled.

| Table | Scope | Notes |
|---|---|---|
| `workout_programs` | shared read, own write | `definition` is JSONB holding the whole validated programme. |
| `workout_enrollments` | own only | Partial unique index enforces one active programme per user. |
| `workout_progress` | own only | Per chain: `current_index`, `streak`, `current_load_kg`. |
| `workout_sessions` | own only | One per completed workout. `record_selections` is JSONB. |
| `workout_sets` | own only | One row **per side**. Has `amounts int[]`, `load_kg`, `side`. |
| `body_weight_logs` | own only, **adults/admins only** | Gated in RLS via `is_adult()`. |

Views: `workout_last_set`, `workout_side_balance`.

Helper functions: `is_approved()`, `is_adult()`, `set_updated_at()`.

**Deliberate privacy decisions.** Programmes are shared so family members can use each
other's. All personal logging is own-only. Body weight is gated to adult accounts in the
RLS policy itself, not just the UI, because a weight tracker reachable by a child account
is not something to leave to a client-side check. Do not relax this without being asked.

---

## 5. The progression engine

Lives in `logSet` in `workoutApi.js`. This is the heart of the feature.

**Two thresholds, because rep ranges need both:**

- `repMin` is the floor. Any set below it makes the session a miss and resets the streak to zero.
- `repMax` is the ceiling. Every set at or above it banks one streak credit.
- Between the two, the session is logged and the streak holds where it is.

**Two modes:**

| Mode | On completing a streak |
|---|---|
| `ladder` | `current_index += 1`. Move to the next exercise. Calisthenics model. |
| `load` | `current_load_kg += increment_kg`. Stay on the exercise. Barbell model. |

`load` mode with a rep range is double progression: climb through 6 to 8, hit 3×8 twice,
add 2.5kg, reps fall back toward 6 at the heavier weight. The best-set chart is expected
to look like a sawtooth, and the working-weight chart like a staircase. Both are correct.

**Per side.** When `per_side` is true, the logger takes a left row and a right row, and
stores two `workout_sets` rows. **Both sides must clear the threshold for the session to
count.** The weaker side gates progression. This is intentional, not a bug: the point of
per-side tracking here is watching asymmetry close, and banking progress on the strong
side defeats that. If a future session is tempted to change `sides.every` to `sides.some`,
do not, unless explicitly asked.

**Override cascade.** Exercise, then chain, then programme. Resolved by `effectiveTarget()`.
Never read `program.targets` directly in a component; always go through the helper.

---

## 6. Schema versions

- v1: single integer rep targets, no load, no per-side. The calisthenics seed file is v1.
- v2: rep ranges, `progression.mode`, `load_kg`, `per_side`.

The validator accepts both and upgrades v1 in place with a warning. Unknown keys are
**stripped, not rejected**, so new optional fields can be added without breaking any
existing file. Preserve that property in any future change.

`unit` is `"reps"` or `"seconds"` only. Load is orthogonal, not a third unit, because
a weighted plank is seconds and weight simultaneously. `unit: "weight"` is accepted
and rewritten with a warning.

---

## 7. Current state

Deployed and working: library, upload, builder, tracker, rest timer, history, weight.

Schema v2 landed: `src/lib/workoutSchema.js` exports `SCHEMA_VERSION = 2`, and
`_reference/workout-schema-v2.sql` adds `current_load_kg`, `load_kg` and `side` to the
existing tables (run it once against Supabase if it hasn't been run yet, then
`_reference/workout-schema-v3.sql` for `rpe`, same idea). Rep ranges, load mode,
per-side tracking and the start-position modal's starting-load field are all in, along
with `src/data/programs/barbell-5x5.json` (squat, bench, row, press, deadlift, seeded
alongside the calisthenics programme) and a prompt-ready standalone copy of the format
spec at `docs/workout-import-prompt.md`, for handing to a fresh Claude chat with no repo
access.

On top of that, the whole Tier 2-3 list from the previous round is done: chains can
carry a `day` (with day tabs and a "next up" hint in the tracker, remembered client-side
per programme), `superset_group` (logged back to back with one shared rest), a
`"metres"` unit for distance work, and an optional `video_url`. Logging a set can record
an optional RPE. A load chain has a manual "deload" button (-10%, resets the streak),
which also covers the old "deload and reset" gap. `barbell-5x5.json` now uses all of
these: a two-day (A/B) split, a face-pulls/plank superset, and a metres-based farmer's
carry.

The rest timer requests a screen wake lock and vibrates on completion. Both degrade
silently where unsupported.

---

## 8. Known gaps and likely next work

Everything here is optional and worked-around-able: nothing blocks using the barbell
programme day to day.

1. **The builder form is v1-shaped.** It cannot express rep ranges, load mode, per-side,
   day assignment, supersets, a metres unit or video links. Upload handles all of them,
   so the form is the weak link. Worth extending, but it's a chunk of UI work on its own.
2. **No session notes UI.** The column exists and `finishSession` accepts notes, but
   nothing collects them.
3. **No export.** Recipes have a JSON export pipeline; workouts do not.
4. **Volume and tonnage.** Sets, reps and load are all stored, so `sum(reps × load)`
   per session is available and not yet surfaced.
5. **No automatic periodisation.** The manual deload button covers "drop the weight
   after a bad run"; there's still nothing that plans a deload week on a schedule (e.g.
   every 4th week) the way a coached programme might.

Resolved across the last two rounds: the barbell programme file, the start-position
modal's starting-load field, day assignment with day tabs and a "next up" hint,
supersets, a manual deload action, a metres unit, RPE logging, and video links on
exercises.

---

## 9. Testing checklist

Progression needs consecutive qualifying sessions, so it cannot be verified in one
workout. To test without waiting, log the same chain repeatedly in one sitting: the
rule counts logged entries, not calendar days.

- [ ] Hub loads and the calisthenics programme appears (seeding works)
- [ ] Upload a v2 file, confirm the preview shows warnings and errors correctly
- [ ] Upload a deliberately broken file, confirm it is rejected with reasons
- [ ] Load a programme, set start positions, land on the tracker
- [ ] Log a ladder chain at ceiling three times, confirm it advances
- [ ] Log a load chain at ceiling twice, confirm the weight increments
- [ ] Log a per-side exercise with only one side, confirm it does not bank a credit
- [ ] Log both sides unevenly, confirm the gap toast appears above 15%
- [ ] Rest timer counts down, pauses, and can be skipped
- [ ] Finish a workout, confirm it appears in History with its sets
- [ ] Left vs right tab charts both lines once two paired sessions exist
- [ ] Body weight tab shows the adult-only message on a kid account
- [ ] Load the barbell programme with the two-day split, day tabs show A/B and filter chains
- [ ] "Next up" hint suggests the other day after logging on one
- [ ] Log the face-pulls/plank superset: saving the first opens the second immediately,
      one rest timer appears after both, not two
- [ ] Deload a load chain, confirm the weight drops 10% and the streak resets
- [ ] Log the farmer's carry (metres unit) and confirm the distance placeholder/labels read "metres", not "reps"
- [ ] Log a set with an RPE value, confirm it shows in the session's History row
- [ ] Add a `video_url` to an exercise, confirm the "form video" link appears in the tracker and the move/pick list

---

## 10. Working style

Julian integrates and tests between phases rather than taking a single large drop.
Scaffold end to end, hand over complete files rather than diffs (he pastes into the
GitHub web editor, where partial edits are error-prone), and state exact destination
paths every time. He pushes back usefully on design decisions, so flag the reasoning
behind any non-obvious choice rather than burying it.
