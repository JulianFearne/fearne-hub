-- ludo-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy).
-- Mirrors the Go Fish / Battleship pattern: sessions + players + an
-- append-only event log. Each turn is a 'roll' row (value = dice 1-6) and,
-- if a token can move, a 'move' row (value = token 0-3). Token positions,
-- whose turn it is and the winner are all DERIVED in the app (see
-- deriveOnline in src/pages/games/ludo/engine.js) by replaying those rows.
-- Nothing here stores the board.
--
-- Dice are rolled on the player's own device, same family-trust model as
-- the other online games.
--
-- Assumes your existing public.is_approved() helper exists.

-- ---------- tables ----------

create table if not exists public.ludo_sessions (
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

create index if not exists ludo_sessions_open_code_idx
  on public.ludo_sessions (code)
  where status = 'waiting';

create table if not exists public.ludo_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.ludo_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 3), -- turn order; colours follow from it
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

create table if not exists public.ludo_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.ludo_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  seat         smallint not null check (seat between 0 and 3),
  type         text not null check (type in ('roll', 'move')),
  value        smallint not null check (value between 0 and 6),
  event_number integer not null,
  created_at   timestamptz not null default now(),
  unique (session_id, event_number) -- protects against a two-write race
);

create index if not exists ludo_events_session_idx
  on public.ludo_events (session_id, event_number);

-- ---------- RLS ----------

alter table public.ludo_sessions enable row level security;
alter table public.ludo_players  enable row level security;
alter table public.ludo_events   enable row level security;

-- The current user's seat in this session (null if not a player).
create or replace function public.ludo_my_seat(sess uuid)
returns smallint
language sql
security definer
stable
as $$
  select p.seat from public.ludo_players p
  where p.session_id = sess
    and p.user_id = auth.uid();
$$;

-- Still taking players: waiting, and fewer than 4 seated.
create or replace function public.ludo_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.ludo_sessions s where s.id = sess and s.status = 'waiting')
     and (select count(*) from public.ludo_players where session_id = sess) < 4;
$$;

create policy "ludo sessions readable by approved"
  on public.ludo_sessions for select to authenticated
  using (is_approved());

create policy "ludo sessions insert own"
  on public.ludo_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

create policy "ludo sessions update by player"
  on public.ludo_sessions for update to authenticated
  using (is_approved() and ludo_my_seat(id) is not null)
  with check (is_approved());

create policy "ludo players readable by approved"
  on public.ludo_players for select to authenticated
  using (is_approved());

create policy "ludo players insert own"
  on public.ludo_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and ludo_can_join(session_id));

create policy "ludo events readable by approved"
  on public.ludo_events for select to authenticated
  using (is_approved());

create policy "ludo events insert own"
  on public.ludo_events for insert to authenticated
  with check (
    is_approved()
    and user_id = auth.uid()
    and seat = ludo_my_seat(session_id)
  );

-- ---------- realtime ----------
-- Safe to re-run; ignore "already member of publication" if it appears.
alter publication supabase_realtime add table public.ludo_sessions;
alter publication supabase_realtime add table public.ludo_players;
alter publication supabase_realtime add table public.ludo_events;
