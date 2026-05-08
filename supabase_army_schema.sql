create table if not exists public.army_rosters (
  id text primary key,
  profile_id uuid references public.battle_profiles(id) on delete cascade,
  name text not null,
  source_file text not null,
  catalogue_name text not null default '',
  game_system_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.army_rosters
  add column if not exists profile_id uuid references public.battle_profiles(id) on delete cascade;

create table if not exists public.army_units (
  id text primary key,
  roster_id text not null references public.army_rosters(id) on delete cascade,
  source_file text not null,
  name text not null,
  model_count integer not null default 1,
  profile_name text not null default '',
  movement_text text not null default '',
  toughness integer,
  save integer,
  wounds_per_model integer,
  leadership_text text not null default '',
  objective_control integer,
  raw_selection jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.army_weapons (
  id text primary key,
  roster_id text not null references public.army_rosters(id) on delete cascade,
  unit_id text not null references public.army_units(id) on delete cascade,
  name text not null,
  weapon_type text not null default '',
  weapon_role text not null default 'weapon',
  count integer not null default 1,
  range_text text not null default '',
  attacks_text text not null default '',
  skill_text text not null default '',
  strength_text text not null default '',
  ap_text text not null default '',
  damage_text text not null default '',
  keywords text[] not null default '{}',
  raw_profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.army_weapons
  add column if not exists weapon_role text not null default 'weapon';

update public.army_weapons
  set weapon_role = 'profile'
  where weapon_role = 'weapon'
    and (name like '➤%' or name like '% - %');

create index if not exists army_units_roster_name_idx
  on public.army_units (roster_id, name);

create index if not exists army_rosters_profile_name_idx
  on public.army_rosters (profile_id, name);

create index if not exists army_weapons_unit_name_idx
  on public.army_weapons (unit_id, name);

alter table public.army_rosters enable row level security;
alter table public.army_units enable row level security;
alter table public.army_weapons enable row level security;

drop policy if exists "public army rosters read" on public.army_rosters;
drop policy if exists "public army rosters write" on public.army_rosters;
drop policy if exists "public army units read" on public.army_units;
drop policy if exists "public army units write" on public.army_units;
drop policy if exists "public army weapons read" on public.army_weapons;
drop policy if exists "public army weapons write" on public.army_weapons;

create policy "public army rosters read"
  on public.army_rosters
  for select
  to anon
  using (true);

create policy "public army rosters write"
  on public.army_rosters
  for all
  to anon
  using (true)
  with check (true);

create policy "public army units read"
  on public.army_units
  for select
  to anon
  using (true);

create policy "public army units write"
  on public.army_units
  for all
  to anon
  using (true)
  with check (true);

create policy "public army weapons read"
  on public.army_weapons
  for select
  to anon
  using (true);

create policy "public army weapons write"
  on public.army_weapons
  for all
  to anon
  using (true)
  with check (true);
