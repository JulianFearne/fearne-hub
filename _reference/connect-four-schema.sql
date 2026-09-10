-- connect-four-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy).
-- Mirrors the AnimalPlaceThing pattern: sessions + players + moves, with the
-- board and winner DERIVED from move rows in the app. Nothing here stores the
-- grid or a score. RULES_VERSION is stamped on the session at creation.
--
-- Assumes your existing public.is_approved() helper exists (same one used by
-- recipes, meal plans, workouts and AnimalPlaceThing).

-- ---------- tables ----------

create table if not exists public.c4_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  winner_seat   smallint,          -- 1, 2, or null (null + finished = draw)
  rules_version integer not null default 1
);

-- Fast lookup of open games by code.
create index if not exists c4_sessions_open_code_idx
  on public.c4_sessions (code)
  where status = 'waiting';

create table if not exists public.c4_players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.c4_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  seat       smallint not null check (seat in (1, 2)),
  joined_at  timestamptz not null default now(),
  unique (session_id, seat),      -- stops two people grabbing the same seat
  unique (session_id, user_id)    -- one seat per user per game
);

create table if not exists public.c4_moves (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.c4_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        smallint not null check (seat in (1, 2)),
  col         smallint not null check (col between 0 and 6),
  move_number integer not null,
  created_at  timestamptz not null default now(),
  unique (session_id, move_number) -- protects against a two-write race
);

create index if not exists c4_moves_session_idx
  on public.c4_moves (session_id, move_number);

-- ---------- RLS ----------

alter table public.c4_sessions enable row level security;
alter table public.c4_players  enable row level security;
alter table public.c4_moves    enable row level security;

-- Helper: is the current user a player in this session? SECURITY DEFINER so it
-- does not recurse through c4_players' own RLS when used inside policies.
create or replace function public.c4_is_player(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.c4_players p
    where p.session_id = sess
      and p.user_id = auth.uid()
  );
$$;

-- sessions
create policy "c4 sessions readable by approved"
  on public.c4_sessions for select to authenticated
  using (is_approved());

create policy "c4 sessions insert own"
  on public.c4_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

create policy "c4 sessions update by player"
  on public.c4_sessions for update to authenticated
  using (is_approved() and c4_is_player(id))
  with check (is_approved());

-- players
create policy "c4 players readable by approved"
  on public.c4_players for select to authenticated
  using (is_approved());

create policy "c4 players insert own"
  on public.c4_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid());

-- moves
create policy "c4 moves readable by approved"
  on public.c4_moves for select to authenticated
  using (is_approved());

create policy "c4 moves insert own"
  on public.c4_moves for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and c4_is_player(session_id)
  );

-- ---------- realtime ----------
-- Safe to re-run; ignore "already member of publication" if it appears.
alter publication supabase_realtime add table public.c4_sessions;
alter publication supabase_realtime add table public.c4_players;
alter publication supabase_realtime add table public.c4_moves;
