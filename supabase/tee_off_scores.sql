create table if not exists public.tee_off_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  total_score integer not null check (total_score > 0),
  total_par integer not null default 36,
  holes integer[] not null check (array_length(holes, 1) = 9),
  created_at timestamptz not null default now()
);

create index if not exists tee_off_scores_total_idx
  on public.tee_off_scores (total_score asc, created_at desc);

create index if not exists tee_off_scores_user_idx
  on public.tee_off_scores (user_id, created_at desc);
