create table if not exists public.live_4play_tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by text,
  name text not null,
  format text not null check (format in ('Points', 'Skins', 'Ryder Cup', 'Coon', 'Salmon Falls - Regular')),
  holes_count integer not null check (holes_count in (9, 18)),
  team_names text[] not null check (array_length(team_names, 1) between 2 and 4),
  scores jsonb not null default '[]'::jsonb,
  status text not null default 'live' check (status in ('live', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_4play_tournaments_status_updated_idx
  on public.live_4play_tournaments (status, updated_at desc);

create index if not exists live_4play_tournaments_owner_idx
  on public.live_4play_tournaments (owner_user_id, updated_at desc);

alter table public.live_4play_tournaments
  drop constraint if exists live_4play_tournaments_format_check;

alter table public.live_4play_tournaments
  add constraint live_4play_tournaments_format_check
  check (format in ('Points', 'Skins', 'Ryder Cup', 'Coon', 'Salmon Falls - Regular'));
