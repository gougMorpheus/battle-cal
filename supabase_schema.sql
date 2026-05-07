create table if not exists public.battle_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.battle_results (
  id text primary key,
  profile_id uuid not null references public.battle_profiles(id) on delete cascade,
  created_at timestamptz not null,
  custom_title text not null default '',
  inputs jsonb not null,
  outputs jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists battle_results_profile_created_idx
  on public.battle_results (profile_id, created_at desc);

alter table public.battle_profiles enable row level security;
alter table public.battle_results enable row level security;

drop policy if exists "public profiles read" on public.battle_profiles;
drop policy if exists "public profiles write" on public.battle_profiles;
drop policy if exists "public results read" on public.battle_results;
drop policy if exists "public results write" on public.battle_results;

create policy "public profiles read"
  on public.battle_profiles
  for select
  to anon
  using (true);

create policy "public profiles write"
  on public.battle_profiles
  for all
  to anon
  using (true)
  with check (true);

create policy "public results read"
  on public.battle_results
  for select
  to anon
  using (true);

create policy "public results write"
  on public.battle_results
  for all
  to anon
  using (true)
  with check (true);
