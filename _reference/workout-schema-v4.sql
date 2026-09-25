-- _reference/workout-schema-v4.sql
-- Fearne Hub :: Workouts schema v4 migration.
--
-- Lets an admin delete any workout programme (including a builtin one, or
-- someone else's), and gives everyone else a "request delete" action
-- instead of nothing. Previously only a programme's own author could
-- delete it, and builtin programmes (seeded from src/data/programs/) could
-- never be deleted from the UI at all.
--
-- Review before running: this widens a DELETE policy, not just adds
-- columns.

-- ---------------------------------------------------------------------------
-- Two additive columns record a pending request.
alter table workout_programs
  add column if not exists delete_requested_by uuid references auth.users(id),
  add column if not exists delete_requested_at timestamptz;

-- ---------------------------------------------------------------------------
-- Mirrors the existing is_adult()/is_approved() helper pattern.
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Any approved user can flag a programme for deletion, even one they don't
-- own or a builtin one. Deliberately a SECURITY DEFINER function rather
-- than a broadened UPDATE policy: a broad "any approved user can update
-- workout_programs" policy would let anyone rewrite someone else's
-- programme's name/definition, not just flag it for deletion. This only
-- ever touches the two delete_requested_* columns.
create or replace function request_program_delete(p_program_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not is_approved() then
    raise exception 'Not approved.';
  end if;

  update workout_programs
  set delete_requested_by = auth.uid(), delete_requested_at = now()
  where id = p_program_id;
end;
$$;

grant execute on function is_admin() to authenticated;
grant execute on function request_program_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Widen the DELETE policy from "author only" to "author or admin". The
-- existing policy's exact name isn't known outside the Supabase project
-- (this repo has no migrations folder - see the note at the top of
-- docs/database-schema.md), so this drops whatever DELETE policy already
-- exists on the table by looking it up, rather than trying to ALTER one by
-- a guessed name.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workout_programs' and cmd = 'DELETE'
  loop
    execute format('drop policy %I on workout_programs', pol.policyname);
  end loop;
end $$;

create policy workout_programs_delete on workout_programs
  for delete
  using (auth.uid() = author_id or is_admin());
