-- wobbly-towers-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy). Safe to
-- re-run.
--
-- Online Wobbly Towers races. Each player's tower is simulated on their own
-- device, so nothing here describes a tower: the tables hold the lobby, the
-- race settings (mode, goal height and the seed that gives everyone the
-- same pieces), who has been knocked out, and the winner. Live heights and
-- attack power-ups travel over a Realtime broadcast channel, which needs no
-- table.
--
-- Assumes your existing public.is_approved() helper exists.

-- ---------- tables ----------

create table if not exists public.wt_sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  host_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  status        text not null default 'waiting'
                check (status in ('waiting', 'active', 'finished')),
  mode          text not null default 'powerups' check (mode in ('classic', 'powerups')),
  goal          smallint not null default 25 check (goal between 5 and 100), -- blocks to the finish line
  seed          integer not null,  -- shared piece order
  num_players   smallint check (num_players between 2 and 4),
  winner_seat   smallint check (winner_seat between 0 and 3), -- null + finished = called off
  rematch_id    uuid references public.wt_sessions(id) on delete set null,
  rules_version integer not null default 1
);

create index if not exists wt_sessions_open_code_idx
  on public.wt_sessions (code)
  where status = 'waiting';

create table if not exists public.wt_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.wt_sessions(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat         smallint not null check (seat between 0 and 3),
  out          boolean not null default false, -- lost all their lives
  best         smallint not null default 0,    -- tallest they got, set when knocked out
  joined_at    timestamptz not null default now(),
  unique (session_id, seat),
  unique (session_id, user_id)
);

-- ---------- RLS ----------
-- Each policy is dropped first so the whole file is safe to re-run.

alter table public.wt_sessions enable row level security;
alter table public.wt_players  enable row level security;

create or replace function public.wt_is_player(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.wt_players p where p.session_id = sess and p.user_id = auth.uid());
$$;

create or replace function public.wt_can_join(sess uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.wt_sessions s where s.id = sess and s.status = 'waiting')
     and (select count(*) from public.wt_players where session_id = sess) < 4;
$$;

drop policy if exists "wt sessions readable by approved" on public.wt_sessions;
create policy "wt sessions readable by approved"
  on public.wt_sessions for select to authenticated
  using (is_approved());

drop policy if exists "wt sessions insert own" on public.wt_sessions;
create policy "wt sessions insert own"
  on public.wt_sessions for insert to authenticated
  with check (is_approved() and host_id = auth.uid());

drop policy if exists "wt sessions update by player" on public.wt_sessions;
create policy "wt sessions update by player"
  on public.wt_sessions for update to authenticated
  using (is_approved() and wt_is_player(id))
  with check (is_approved());

drop policy if exists "wt players readable by approved" on public.wt_players;
create policy "wt players readable by approved"
  on public.wt_players for select to authenticated
  using (is_approved());

drop policy if exists "wt players insert own" on public.wt_players;
create policy "wt players insert own"
  on public.wt_players for insert to authenticated
  with check (is_approved() and user_id = auth.uid() and wt_can_join(session_id));

drop policy if exists "wt players update own" on public.wt_players;
create policy "wt players update own"
  on public.wt_players for update to authenticated
  using (is_approved() and user_id = auth.uid())
  with check (is_approved() and user_id = auth.uid());

-- ---------- realtime ----------
-- Adds each table to realtime unless it's already there, so this is safe to re-run.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wt_sessions') then
    alter publication supabase_realtime add table public.wt_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'wt_players') then
    alter publication supabase_realtime add table public.wt_players;
  end if;
end $$;
