# Database schema (Supabase)

There's no migrations folder in this repo — the Postgres schema lives only in
the Supabase project itself. This document is reverse engineered from every
`supabase.from(...)` / `supabase.rpc(...)` call in the codebase, so it
reflects what the app *expects* to exist. Treat it as the reference for
recreating or auditing the schema, and keep it updated when a page starts
querying a new table or column.

Every table is expected to have Row Level Security enabled, following the
same pattern: rows carry a `user_id` (or `created_by`) column referencing
`auth.users`, and policies restrict reads/writes to the owning user, with
shared/family-visible data (recipes, meal plans, shopping lists, workout
programs, games) readable by any approved user.

## `profiles`

One row per user, keyed to `auth.users`. Read/written by
`AuthContext.jsx` and `Admin.jsx`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, references `auth.users.id` |
| `email` | text | |
| `role` | text | `admin` \| `adult` \| `kid` |
| `approved` | boolean | gates access via `ProtectedRoute` |
| `created_at` | timestamptz | |

A user's own profile should be readable by them; `admin`-role users need read
+ update access to every profile (approve sign-ups, change roles).

## `recipes`

Read/written by `src/pages/recipesData.js`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `title` | text | |
| `category` | text | `starter` \| `main` \| `dessert` \| `snack` \| `drink` |
| `emoji` | text | |
| `serves` | int | nullable |
| `time` | text | nullable, free text |
| `difficulty` | text | nullable, `Easy` \| `Medium` \| `Hard` |
| `tags` | text[] / jsonb | |
| `ingredients` | jsonb | array of `{ group }` or `{ name, amount }`, see [recipe-import-format.md](recipe-import-format.md) |
| `steps` | jsonb / text[] | array of strings |
| `notes` | text | nullable |
| `created_by` | uuid | references `auth.users.id` |
| `created_at` | timestamptz | |

Shared/family-readable; only the creator can delete their own recipe
(enforced client-side too via `canDelete={selected.created_by === user?.id}`
in `Recipes.jsx`, but should also be enforced by RLS).

## `meal_plan_entries`

Read/written by `src/pages/mealPlanData.js`. One row = one recipe slotted
into one meal on one day.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `entry_date` | date | ISO `YYYY-MM-DD` |
| `meal_type` | text | `breakfast` \| `lunch` \| `dinner` |
| `recipe_id` | uuid / bigint | references `recipes.id` |
| `created_by` | uuid | references `auth.users.id` |

Queried with `select('*, recipes(id, title, emoji, category, ingredients)')`
— a foreign-key relationship to `recipes` must exist for that embed to work.
Shared/family-readable.

## `shopping_lists`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `name` | text | |
| `created_by` | uuid | references `auth.users.id` |
| `created_at` | timestamptz | |

Shared/family-readable and writable (any approved user can create/delete a
list, per `ShoppingLists.jsx`).

## `shopping_list_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `list_id` | uuid / bigint | references `shopping_lists.id` |
| `name` | text | |
| `amount` | text | nullable |
| `checked` | boolean | default `false` |
| `source` | text | `'manual'` or `'meal'` (set by `ingredientsFromEntries()` when pulled from the Meal Planner) |
| `recipe_title` | text | nullable; set when `source = 'meal'`, shown as provenance next to the item |
| `created_at` | timestamptz | |

Shared/family-readable and writable.

## `workout_programs`

Read/written by `src/lib/workoutApi.js`. A program's full definition (chains,
targets, record sections — see
[workout-program-format.md](workout-program-format.md)) is stored as one
JSON blob rather than normalised into rows.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `name` | text | |
| `description` | text | nullable |
| `author_id` | uuid | references `auth.users.id` |
| `source` | text | `'builtin'` \| `'custom'` \| `'upload'` |
| `schema_version` | int | currently always `1` |
| `definition` | jsonb | the full validated program object |
| `created_at` | timestamptz | |

Shared/family-readable so everyone can pick any program from the library.
The built-in program (`src/data/programs/calisthenics-bta.json`) is seeded
once via `seedBuiltinProgram()`, matched on `source = 'builtin' AND name = …`
so it's never duplicated. Only the author can delete a program they created
(`mine = p.author_id === userId` in `WorkoutHub.jsx`; builtin programs can't
be deleted from the UI at all).

## `workout_enrollments`

Which program each user currently has loaded. One row per
`(user_id, program_id)` pair, only one `is_active` at a time per user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `user_id` | uuid | references `auth.users.id` |
| `program_id` | uuid / bigint | references `workout_programs.id` |
| `is_active` | boolean | |
| `started_at` | timestamptz | |

Unique constraint on `(user_id, program_id)` — `enrollInProgram()` upserts on
that conflict target. Own-row read/write only.

## `workout_progress`

Per-user, per-program, per-chain position on the ladder.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references `auth.users.id` |
| `program_id` | uuid / bigint | references `workout_programs.id` |
| `chain_id` | text | matches a chain's `id` inside the program's `definition.chains` |
| `current_index` | int | index into that chain's `exercises` array |
| `streak` | int | consecutive sessions hitting target at the current index |

Unique constraint on `(user_id, program_id, chain_id)` — everything upserts
on that conflict target. Own-row read/write only.

## `workout_sessions`

One row per completed (or in-progress) workout session.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `user_id` | uuid | references `auth.users.id` |
| `program_id` | uuid / bigint | references `workout_programs.id` |
| `performed_at` | timestamptz | defaults to now on insert |
| `duration_seconds` | int | nullable, set on finish |
| `record_selections` | jsonb | `{ [recordSectionId]: string[] }`, the tick-list choices made during the session |
| `notes` | text | nullable |

