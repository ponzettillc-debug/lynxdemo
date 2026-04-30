create table if not exists public.driver_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  distance_yards integer not null check (distance_yards > 0),
  wind_mph integer not null default 0,
  power integer not null default 0,
  accuracy integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists driver_scores_user_distance_idx
  on public.driver_scores (user_id, distance_yards desc, created_at desc);

