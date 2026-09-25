-- _reference/lists-schema.sql
-- Fearne Hub :: generalise shopping lists into "lists".
--
-- Shopping lists become one kind of list among several (shopping, to-do,
-- checklist). The two tables are renamed rather than recreated, so every
-- existing list and item is kept, along with its RLS policies, and existing
-- lists default to kind = 'shopping'.
--
-- `kind` is deliberately free text with no check constraint: new kinds are
-- added in code (LIST_KINDS in src/pages/listsData.js) with no schema change.
-- Unknown values are shown as shopping lists.
--
-- Run this once against the existing Supabase project, at the same time as
-- deploying the app change (the app queries `lists` / `list_items` from now
-- on, so lists will fail to load until this has run).

alter table shopping_lists rename to lists;
alter table shopping_list_items rename to list_items;

alter table lists
  add column if not exists kind text not null default 'shopping';

create index if not exists lists_kind_idx on lists (kind);
