-- game-scores-schema.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy). Safe to
-- re-run.
--
-- Family high scores for every game that has one (Snake, Car Dodge,
-- Frogger, Pong, Gem Clash, Wobbly Towers, Sudoku, Freecell, Hangman,
-- Battleship, Checkers, Chess and Connect Four against the computer). One row per finished game; the app
-- shows each person's best per board. `game` and `board` are free text so
-- a new game or mode needs no SQL; how each board is ranked (high or low
-- wins) lives in src/pages/games/lib/scoreBoards.js.
--
-- Assumes your existing public.is_approved() and public.is_admin() helpers
-- exist.

create table if not exists public.game_scores (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  game         text not null check (char_length(game) <= 40),
  board        text not null check (char_length(board) <= 40),
  score        integer not null check (score >= 0)
);

create index if not exists game_scores_board_idx
  on public.game_scores (game, board, score);

alter table public.game_scores enable row level security;

drop policy if exists "game scores readable by approved" on public.game_scores;
create policy "game scores readable by approved"
  on public.game_scores for select to authenticated
  using (is_approved());

drop policy if exists "game scores insert own" on public.game_scores;
create policy "game scores insert own"
  on public.game_scores for insert to authenticated
  with check (is_approved() and user_id = auth.uid());

-- You can delete your own scores; an admin can tidy anyone's.
drop policy if exists "game scores delete own or admin" on public.game_scores;
create policy "game scores delete own or admin"
  on public.game_scores for delete to authenticated
  using (user_id = auth.uid() or is_admin());
