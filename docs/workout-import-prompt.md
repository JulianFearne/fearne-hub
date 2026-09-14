# Workout programme prompt spec

Paste this whole document into a Claude chat (no repo access needed) along
with what programme you want, e.g. "generate a 3-day upper/lower split for
a novice using this format." Claude should return one JSON object matching
the shape below, output only, no commentary. Drop the result straight into
the "Upload JSON" tab on `/workouts`, or hand it back to a Claude Code
session to save as `src/data/programs/<name>.json`.

## Concept

A programme is a set of **chains**. Each chain is one of two kinds:

- **ladder** — an ordered list of exercises, easiest to hardest, for one
  movement pattern (e.g. pushups). Hit the target for several sessions in a
  row and the chain moves up to the next exercise, streak resets. This is
  the bodyweight/calisthenics model.
- **load** — usually a single exercise (e.g. a barbell lift). Hitting the
  target doesn't move to a new exercise, it adds weight and stays put. This
  is the barbell model.

A programme can also have **record sections**: simple tick-lists (warmup
done, stretches done) that get logged per session but never progress.

## Progression rule

Every target has a rep floor and ceiling (they can be the same number for a
fixed target, e.g. "always 5", or different for a range, e.g. "6 to 8"):

- Any logged set below the floor is a miss: the session doesn't count, and
  the streak resets to zero.
- Every set at or above the ceiling banks one streak credit.
- Between the two, the session counts but the streak just holds.

Bank a credit for `streak` sessions in a row and the chain advances (ladder)
or the weight goes up by `increment_kg` (load).

**Per-side chains** (`per_side: true`) log left and right separately. Both
sides must clear the floor for the session to count, and both must reach the
ceiling to bank a credit — the weaker side gates progression, on purpose,
so it's worth watching asymmetry close rather than letting the strong side
carry the weak one.

**Day assignment** (`day`) marks which day of a split a chain belongs to
(e.g. `"A"`, `"B"`); a chain with no `day` shows up every day. A lift
trained on more than one day (e.g. squat on both A and B) needs a separate
chain entry per day, or no `day` at all.

**Supersets** (`superset_group`) pair two or more chains (same string value)
to be logged back to back with one shared rest afterward, instead of resting
between them.

## JSON shape

```json
{
  "schema_version": 2,
  "name": "string, 1-120 chars",
  "description": "string, optional, up to 500 chars",
  "author": "string, optional, up to 120 chars",
  "sessions_per_week": 3,
  "rest_seconds": 90,
  "targets": { "sets": 3, "reps": 12, "streak": 3 },
  "record_sections": [
    {
      "id": "warmup",
      "label": "Warmup",
      "color": "#c9a227",
      "select": "multi",
      "options": ["Jumping jacks", "Mobility"]
    }
  ],
  "chains": [
    {
      "id": "squat",
      "section": "Legs",
      "label": "Squat",
      "sub": "optional subtitle",
      "color": "#1f3d2b",
      "rest_seconds": 180,
      "targets": { "sets": 5, "reps": 5 },
      "progression": { "mode": "load", "increment_kg": 2.5 },
      "start_load_kg": 20,
      "per_side": false,
      "exercises": [
        { "name": "Back squat", "reps": 5 }
      ]
    }
  ]
}
```

## Field reference

### Top level

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | number | yes | Always `2`. |
| `name` | string | yes | 1-120 characters. |
| `description` | string | no | Up to 500 characters. |
| `author` | string | no | Up to 120 characters. |
| `targets` | object | yes | Programme-wide default. See below. |
| `rest_seconds` | number | no | 10-600. Default 90. |
| `sessions_per_week` | number | no | 1-7. Default 3. Informational only. |
| `days` | array of strings | no | Ordered rotation labels, e.g. `["A", "B"]`. Max 10. If omitted, derived from the chains' own `day` values. |
| `record_sections` | array | no | Default `[]`. See below. |
| `chains` | array | yes | Non-empty. See below. |

### `targets` (top level, and optionally per chain)

| Field | Type | Notes |
|---|---|---|
| `sets` | number | 1-10 sets per session. |
| `reps` | number OR `{ "min": n, "max": n }` | 1-100 (1-3600 if the exercise unit is `"seconds"`). A single number behaves as `min === max`. |
| `streak` | number | 1-10. **Top level only** — a chain can override `sets`/`reps` but never `streak`. |

