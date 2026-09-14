-- _reference/workout-schema-v3.sql
-- Fearne Hub :: Workouts schema v3 migration.
--
-- Adds an optional RPE (rate of perceived exertion, 1-10 in half-point
-- steps) to logged sets. Everything else this round (day/split assignment,
-- supersets, a distance unit, video links) lives inside the existing
-- `definition` jsonb column on workout_programs, so no schema change is
-- needed for those.
--
-- Run this once against the existing Supabase project, after
-- workout-schema-v2.sql.

alter table workout_sets
  add column if not exists rpe numeric check (rpe >= 1 and rpe <= 10);
