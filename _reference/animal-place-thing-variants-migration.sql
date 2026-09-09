-- animal-place-thing-variants-migration.sql
-- Run in the Supabase SQL Editor (project zcfidrjkpobpetxqmjiy).
--
-- Adds Categories variants (themed category sets + a selectable round
-- length) to the existing AnimalPlaceThing game_sessions table. Additive
-- only — no existing column changes, no RLS changes needed (the existing
-- "insert own" / "readable by approved" policies on game_sessions already
-- cover these two new columns).
--
-- src/pages/scoring.js bumped RULES_VERSION from 1 to 2 alongside this, so
-- any session created before this migration lands will trip the "refresh
-- and rejoin" version-mismatch check instead of silently scoring against
-- the wrong category list.

alter table public.game_sessions
  add column if not exists category_set text not null default 'classic',
  add column if not exists round_seconds integer not null default 90;
