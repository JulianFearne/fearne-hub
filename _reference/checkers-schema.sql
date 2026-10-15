-- checkers-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy). Safe to
-- re-run.
--
-- Online Checkers (English draughts) for two players. Same pattern as the
-- other online games: sessions + players + an append-only move log. Each
-- move is one row holding its path of squares, e.g. '21-14-5' for a double
-- jump. The board, whose turn it is and the winner are DERIVED in the app
-- by replaying the moves (deriveOnline in
-- src/pages/games/checkers/engine.js), which also skips anything illegal.
-- The host plays Red (seat 0) and goes first.
--
-- Assumes your existing public.is_approved() helper exists.

-- ---------- tables ----------

create table if not exists public.ck_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  winner_seat   smallint check (winner_seat between 0 and 1), -- null + finished = draw or ended early
  rematch_id    uuid references public.ck_sessions(id) on delete set null,
  rules_version integer not null default 1
);

create index if not exists ck_sessions_open_code_idx
  on public.ck_sessions (code)
  where status = 'waiting';

create table if not exists public.ck_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.ck_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 1), -- 0 Red, 1 White
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

create table if not exists public.ck_moves (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.ck_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        smallint not null check (seat between 0 and 1),
  path        text not null check (path ~ '^[0-9]{1,2}(-[0-9]{1,2}){1,12}$'),
  move_number integer not null,
  created_at  timestamptz not null default now(),
  unique (session_id, move_number) -- protects against a two-write race
);

create index if not exists ck_moves_session_idx
  on public.ck_moves (session_id, move_number);

-- ---------- RLS ----------
-- Each policy is dropped first so the whole file is safe to re-run.

alter table public.ck_sessions enable row level security;
alter table public.ck_players  enable row level security;
alter table public.ck_moves    enable row level security;

-- The current user's seat in this session (null if not a player).
create or replace function public.ck_my_seat(sess uuid)
returns smallint
language sql
security definer
stable
as $$
  select p.seat from public.ck_players p
  where p.session_id = sess
    and p.user_id = auth.uid();
$$;

-- Still waiting for a second player.
create or replace function public.ck_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.ck_sessions s where s.id = sess and s.status = 'waiting')
     and (select count(*) from public.ck_players where session_id = sess) < 2;
$$;

drop policy if exists "ck sessions readable by approved" on public.ck_sessions;
create policy "ck sessions readable by approved"
  on public.ck_sessions for select to authenticated
  using (is_approved());

drop policy if exists "ck sessions insert own" on public.ck_sessions;
create policy "ck sessions insert own"
  on public.ck_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

drop policy if exists "ck sessions update by player" on public.ck_sessions;
create policy "ck sessions update by player"
  on public.ck_sessions for update to authenticated
  using (is_approved() and ck_my_seat(id) is not null)
  with check (is_approved());

drop policy if exists "ck players readable by approved" on public.ck_players;
create policy "ck players readable by approved"
  on public.ck_players for select to authenticated
  using (is_approved());

drop policy if exists "ck players insert own" on public.ck_players;
create policy "ck players insert own"
  on public.ck_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and ck_can_join(session_id));

drop policy if exists "ck moves readable by approved" on public.ck_moves;
create policy "ck moves readable by approved"
  on public.ck_moves for select to authenticated
  using (is_approved());

drop policy if exists "ck moves insert own" on public.ck_moves;
create policy "ck moves insert own"
  on public.ck_moves for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and seat = ck_my_seat(session_id)
  );

-- ---------- realtime ----------
-- Adds each table to realtime unless it's already there, so this is safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ck_sessions') then
    alter publication supabase_realtime add table public.ck_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ck_players') then
    alter publication supabase_realtime add table public.ck_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ck_moves') then
    alter publication supabase_realtime add table public.ck_moves;
  end if;
end $$;
