-- snakes-and-ladders-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy).
-- Mirrors the Ludo pattern: sessions + players + an append-only log of
-- dice rolls. There are no choices in Snakes and Ladders, so a roll is the
-- whole turn. Positions, whose turn it is and the winner are all DERIVED in
-- the app (see deriveOnline in src/pages/games/snakes-and-ladders/engine.js)
-- by replaying the rolls. Nothing here stores the board.
--
-- Dice are rolled on the player's own device, same family-trust model as
-- the other online games.
--
-- Assumes your existing public.is_approved() helper exists.

-- ---------- tables ----------

create table if not exists public.snl_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  num_players   smallint check (num_players between 2 and 4), -- set when the host starts
  winner_seat   smallint check (winner_seat between 0 and 3), -- null + finished = ended early
  rules_version integer not null default 1
);

create index if not exists snl_sessions_open_code_idx
  on public.snl_sessions (code)
  where status = 'waiting';

create table if not exists public.snl_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.snl_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 3), -- turn order; colours follow from it
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

create table if not exists public.snl_rolls (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.snl_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        smallint not null check (seat between 0 and 3),
  value       smallint not null check (value between 1 and 6),
  roll_number integer not null,
  created_at  timestamptz not null default now(),
  unique (session_id, roll_number) -- protects against a two-write race
);

create index if not exists snl_rolls_session_idx
  on public.snl_rolls (session_id, roll_number);

-- ---------- RLS ----------
-- Each policy is dropped first so the whole file is safe to re-run.

alter table public.snl_sessions enable row level security;
alter table public.snl_players  enable row level security;
alter table public.snl_rolls   enable row level security;

-- The current user's seat in this session (null if not a player).
create or replace function public.snl_my_seat(sess uuid)
returns smallint
language sql
security definer
stable
as $$
  select p.seat from public.snl_players p
  where p.session_id = sess
    and p.user_id = auth.uid();
$$;

-- Still taking players: waiting, and fewer than 4 seated.
create or replace function public.snl_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.snl_sessions s where s.id = sess and s.status = 'waiting')
     and (select count(*) from public.snl_players where session_id = sess) < 4;
$$;

drop policy if exists "snl sessions readable by approved" on public.snl_sessions;
create policy "snl sessions readable by approved"
  on public.snl_sessions for select to authenticated
  using (is_approved());

drop policy if exists "snl sessions insert own" on public.snl_sessions;
create policy "snl sessions insert own"
  on public.snl_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

drop policy if exists "snl sessions update by player" on public.snl_sessions;
create policy "snl sessions update by player"
  on public.snl_sessions for update to authenticated
  using (is_approved() and snl_my_seat(id) is not null)
  with check (is_approved());

drop policy if exists "snl players readable by approved" on public.snl_players;
create policy "snl players readable by approved"
  on public.snl_players for select to authenticated
  using (is_approved());

drop policy if exists "snl players insert own" on public.snl_players;
create policy "snl players insert own"
  on public.snl_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and snl_can_join(session_id));

drop policy if exists "snl rolls readable by approved" on public.snl_rolls;
create policy "snl rolls readable by approved"
  on public.snl_rolls for select to authenticated
  using (is_approved());

drop policy if exists "snl rolls insert own" on public.snl_rolls;
create policy "snl rolls insert own"
  on public.snl_rolls for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and seat = snl_my_seat(session_id)
  );

-- ---------- realtime ----------
-- Adds each table to realtime unless it's already there, so this is safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'snl_sessions') then
    alter publication supabase_realtime add table public.snl_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'snl_players') then
    alter publication supabase_realtime add table public.snl_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'snl_rolls') then
    alter publication supabase_realtime add table public.snl_rolls;
  end if;
end $$;
