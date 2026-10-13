-- battleship-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy).
-- Mirrors the Connect Four / Go Fish pattern: sessions + players + an
-- append-only shot log. Each player's fleet (ship positions only, no hits)
-- is saved on their bs_players row when they tap Ready. Hits, sunk ships,
-- whose turn it is and the winner are all DERIVED in the app (see
-- deriveOnline in src/pages/games/battleship/engine.js) from the two fleets
-- plus the bs_shots rows. Nothing here stores a board or a score.
--
-- Trust model: fleets are readable by any approved user, so a determined
-- cheat with dev tools could peek at the other fleet. Same as Go Fish's
-- shared deck seed; fine for family games.
--
-- Assumes your existing public.is_approved() helper exists (same one used by
-- recipes, meal plans, workouts, AnimalPlaceThing, Connect Four and Go Fish).

-- ---------- tables ----------

create table if not exists public.bs_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  winner_seat   smallint check (winner_seat in (1, 2)), -- null + finished = called off
  rematch_id    uuid references public.bs_sessions(id) on delete set null,
  rules_version integer not null default 1
);

-- Fast lookup of open games by code (invite links and typed codes).
create index if not exists bs_sessions_open_code_idx
  on public.bs_sessions (code)
  where status = 'waiting';

create table if not exists public.bs_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.bs_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat in (1, 2)), -- seat 1 fires first
  fleet        jsonb,  -- [{ name, length, cells: [[row, col], ...] }], null until Ready
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

create table if not exists public.bs_shots (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.bs_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        smallint not null check (seat in (1, 2)), -- who fired
  cell_row    smallint not null check (cell_row between 0 and 7),
  cell_col    smallint not null check (cell_col between 0 and 7),
  shot_number integer not null,
  created_at  timestamptz not null default now(),
  unique (session_id, shot_number),          -- protects against a two-write race
  unique (session_id, seat, cell_row, cell_col) -- no firing at the same cell twice
);

create index if not exists bs_shots_session_idx
  on public.bs_shots (session_id, shot_number);

-- ---------- RLS ----------

alter table public.bs_sessions enable row level security;
alter table public.bs_players  enable row level security;
alter table public.bs_shots    enable row level security;

-- Helper: the current user's seat in this session (null if not a player).
-- SECURITY DEFINER so it does not recurse through bs_players' own RLS.
create or replace function public.bs_my_seat(sess uuid)
returns smallint
language sql
security definer
stable
as $$
  select p.seat from public.bs_players p
  where p.session_id = sess
    and p.user_id = auth.uid();
$$;

-- Helper: is there still a free seat (max 2 players)?
create or replace function public.bs_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select (select count(*) from public.bs_players where session_id = sess) < 2;
$$;

-- sessions
create policy "bs sessions readable by approved"
  on public.bs_sessions for select to authenticated
  using (is_approved());

create policy "bs sessions insert own"
  on public.bs_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

create policy "bs sessions update by player"
  on public.bs_sessions for update to authenticated
  using (is_approved() and bs_my_seat(id) is not null)
  with check (is_approved());

-- players
create policy "bs players readable by approved"
  on public.bs_players for select to authenticated
  using (is_approved());

create policy "bs players insert own"
  on public.bs_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and bs_can_join(session_id));

-- Only your own row, and only while your fleet is still unset: ships can't
-- be moved once they're committed.
create policy "bs players set own fleet once"
  on public.bs_players for update to authenticated
  using (is_approved() and user_id = auth.uid() and fleet is null)
  with check (is_approved() and user_id = auth.uid());

-- shots
create policy "bs shots readable by approved"
  on public.bs_shots for select to authenticated
  using (is_approved());

create policy "bs shots insert own"
  on public.bs_shots for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and seat = bs_my_seat(session_id)
  );

-- ---------- realtime ----------
-- Safe to re-run; ignore "already member of publication" if it appears.
alter publication supabase_realtime add table public.bs_sessions;
alter publication supabase_realtime add table public.bs_players;
alter publication supabase_realtime add table public.bs_shots;