### Chains

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `a-z`, `0-9`, `_` only. Unique across the whole file (chains and record sections share one id space). |
| `section` | string | yes | Groups chains under a heading, e.g. "Push", "Pull", "Legs". |
| `label` | string | yes | Displayed chain name. |
| `sub` | string | no | Small subtitle. |
| `color` | string | no | `#rrggbb`. |
| `rest_seconds` | number | no | Overrides the programme default, 10-600. |
| `targets` | object | no | Overrides `sets`/`reps` (not `streak`) for this chain. |
| `progression` | object | no | `{ "mode": "ladder" \| "load", "increment_kg": n }`. Defaults to ladder. `increment_kg` required for load mode (0.25-50). |
| `start_load_kg` | number | no | 0-500. Starting working weight for a load chain. |
| `per_side` | boolean | no | Default `false`. Left/right tracked separately, see progression rule above. |
| `day` | string | no | Up to 40 characters, e.g. `"A"`. Omitted means every day. |
| `superset_group` | string | no | Same id rules as `id`. Chains sharing a value are logged back to back. |
| `exercises` | array | yes | Non-empty, easiest first, max 80. A load chain is usually one exercise. |

### Exercises

Either a plain string, or an object:

| Field | Type | Notes |
|---|---|---|
| `name` | string | required, up to 120 characters |
| `unit` | `"reps"` \| `"seconds"` \| `"metres"` | defaults to `"reps"`; `"seconds"` for holds/planks, `"metres"` for carries/distance work. Don't use `"weight"` — load lives on the chain's `progression`/`start_load_kg`, not as a unit. |
| `reps` | number or `{ min, max }` | overrides sets/reps target for this exercise (1-100 reps, 1-3600 seconds, 1-5000 metres) |
| `sets` | number | overrides sets target for this exercise, 1-10 |
| `note` | string | short tip, up to 200 characters |
| `video_url` | string | optional form-video link. Must start with `http://` or `https://`, up to 300 characters. |

### Record sections

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Same id rules as chains, same id space. |
| `label` | string | yes | Section heading. |
| `color` | string | no | `#rrggbb`. |
| `select` | `"single"` \| `"multi"` | no | `"single"` behaves like a radio group. Default multi. |
| `options` | array of strings | yes | At least one, max 40. |

## Examples of both chain kinds

**Ladder (bodyweight):**

```json
{
  "id": "pushups",
  "section": "Push",
  "label": "Pushups",
  "color": "#e8743b",
  "exercises": ["Wall pushups", "Incline pushup", "Normal pushup", { "name": "Diamond pushup hold", "unit": "seconds", "reps": 20 }]
}
```

**Load with a rep range (double progression):**

```json
{
  "id": "bench",
  "section": "Push",
  "label": "Bench Press",
  "color": "#e8743b",
  "start_load_kg": 20,
  "progression": { "mode": "load", "increment_kg": 2.5 },
  "targets": { "sets": 3, "reps": { "min": 6, "max": 8 } },
  "exercises": [{ "name": "Bench press" }]
}
```

**Per-side, load mode:**

```json
{
  "id": "single_arm_row",
  "section": "Pull",
  "label": "Single-Arm Row",
  "color": "#3b9ee8",
  "per_side": true,
  "start_load_kg": 10,
  "progression": { "mode": "load", "increment_kg": 1 },
  "targets": { "sets": 3, "reps": { "min": 8, "max": 12 } },
  "exercises": [{ "name": "Single-arm dumbbell row" }]
}
```

**Day-assigned, part of a superset, distance-based:**

```json
{
  "id": "farmers_carry",
  "section": "Core",
  "label": "Farmer's Carry",
  "color": "#e8743b",
  "day": "B",
  "start_load_kg": 20,
  "progression": { "mode": "load", "increment_kg": 2 },
  "targets": { "sets": 3, "reps": { "min": 20, "max": 40 } },
  "exercises": [{ "name": "Farmer's carry", "unit": "metres", "video_url": "https://example.com/farmers-carry" }]
}
```

```json
{
  "id": "face_pulls",
  "section": "Pull",
  "label": "Face Pulls",
  "color": "#7ab8f5",
  "day": "A",
  "superset_group": "shoulder_health",
  "targets": { "sets": 3, "reps": { "min": 12, "max": 15 } },
  "exercises": [{ "name": "Cable or band face pull" }]
}
```

## Two things logged at the time, not in the file

**RPE** (1-10, optional) can be recorded against any logged set, and a load
chain has a **deload** action (drop the working weight 10%, reset the
streak) available in the tracker. Neither needs anything in the JSON, they
just happen once the programme is loaded.
