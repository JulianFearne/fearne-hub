# Workout program format

This is the JSON format the Workouts feature accepts, either pasted/uploaded
on the "Upload JSON" tab of `/workouts`, or produced by the "Build your own"
form. It's validated and normalised by `src/lib/workoutSchema.js`
(`validateProgram`) — that file is the source of truth; this document
describes it in plain language, and both should be kept in sync.

The built-in starter workout at `src/data/programs/calisthenics-bta.json` is
a complete real example.

## Concept

A program is a set of **chains**. A chain is a "ladder" of exercises for one
movement pattern (e.g. pushups), ordered easiest-to-hardest. You climb a
chain by hitting your target for several workouts in a row; once you do, you
move up to the next exercise on that chain and the streak resets.

A program can also have **record sections** — simple tick-lists (warmup
moves done, stretches done, etc.) that don't progress, just get logged per
session.

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | number | yes | Must be `1`. |
| `name` | string | yes | 1–120 characters. |
| `description` | string | no | Truncated to 500 characters if longer. |
| `author` | string | no | Free text, truncated to 120 characters. |
| `targets` | object | yes | Program-wide default target: `{ sets, reps, streak }`. |
| `rest_seconds` | number | no | Default rest between sets, 10–600. Defaults to `90`. |
| `sessions_per_week` | number | no | 1–7. Defaults to `3`. Informational only. |
| `record_sections` | array | no | See [Record sections](#record-sections). Defaults to `[]`. |
| `chains` | array | yes | See [Chains](#chains). Must be non-empty. |

### `targets`

```json
{ "sets": 3, "reps": 12, "streak": 3 }
```

- `sets` — number of sets per session, 1–10.
- `reps` — reps (or seconds, if the exercise's `unit` is `"seconds"`) needed
  per set to count as a hit, 1–100.
- `streak` — how many sessions in a row must hit target before the chain
  advances to the next exercise, 1–10.

A chain can override any of `sets`/`reps` (not `streak`) with its own
`targets`, and an individual exercise can override `sets`/`reps` again. The
effective target is resolved exercise → chain → program
(see `effectiveTarget()` in `workoutSchema.js`).

## Chains

```json
{
  "id": "pushups",
  "section": "Push",
  "label": "Pushups",
  "sub": "optional subtitle",
  "color": "#1f3d2b",
  "rest_seconds": 90,
  "targets": { "sets": 3, "reps": 12 },
  "exercises": [
    "Wall pushups",
    { "name": "Incline pushup", "note": "hands on a chair" },
    { "name": "Knee pushup", "unit": "reps", "reps": 15 },
    { "name": "Full pushup" },
    { "name": "Diamond pushup hold", "unit": "seconds", "reps": 20 }
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
| `exercises` | array | yes | Non-empty, ordered easiest first. Max 80 (extra are dropped with a warning). |

### Exercises

Each entry in `exercises` can be either:

- a plain **string** — treated as `{ name: <string>, unit: "reps" }`, or
- an **object**:

  | Field | Type | Notes |
  |---|---|---|
  | `name` | string | required, truncated to 120 characters |
  | `unit` | `"reps"` \| `"seconds"` | defaults to `"reps"`; use `"seconds"` for holds/planks |
  | `reps` | number | overrides the chain/program target for this exercise (1–100 for reps, 1–3600 for seconds) |
  | `sets` | number | overrides the chain/program target for this exercise, 1–10 |
  | `note` | string | short tip shown under the exercise name, truncated to 200 characters |

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
  `1`.
- **Warnings** are non-fatal — the program still saves, but something was
  auto-corrected (an invalid colour swapped for the default, a list
  truncated, a blank exercise skipped, etc.). These are shown to the person
  uploading so they know what changed.
- Uploaded JSON is capped at 256 KB.

## Progression rule (for reference)

This lives in `logSet()` in `src/lib/workoutApi.js`, not in the JSON format
itself, but it's worth knowing when writing exercise lists: every set logged
in a session must meet the effective target's `reps`/`seconds`, and there
must be at least `target.sets` of them, for that session to "hit target". Hit
target for `target.streak` sessions in a row and the chain advances one rung
(streak resets to zero). Missing target on any session resets the streak to
zero without moving the rung.
