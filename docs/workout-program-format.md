# Workout program format

This is the JSON format the Workouts feature accepts, either pasted/uploaded
on the "Upload JSON" tab of `/workouts`, or produced by the "Build your own"
form (which is still v1-shaped — see below). It's validated and normalised
by `src/lib/workoutSchema.js` (`validateProgram`) — that file is the source
of truth; this document describes it in plain language, and both should be
kept in sync.

The built-in starter workout at `src/data/programs/calisthenics-bta.json` is
a complete v1 example; `src/data/programs/barbell-5x5.json` is a complete v2
example using load mode.

## Concept

A program is a set of **chains**. A chain is either:

- a **ladder** of exercises for one movement pattern (e.g. pushups), ordered
  easiest-to-hardest — climb it by hitting your target for several workouts
  in a row, then move up to the next exercise and the streak resets; or
- a **load** chain, usually a single barbell lift — instead of moving to a
  new exercise, hitting the streak adds weight and you stay put.

A program can also have **record sections** — simple tick-lists (warmup
moves done, stretches done, etc.) that don't progress, just get logged per
session.

## Schema versions

- **v1**: single integer rep targets, ladder chains only, no load, no
  per-side.
- **v2**: rep ranges, `progression.mode` (`"ladder"` or `"load"`), load
  chains with `start_load_kg`/`progression.increment_kg`, and `per_side`
  chains.

