-- _reference/workout-schema-v2.sql
-- Fearne Hub :: Workouts schema v2 migration.
--
-- Adds load-mode progression (current_load_kg, load_kg) and per-side set
-- tracking (side) to the existing workout tables. Existing v1 programme
-- definitions and rows are untouched: the new columns are all nullable, and
-- stay null for chains that remain in ladder mode / aren't per-side.
--
-- Run this once against the existing Supabase project. It does not create
-- any table from scratch (the workout tables already exist; see
-- docs/database-schema.md for the full reverse-engineered reference).

alter table workout_progress
  add column if not exists current_load_kg numeric;

alter table workout_sets
  add column if not exists load_kg numeric,
  add column if not exists side text check (side in ('left', 'right'));
