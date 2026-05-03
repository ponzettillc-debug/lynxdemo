create table if not exists public.tournament_golfers (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.pools(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  golfer_id uuid not null references public.golfers(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pool_id, tournament_id, golfer_id)
);

create index if not exists tournament_golfers_pool_tournament_idx
  on public.tournament_golfers(pool_id, tournament_id);

create index if not exists tournament_golfers_golfer_idx
  on public.tournament_golfers(golfer_id);
