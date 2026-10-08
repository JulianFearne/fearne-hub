-- carve-saves.sql (CARVE decision 0012; the source of truth is docs/carve-saves.sql in JulianFearne/carve)
-- Run once in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy), the same way as
-- fearne-hub's _reference/*.sql files. Safe to re-run.
--
-- One row per user and slot: CARVE's whole save (the PlayerProfile .tres text, a few KB).
-- 'live' is fearne.org/carve, 'preview' is fearne.org/carve-preview. CARVE reads and
-- writes it from the browser with the hub's publishable key, so Row Level Security is
-- what keeps each save private: an approved user sees and changes only their own rows.
--
-- Assumes the existing public.is_approved() helper (used by recipes, workouts and the
-- multiplayer games).

create table if not exists public.carve_saves (
  user_id     uuid not null references auth.users(id) on delete cascade,
  slot        text not null check (slot in ('live', 'preview')),
  profile     text not null check (length(profile) <= 400000),
  hunts       integer not null default 0,
  build       text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.carve_saves enable row level security;

drop policy if exists "carve_saves read own" on public.carve_saves;
create policy "carve_saves read own" on public.carve_saves
  for select using (is_approved() and user_id = auth.uid());

drop policy if exists "carve_saves insert own" on public.carve_saves;
create policy "carve_saves insert own" on public.carve_saves
  for insert with check (is_approved() and user_id = auth.uid());

drop policy if exists "carve_saves update own" on public.carve_saves;
create policy "carve_saves update own" on public.carve_saves
  for update using (is_approved() and user_id = auth.uid())
  with check (is_approved() and user_id = auth.uid());

drop policy if exists "carve_saves delete own" on public.carve_saves;
create policy "carve_saves delete own" on public.carve_saves
  for delete using (is_approved() and user_id = auth.uid());

grant select, insert, update, delete on public.carve_saves to authenticated;