`validateProgram()` accepts either and upgrades a v1 file to v2 in place
(with a warning) — a v1 file needs no changes to keep working, it just gets
none of the v2 features. `schema_version` in a saved program is always `2`.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | number | yes | `1` or `2`. |
| `name` | string | yes | 1–120 characters. |
| `description` | string | no | Truncated to 500 characters if longer. |
| `author` | string | no | Free text, truncated to 120 characters. |
| `targets` | object | yes | Program-wide default target: `{ sets, reps, streak }`. |
| `rest_seconds` | number | no | Default rest between sets, 10–600. Defaults to `90`. |
| `sessions_per_week` | number | no | 1–7. Defaults to `3`. Informational only. |
| `days` | array of strings | no | Ordered rotation labels (e.g. `["A", "B"]`), used by the day tabs and the "next up" hint in the tracker. Max 10. If omitted, the tracker derives the same list from whatever distinct `day` values the chains use. |
| `record_sections` | array | no | See [Record sections](#record-sections). Defaults to `[]`. |
| `chains` | array | yes | See [Chains](#chains). Must be non-empty. |

Unknown top-level keys are silently stripped rather than rejected, so new
optional fields can be added later without breaking existing files. Preserve
that property in any future change to the validator.

### `targets`

```json
{ "sets": 3, "reps": 12, "streak": 3 }
```

or, with a rep range:

```json
{ "sets": 3, "reps": { "min": 6, "max": 8 }, "streak": 3 }
```

- `sets` — number of sets per session, 1–10.
- `reps` — either a single number, or `{ min, max }` (or seconds, if the
  exercise's `unit` is `"seconds"`). A single number behaves as if
  `min === max`. 1–100 per side (1–3600 for a `"seconds"` exercise-level
  override).
- `streak` — how many sessions in a row must clear the target before the
  chain advances (or the load goes up), 1–10.

A chain can override `sets`/`reps` (not `streak` — that's always the
programme's own value, even when a chain provides its own `targets`) with
its own `targets`, and an individual exercise can override `sets`/`reps`
again. The effective target is resolved exercise → chain → program (see
`effectiveTarget()` in `workoutSchema.js`).

**Two thresholds when `reps` is a range**, because a range needs both a
floor and a ceiling to progress sensibly:

- Any set below `min` is a miss: the session doesn't count, and the streak
  resets to zero.
- Every set at or above `max` banks one streak credit.
- Between the two, the session is logged and counts, but the streak just
  holds where it is — it neither resets nor advances.

## Chains

```json
{
  "id": "squat",
  "section": "Legs",
  "label": "Squat",
  "sub": "Back squat, ATG or parallel",
  "color": "#1f3d2b",
  "rest_seconds": 180,
  "targets": { "sets": 5, "reps": 5 },
  "progression": { "mode": "load", "increment_kg": 2.5 },
  "start_load_kg": 20,
  "per_side": false,
  "exercises": [
    { "name": "Back squat" }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Lowercase letters, digits, underscores only (`a-z0-9_`). Unique across the whole program (chains and record sections share the same id space). |
| `section` | string | yes | Groups chains under a heading in the tracker (e.g. "Push", "Pull", "Legs"). |
| `label` | string | yes | Chain name shown in the UI. |
| `sub` | string | no | Small subtitle under the label. |
| `color` | string | no | `#rrggbb`. Falls back to a default green if missing or invalid. |
| `rest_seconds` | number | no | Overrides the program default for this chain, 10–600. |
| `targets` | object | no | Overrides `sets`/`reps` (not `streak`) for this chain. |
| `progression` | object | no | `{ mode: "ladder" \| "load", increment_kg }`. Defaults to `{ mode: "ladder" }`. `increment_kg` is required for `"load"` (1–500, defaults to 2.5kg with a warning if missing/invalid). |
| `start_load_kg` | number | no | 0–500. The working weight new enrolments start at for a load chain, if the start-position screen doesn't collect one. Ignored for ladder chains. |
| `per_side` | boolean | no | Defaults to `false`. See [Per-side chains](#per-side-chains). |
| `day` | string | no | Up to 40 characters, e.g. `"A"`, `"Push"`. Which day this chain belongs to. See [Day assignment](#day-assignment). Omitted or `""` means every day. |
| `superset_group` | string | no | Same id rules as `id` (`a-z0-9_`). Chains sharing a group are logged back-to-back as one superset. See [Supersets](#supersets). |
| `exercises` | array | yes | Non-empty, ordered easiest first. Max 80 (extra are dropped with a warning). A load chain is usually a single exercise, since progression happens by adding weight rather than moving along the array. |

### Exercises

Each entry in `exercises` can be either:

- a plain **string** — treated as `{ name: <string>, unit: "reps" }`, or
- an **object**:

  | Field | Type | Notes |
  |---|---|---|
  | `name` | string | required, truncated to 120 characters |
  | `unit` | `"reps"` \| `"seconds"` \| `"metres"` | defaults to `"reps"`; use `"seconds"` for holds/planks, `"metres"` for a carry or a sled push logged by distance. `"weight"` is accepted and rewritten to `"reps"` with a warning: load is tracked on the chain (`progression`/`load_kg`), not as a third unit, because a weighted plank is a seconds hold *and* a load at the same time. |
  | `reps` | number or `{ min, max }` | overrides the chain/program target for this exercise (1–100 for reps, 1–3600 for seconds, 1–5000 for metres) |
  | `sets` | number | overrides the chain/program target for this exercise, 1–10 |
  | `note` | string | short tip shown under the exercise name, truncated to 200 characters |
  | `video_url` | string | optional link to a form video, shown as a small "form video" link next to the exercise name. Must start with `http://` or `https://` and be 300 characters or fewer, otherwise it's dropped with a warning. |

### Load chains

Set `progression.mode` to `"load"` for a chain that progresses by weight
instead of by moving through a ladder of exercises (the barbell model —
squat, bench, deadlift and so on). Completing the streak adds
`progression.increment_kg` to the chain's working weight and keeps the
current exercise; a ladder chain instead moves to `exercises[index + 1]`.

A rep range in `load` mode gives double progression: climb the range (e.g.
6 to 8), hit the top of it for a full streak, add weight, and reps fall back
toward the bottom at the heavier load. The best-set chart for a chain like
this is expected to look like a sawtooth; the working-weight chart, a
staircase. Both are correct.

The working weight lives in `workout_progress.current_load_kg`, seeded at
enrolment from whatever starting weight the start-position screen collects,
falling back to the chain's `start_load_kg` if none is given.

### Per-side chains

Set `per_side: true` for a chain where each set is logged separately for
left and right (single-arm/single-leg work). The tracker takes a left row
and a right row and stores two `workout_sets` rows.

**Both sides must clear the floor for the session to count, and both must
reach the ceiling to bank a streak credit** — the weaker side gates
progression. This is intentional: the point of tracking left/right
separately is watching asymmetry close, and letting the strong side carry
the weak one defeats that. Don't change this to "either side" without being
asked.

### Day assignment

Give a chain a `day` (e.g. `"A"`, `"B"`, or a free label like `"Push"`) to
say which day of a split it belongs to. A chain with no `day` shows up on
every day. The tracker shows day tabs whenever a programme uses two or more
distinct day labels (from the top-level `days` array if given, otherwise
collected from the chains themselves), and remembers the last day trained
per person per programme (in the browser, not the database) to suggest
which one is next.

There's no way to put a chain on more than one day: a lift trained on both
A and B days in a classic split needs either two chain entries (one per
day) or to be left with no `day` at all so it shows up on both.

### Supersets

Give two or more chains the same `superset_group` to have them logged back
to back: completing one opens the log form for the next immediately,
skipping the usual per-exercise rest, then rests once after the whole group
is done (using the longest `rest_seconds` among the group). A group can
span sections (e.g. a push chain and a core chain), and a chain whose
partner is filtered out by the day tab just renders on its own.

## Record sections

Simple tick-lists that appear above the chains in the tracker and get saved
with the session, but don't progress.

```json
{
  "id": "warmup",
  "label": "Warmup and Mobility",
  "color": "#6abf69",
  "select": "multi",
  "options": ["Jumping Jacks", "Lunges", "Sprints"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Same id rules as chains, and shares the same id space. |
| `label` | string | yes | Section heading. |
| `color` | string | no | `#rrggbb`, same fallback as chains. |
| `select` | `"single"` \| `"multi"` | no | `"single"` behaves like a radio group (picking one clears any other); anything else (default) is multi-select. |
| `options` | array of strings | yes | At least one. Max 40 kept (extra dropped with a warning). |

## Validation behaviour

`validateProgram(raw)` accepts either a JSON string or an already-parsed
object, and returns:

```js
{ ok: boolean, errors: string[], warnings: string[], program: object | null }
```

- **Errors** (`ok: false`, nothing is saved) come from missing/invalid
  required fields, bad ids, duplicate ids, or a `schema_version` that isn't
  `1` or `2`.
- **Warnings** are non-fatal — the program still saves, but something was
  auto-corrected (an invalid colour swapped for the default, a list
  truncated, a blank exercise skipped, a v1 file upgraded to v2, etc.).
  These are shown to the person uploading so they know what changed.
- Uploaded JSON is capped at 256 KB.

## Progression rule (for reference)

This lives in `logSet()` in `src/lib/workoutApi.js`, not in the JSON format
itself, but it's worth knowing when writing exercise lists: every set
logged in a session must meet the effective target's `repMin`, and there
must be at least `target.sets` of them, for that session to count (not be a
miss). Every set must also reach `repMax` for the session to bank a streak
credit. Bank a credit for `target.streak` sessions in a row and the chain
advances one rung (ladder) or the working weight goes up (load); streak
resets to zero. A miss on any session resets the streak to zero without
moving the rung or the weight.

Two more things live entirely at logging time, not in the JSON format:
**RPE** (rate of perceived exertion, 1–10 in half-point steps) can
optionally be recorded alongside any logged set, and a load chain's
**deload** button (in the tracker) drops its working weight by 10% and
resets its streak, for after a bad run or a break. Neither needs anything
in the programme file.
