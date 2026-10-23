-- Wardrobe, test phase (fearne.org/wardrobe/). Run once in the Supabase SQL
-- editor. One private row per user holding the app's whole state as JSON,
-- plus a private photo bucket. Owner-only: no other family member, admin or
-- not, can read it. The normalised tables in wardrobe-schema.sql replace this
-- if the wardrobe becomes a full React section.

create table if not exists wardrobe_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table wardrobe_state enable row level security;

drop policy if exists "own wardrobe state" on wardrobe_state;
create policy "own wardrobe state" on wardrobe_state for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Photos live at '<user id>/<item id>.jpg' and are shown through short-lived
-- signed URLs, so the bucket is never public.
insert into storage.buckets (id, name, public) values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;

drop policy if exists "own wardrobe photos" on storage.objects;
create policy "own wardrobe photos" on storage.objects for all
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
