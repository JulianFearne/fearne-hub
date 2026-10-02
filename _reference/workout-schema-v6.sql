-- _reference/workout-schema-v6.sql
-- Fearne Hub :: Workouts schema v6 migration.
--
-- A shared, family-wide library of exercise how-to cues. When a programme is
-- uploaded or saved in the builder, any exercise that brings its own cues
-- (`guide` in the programme file) is added here, but only if that exercise
-- has no cues yet: the first version is kept. Cues change only when someone
-- edits them on purpose in the builder. Every programme's "How to" panel
-- then looks here for exercises it has no cues of its own for, before
-- falling back to the cues built into the app.
--
-- `key` is the exercise name loosened the same way the app matches names
-- (lower case, hyphens and plurals ignored: see guideKey() in
-- src/data/exerciseGuides.js), so "Pull-up" and "Pull up" share one entry.
--
-- Run this once against the existing Supabase project, after
-- workout-schema-v5.sql. Until it's run, the app simply skips the shared
-- library.

create table if not exists exercise_guides (
  key text primary key,
  name text not null,
  guide jsonb not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table exercise_guides enable row level security;

-- any approved family member can read, add and edit cues; nobody deletes
-- through the app (a bad entry is fixed by editing it)
drop policy if exists exercise_guides_read on exercise_guides;
create policy exercise_guides_read on exercise_guides
  for select using (is_approved());

drop policy if exists exercise_guides_insert on exercise_guides;
create policy exercise_guides_insert on exercise_guides
  for insert with check (is_approved());

drop policy if exists exercise_guides_update on exercise_guides;
create policy exercise_guides_update on exercise_guides
  for update using (is_approved()) with check (is_approved());
