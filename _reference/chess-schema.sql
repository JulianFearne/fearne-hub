-- chess-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy). Safe to
-- re-run.
--
-- Online Chess for two players. Same pattern as Checkers: sessions +
-- players + an append-only move log. Each move is one row in UCI form,
-- e.g. 'e2e4', or 'e7e8q' for a pawn promoted to a queen. The position,
-- whose turn it is and the result are DERIVED in the app by replaying the
-- moves through chess.js (replay in src/pages/games/chess/engine.js),
-- which also stops at anything illegal. The host plays White (seat 0) and
-- goes first.
--
-- Assumes your existing public.is_approved() helper exists.

-- ---------- tables ----------

create table if not exists public.ch_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  winner_seat   smallint check (winner_seat between 0 and 1), -- null + finished = draw or ended early
  rematch_id    uuid references public.ch_sessions(id) on delete set null,
  rules_version integer not null default 1
);

create index if not exists ch_sessions_open_code_idx
  on public.ch_sessions (code)
  where status = 'waiting';

create table if not exists public.ch_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.ch_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 1), -- 0 White, 1 Black
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

create table if not exists public.ch_moves (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.ch_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  seat        smallint not null check (seat between 0 and 1),
  uci         text not null check (uci ~ '^[a-h][1-8][a-h][1-8][qrbn]?$'),
  move_number integer not null,
  created_at  timestamptz not null default now(),
  unique (session_id, move_number) -- protects against a two-write race
);

create index if not exists ch_moves_session_idx
  on public.ch_moves (session_id, move_number);

-- ---------- RLS ----------
-- Each policy is dropped first so the whole file is safe to re-run.

alter table public.ch_sessions enable row level security;
alter table public.ch_players  enable row level security;
alter table public.ch_moves    enable row level security;

-- The current user's seat in this session (null if not a player).
create or replace function public.ch_my_seat(sess uuid)
returns smallint
language sql
security definer
stable
as $$
  select p.seat from public.ch_players p
  where p.session_id = sess
    and p.user_id = auth.uid();
$$;

-- Still waiting for a second player.
create or replace function public.ch_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.ch_sessions s where s.id = sess and s.status = 'waiting')
     and (select count(*) from public.ch_players where session_id = sess) < 2;
$$;

drop policy if exists "ch sessions readable by approved" on public.ch_sessions;
create policy "ch sessions readable by approved"
  on public.ch_sessions for select to authenticated
  using (is_approved());

drop policy if exists "ch sessions insert own" on public.ch_sessions;
create policy "ch sessions insert own"
  on public.ch_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

drop policy if exists "ch sessions update by player" on public.ch_sessions;
create policy "ch sessions update by player"
  on public.ch_sessions for update to authenticated
  using (is_approved() and ch_my_seat(id) is not null)
  with check (is_approved());

drop policy if exists "ch players readable by approved" on public.ch_players;
create policy "ch players readable by approved"
  on public.ch_players for select to authenticated
  using (is_approved());

drop policy if exists "ch players insert own" on public.ch_players;
create policy "ch players insert own"
  on public.ch_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and ch_can_join(session_id));

drop policy if exists "ch moves readable by approved" on public.ch_moves;
create policy "ch moves readable by approved"
  on public.ch_moves for select to authenticated
  using (is_approved());

drop policy if exists "ch moves insert own" on public.ch_moves;
create policy "ch moves insert own"
  on public.ch_moves for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and seat = ch_my_seat(session_id)
  );

-- ---------- realtime ----------
-- Adds each table to realtime unless it's already there, so this is safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ch_sessions') then
    alter publication supabase_realtime add table public.ch_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ch_players') then
    alter publication supabase_realtime add table public.ch_players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ch_moves') then
    alter publication supabase_realtime add table public.ch_moves;
  end if;
end $$;