`startSession()` inserts a bare row (so a session exists as soon as the
first set is logged); `finishSession()` updates it with duration, notes and
record selections. Own-row read/write only.

## `workout_sets`

One row per logged set-group (i.e. one "Log sets" submission for one
exercise), linked to a session.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `session_id` | uuid / bigint | references `workout_sessions.id`, nullable |
| `user_id` | uuid | references `auth.users.id` |
| `program_id` | uuid / bigint | references `workout_programs.id` |
| `chain_id` | text | |
| `exercise_index` | int | position in the chain at the time of logging |
| `exercise_name` | text | denormalised, so history reads correctly even if the program definition changes later |
| `unit` | text | `'reps'` \| `'seconds'` |
| `amounts` | jsonb / int[] | one number per set logged |
| `hit_target` | boolean | |
| `advanced` | boolean | true if this set pushed the chain up a rung |
| `performed_at` | timestamptz | defaults to now |

Own-row read/write only. Used both for the session detail view and the
per-chain progress chart (`listSetsForChain`).

## `body_weight_logs`

Optional body-weight tracker, gated to adults/admins by the `is_adult()` RPC
(see below).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid / bigint | PK |
| `user_id` | uuid | references `auth.users.id` |
| `logged_on` | date | ISO `YYYY-MM-DD` |
| `weight_kg` | numeric | validated client-side to `0 < kg < 500` |
| `note` | text | nullable |

Unique constraint on `(user_id, logged_on)` — `logWeight()` upserts on that
conflict target ("one entry per day, saving again replaces it"). Own-row
read/write only.

### `is_adult()` RPC

`canLogWeight()` calls `supabase.rpc('is_adult')` with no arguments and
expects a boolean back. This should be a Postgres function (`SECURITY
DEFINER` reading `profiles.role` for `auth.uid()`) that returns `true` when
the calling user's role is `adult` or `admin`. Any RPC error is treated as
"not allowed" client-side.

## Games: `game_sessions`, `game_players`, `game_submissions`

Backing store for "Animal Place Thing" (`src/pages/AnimalPlaceThing.jsx`).
Scoring itself is never stored — it's recomputed on the fly from these rows
by the pure functions in `src/pages/scoring.js`, so there's no `score`
column anywhere.

**These three tables are the one part of the schema deliberately reachable
by people with no Fearne Hub account.** The game route
(`/games/animal-place-thing`) isn't behind `ProtectedRoute`, and anyone who
opens it with no session gets signed in via **Supabase anonymous sign-in**
(`signInAsGuest()` in `src/pages/animalPlaceThingData.js`) the moment they
create or join a game — a real `auth.users` row and `auth.uid()`, just with
no email/password and no `profiles` row. Their `game_players.display_name`
is whatever nickname they typed, not derived from a hub account. Two
consequences for the schema:

- **RLS on these three tables must key off `auth.uid() IS NOT NULL`, never
  `is_approved()`** (or anything else that reads `profiles`) — an anonymous
  guest has no profile row and would be blocked outright. Every other table
  in this document *should* stay gated behind hub approval; these three are
  the exception.
- Requires **Authentication → Sign In / Providers → Anonymous Sign-Ins**
  enabled in the Supabase project, or `signInAsGuest()` fails for anyone
  without an existing session.

### `game_sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | text | PK — the 6-character join code (see `randCode()`), not a uuid |
| `host_id` | uuid | references `auth.users.id` |
| `phase` | text | `'lobby'` \| `'playing'` \| `'round_result'` \| `'final'` |
| `end_condition` | text | `'manual'` \| `'points'` \| `'alphabet'` |
| `point_goal` | int | nullable, only set when `end_condition = 'points'` |
| `rules_version` | int | stamped from `RULES_VERSION` in `scoring.js` at creation; joiners are blocked if their bundle's version differs |
| `current_letter` | text | single letter, current round |
| `used_letters` | text[] | letters already played this game |
| `round` | int | current round number, starts at 0 |
| `deadline` | timestamptz | nullable; round end time, drives the countdown |

### `game_players`

| Column | Type | Notes |
|---|---|---|
| `session_id` | text | references `game_sessions.id` |
| `user_id` | uuid | references `auth.users.id` |
| `display_name` | text | |
| `joined_at` | timestamptz | |

Primary key / unique constraint on `(session_id, user_id)` — joining upserts.
A player leaving deletes their row (`match({ session_id, user_id })`).

### `game_submissions`

| Column | Type | Notes |
|---|---|---|
| `session_id` | text | references `game_sessions.id` |
| `round` | int | |
| `user_id` | uuid | references `auth.users.id` |
| `answers` | jsonb | `{ Object, Name, Animal, Place, Food }` (see `CATEGORIES` in `scoring.js`) |

Unique constraint on `(session_id, round, user_id)` — one submission per
player per round, upserted on submit or on timer expiry.

All three game tables need **Realtime** enabled in Supabase (Database →
Replication), since `AnimalPlaceThing.jsx` subscribes to `postgres_changes`
on all three, filtered by `session_id`. RLS should allow any authenticated
user (hub member or anonymous guest alike) to read every row, and to
insert/update/delete only rows that are theirs — `host_id = auth.uid()` on
`game_sessions` insert, `user_id = auth.uid()` on `game_players` and
`game_submissions` writes. Session codes double as the shared secret for
joining a specific game; there's otherwise no per-game access control (any
authenticated user can read any session's rows if they know or guess the
code).
