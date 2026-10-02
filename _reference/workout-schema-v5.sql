-- _reference/workout-schema-v5.sql
-- Fearne Hub :: Workouts schema v5 migration.
--
-- Sets are now ticked off one at a time, can each carry their own weight
-- (drop sets), and an exercise can carry a note ("did 4 negatives").
--
--   loads_kg  one weight per set, lined up with `amounts`. Nullable: rows
--             logged before this, and bodyweight chains, leave it empty and
--             fall back to `load_kg`.
--   note      free-text note for that exercise on that day.
--
-- It also makes sure people can delete their own sets and sessions, which
-- the "Tidy split sets" repair on the History page needs. These are own-row
-- only and sit alongside whatever policies already exist (Postgres ORs
-- permissive policies together), so nothing else is widened.
--
-- Run this once against the existing Supabase project, after
-- workout-schema-v4.sql. The app keeps working before it's run, it just
-- saves sets without per-set weights or notes.

alter table workout_sets
  add column if not exists loads_kg numeric[],
  add column if not exists note text check (char_length(note) <= 500);

drop policy if exists workout_sets_delete_own on workout_sets;
create policy workout_sets_delete_own on workout_sets
  for delete
  using (auth.uid() = user_id);

drop policy if exists workout_sessions_delete_own on workout_sessions;
create policy workout_sessions_delete_own on workout_sessions
  for delete
  using (auth.uid() = user_id);
