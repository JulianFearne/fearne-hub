-- gem-clash-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy). Safe to
-- re-run.
--
-- Online Gem Clash matches for 2-4 players. Each player's well runs on
-- their own phone, so nothing here describes a well: the tables hold the
-- lobby, the settings (Normal or Easy gems, and the seed that gives
-- everyone the same pairs in the same order), who has been knocked out,
-- and the winner. Live snapshots of each well and the junk thrown between
-- players travel over a Realtime broadcast channel, which needs no table.
--
-- Assumes your existing public.is_approved() helper exists.

-- ---------- tables ----------

create table if not exists public.gc_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  mode          text not null default 'versus' check (mode in ('versus', 'easy')),
  seed          integer not null,  -- shared order of pairs
  num_players   smallint check (num_players between 2 and 4),
  winner_seat   smallint check (winner_seat between 0 and 3), -- null + finished = called off
  rematch_id    uuid references public.gc_sessions(id) on delete set null,
  rules_version integer not null default 1
);

create index if not exists gc_sessions_open_code_idx
  on public.gc_sessions (code)
  where status = 'waiting';

create table if not exists public.gc_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.gc_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 3),
  out          boolean not null default false, -- their well filled up
  score        integer not null default 0,     -- points when knocked out
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

-- ---------- RLS ----------
-- Each policy is dropped first so the whole file is safe to re-run.

alter table public.gc_sessions enable row level security;
alter table public.gc_players  enable row level security;

create or replace function public.gc_is_player(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.gc_players p where p.session_id = sess and p.user_id = auth.uid());
$$;

create or replace function public.gc_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.gc_sessions s where s.id = sess and s.status = 'waiting')
     and (select count(*) from public.gc_players where session_id = sess) < 4;
$$;

drop policy if exists "gc sessions readable by approved" on public.gc_sessions;
create policy "gc sessions readable by approved"
  on public.gc_sessions for select to authenticated
  using (is_approved());

drop policy if exists "gc sessions insert own" on public.gc_sessions;
create policy "gc sessions insert own"
  on public.gc_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

drop policy if exists "gc sessions update by player" on public.gc_sessions;
create policy "gc sessions update by player"
  on public.gc_sessions for update to authenticated
  using (is_approved() and gc_is_player(id))
  with check (is_approved());

drop policy if exists "gc players readable by approved" on public.gc_players;
create policy "gc players readable by approved"
  on public.gc_players for select to authenticated
  using (is_approved());

drop policy if exists "gc players insert own" on public.gc_players;
create policy "gc players insert own"
  on public.gc_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and gc_can_join(session_id));

drop policy if exists "gc players update own" on public.gc_players;
create policy "gc players update own"
  on public.gc_players for update to authenticated
  using (is_approved() and user_id = auth.uid())
  with check (is_approved() and user_id = auth.uid());

-- ---------- realtime ----------
-- Adds each table to realtime unless it's already there, so this is safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gc_sessions') then
    alter publication supabase_realtime add table public.gc_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gc_players') then
    alter publication supabase_realtime add table public.gc_players;
  end if;
end $$;
