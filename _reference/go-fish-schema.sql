-- go-fish-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy).
-- Mirrors the Connect Four / AnimalPlaceThing pattern: sessions + players +
-- an append-only event log. Hands, the pond, whose turn it is, and completed
-- books are all DERIVED in the app (see src/pages/games/go-fish/engine.js)
-- from deck_seed + the gf_events rows — nothing here stores a hand or score.
--
-- Assumes your existing public.is_approved() helper exists (same one used by
-- recipes, meal plans, workouts, AnimalPlaceThing and Connect Four).

-- ---------- tables ----------

create table if not exists public.gf_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  deck_seed     integer not null,   -- feeds the shared seeded shuffle (mulberry32)
  rules_version integer not null default 1
);

create index if not exists gf_sessions_open_code_idx
  on public.gf_sessions (code)
  where status = 'waiting';

create table if not exists public.gf_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.gf_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 3),
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

create table if not exists public.gf_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.gf_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade, -- the asker
  type         text not null default 'ask' check (type in ('ask')),
  target_id    uuid not null references auth.users(id) on delete cascade,
  rank         smallint not null check (rank between 1 and 13),
  event_number integer not null,
  created_at   timestamptz not null default now(),
  unique (session_id, event_number) -- protects against a two-write race
);

create index if not exists gf_events_session_idx
  on public.gf_events (session_id, event_number);

-- ---------- RLS ----------

alter table public.gf_sessions enable row level security;
alter table public.gf_players  enable row level security;
alter table public.gf_events   enable row level security;

-- Helper: is the current user a player in this session? SECURITY DEFINER so
-- it does not recurse through gf_players' own RLS when used inside policies.
create or replace function public.gf_is_player(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.gf_players p
    where p.session_id = sess
      and p.user_id = auth.uid()
  );
$$;

-- Helper: is there still a free seat (max 4 players)?
create or replace function public.gf_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select (select count(*) from public.gf_players where session_id = sess) < 4;
$$;

-- sessions
create policy "gf sessions readable by approved"
  on public.gf_sessions for select to authenticated
  using (is_approved());

create policy "gf sessions insert own"
  on public.gf_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

create policy "gf sessions update by player"
  on public.gf_sessions for update to authenticated
  using (is_approved() and gf_is_player(id))
  with check (is_approved());

-- players
create policy "gf players readable by approved"
  on public.gf_players for select to authenticated
  using (is_approved());

create policy "gf players insert own"
  on public.gf_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and gf_can_join(session_id));

-- events
create policy "gf events readable by approved"
  on public.gf_events for select to authenticated
  using (is_approved());

create policy "gf events insert own"
  on public.gf_events for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and gf_is_player(session_id)
  );

-- ---------- realtime ----------
-- Safe to re-run; ignore "already member of publication" if it appears.
alter publication supabase_realtime add table public.gf_sessions;
alter publication supabase_realtime add table public.gf_players;
alter publication supabase_realtime add table public.gf_events;
