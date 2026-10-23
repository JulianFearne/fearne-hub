-- Wardrobe (phase 2 draft, NOT yet applied). Private per user: every table
-- is owner-only under RLS, unlike the family-shared recipes and meal plans.
-- See docs/wardrobe/PLAN.md.

create table if not exists wardrobe_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,               -- fearne-style-profile JSON
  updated_at timestamptz not null default now()
);

create table if not exists wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subtype text not null,                -- engine SUBTYPES key
  colour text not null,                 -- profile palette id
  pattern text not null default 'solid' check (pattern in ('solid', 'stripe', 'check')),
  slot_id text,                         -- profile slots[].id
  formality int[],                      -- [min, max] override, null = type default
  warmth int check (warmth between 1 and 3),
  waterproof boolean,
  status text not null default 'available' check (status in ('available', 'laundry')),
  price numeric(8, 2),
  photo_path text,                      -- object path in the private 'wardrobe' bucket
  created_at timestamptz not null default now()
);
create index if not exists wardrobe_items_user on wardrobe_items (user_id);

create table if not exists wardrobe_wears (
  item_id uuid not null references wardrobe_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  worn_on date not null,
  primary key (item_id, worn_on)
);

create table if not exists wardrobe_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parts jsonb not null,                 -- { base, mid, outer, coat, bottom, shoes } item ids
  occasion text not null,
  band text,
  rain boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists wardrobe_week_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  occasion text not null,
  band text not null,
  rain boolean not null default false,
  temp numeric(4, 1),
  parts jsonb,
  locked boolean not null default false,
  primary key (user_id, day)
);

alter table wardrobe_profiles enable row level security;
alter table wardrobe_items enable row level security;
alter table wardrobe_wears enable row level security;
alter table wardrobe_outfits enable row level security;
alter table wardrobe_week_days enable row level security;

create policy "own profile" on wardrobe_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own items" on wardrobe_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own wears" on wardrobe_wears for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own outfits" on wardrobe_outfits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own week" on wardrobe_week_days for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private photo bucket; files stored under '<user id>/<item id>.jpg'.
insert into storage.buckets (id, name, public) values ('wardrobe', 'wardrobe', false)
on conflict (id) do nothing;

create policy "own wardrobe photos" on storage.objects for all
  using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = auth.uid()::text);
