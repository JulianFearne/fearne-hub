-- _reference/lists-sharing-schema.sql
-- Fearne Hub :: per-list sharing.
--
-- Lists stop being visible to the whole family. The person who creates a
-- list (lists.created_by) owns it; everyone else only sees it if it has been
-- shared with them in list_shares, at one of three levels:
--
--   view    see the list and its items
--   edit    view, plus add, tick and remove items
--   manage  edit, plus rename, share and delete the list (same as the owner)
--
-- Admins get no special access: private means private.
--
-- So nothing disappears, every existing list is shared at 'edit' with every
-- currently approved member (other than its owner). People who join later
-- need adding by hand.
--
-- Assumes the existing public.is_approved() helper. Run this once, after
-- lists-schema.sql, and before (or together with) deploying the app change.

-- ---------- table + access helpers ----------
-- lists.id may be uuid or bigint depending on how the table was first made,
-- so the column and helper argument types are read from the live table.
--
-- The helpers are SECURITY DEFINER so the policies below can read lists /
-- list_shares without recursing through those tables' own RLS.
--   list_access(id)  the caller's access: 'owner', 'manage', 'edit', 'view' or null

do $$
declare id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a
  where a.attrelid = 'public.lists'::regclass and a.attname = 'id';

  execute format($f$
    create table if not exists public.list_shares (
      list_id    %1$s        not null references public.lists (id) on delete cascade,
      user_id    uuid        not null references auth.users (id) on delete cascade,
      permission text        not null check (permission in ('view', 'edit', 'manage')),
      created_at timestamptz not null default now(),
      primary key (list_id, user_id)
    )$f$, id_type);

  execute format($f$
    create or replace function public.list_access(lid %1$s)
    returns text language sql security definer stable set search_path = public
    as $b$
      select case
        when not is_approved() then null
        when exists (select 1 from lists l where l.id = lid and l.created_by = auth.uid()) then 'owner'
        else (select s.permission from list_shares s where s.list_id = lid and s.user_id = auth.uid())
      end;
    $b$
    $f$, id_type);

  execute format($f$
    create or replace function public.can_view_list(lid %1$s)
    returns boolean language sql security definer stable set search_path = public
    as $b$ select list_access(lid) is not null; $b$
    $f$, id_type);

  execute format($f$
    create or replace function public.can_edit_list(lid %1$s)
    returns boolean language sql security definer stable set search_path = public
    as $b$ select list_access(lid) in ('owner', 'manage', 'edit'); $b$
    $f$, id_type);

  execute format($f$
    create or replace function public.can_manage_list(lid %1$s)
    returns boolean language sql security definer stable set search_path = public
    as $b$ select list_access(lid) in ('owner', 'manage'); $b$
    $f$, id_type);
end $$;

create index if not exists list_shares_user_idx on public.list_shares (user_id);

grant select, insert, update, delete on public.list_shares to authenticated;

-- ---------- replace the old family-wide policies ----------

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('lists', 'list_items', 'list_shares')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.list_shares enable row level security;

-- lists. The owner check is made directly on the row as well as through
-- the helper, so creating a list and reading it straight back works (the
-- helper can't yet see a row inserted by the same statement).
create policy "lists readable with access"
  on public.lists for select to authenticated
  using ((is_approved() and created_by = auth.uid()) or can_view_list(id));

create policy "lists insert own"
  on public.lists for insert to authenticated
  with check (is_approved() and created_by = auth.uid());

create policy "lists update by manager"
  on public.lists for update to authenticated
  using (can_manage_list(id))
  with check (can_manage_list(id));

create policy "lists delete by manager"
  on public.lists for delete to authenticated
  using (can_manage_list(id));

-- list_items
create policy "list items readable with access"
  on public.list_items for select to authenticated
  using (can_view_list(list_id));

create policy "list items insert by editor"
  on public.list_items for insert to authenticated
  with check (can_edit_list(list_id));

create policy "list items update by editor"
  on public.list_items for update to authenticated
  using (can_edit_list(list_id))
  with check (can_edit_list(list_id));

create policy "list items delete by editor"
  on public.list_items for delete to authenticated
  using (can_edit_list(list_id));

-- list_shares: anyone with access can see who else has it; only managers
-- can change it. Sharing with the owner is pointless, so it's refused.
create policy "list shares readable with access"
  on public.list_shares for select to authenticated
  using (can_view_list(list_id));

create policy "list shares insert by manager"
  on public.list_shares for insert to authenticated
  with check (
    can_manage_list(list_id)
    and user_id <> (select l.created_by from public.lists l where l.id = list_id)
  );

create policy "list shares update by manager"
  on public.list_shares for update to authenticated
  using (can_manage_list(list_id))
  with check (can_manage_list(list_id));

-- ...or by the person it's shared with, so they can leave the list.
create policy "list shares delete by manager or self"
  on public.list_shares for delete to authenticated
  using (can_manage_list(list_id) or user_id = auth.uid());

-- Managers can edit a list's row but must not be able to take it over by
-- rewriting created_by, which a policy alone can't compare old vs new for.
create or replace function public.lists_keep_owner()
returns trigger language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'A list''s owner cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists lists_keep_owner on public.lists;
create trigger lists_keep_owner
  before update on public.lists
  for each row execute function public.lists_keep_owner();

-- ---------- keep existing lists family-visible ----------

insert into public.list_shares (list_id, user_id, permission)
select l.id, p.id, 'edit'
from public.lists l
cross join public.profiles p
where p.approved
  and p.id <> l.created_by
on conflict do nothing;
