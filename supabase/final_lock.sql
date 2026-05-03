alter table public.tournaments
  add column if not exists final_lock timestamptz;

create index if not exists tournaments_pool_final_lock_idx
  on public.tournaments(pool_id, final_lock);
