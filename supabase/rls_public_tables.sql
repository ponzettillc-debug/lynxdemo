-- Enable Row-Level Security for the app's public tables.
-- Run this in the Supabase SQL Editor for project zynztesjkqrstmzadjqy.
-- Anonymous users are blocked. Authenticated app users keep the access paths
-- the current client needs, while admin/service-role API routes continue to work.

create or replace function public.is_4play_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'ponzettillc@gmail.com';
$$;

create or replace function public.is_pool_member(target_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.pool_members pm
    where pm.pool_id = target_pool_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.is_pool_admin(target_pool_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_4play_admin()
    or exists (
      select 1
      from public.pool_members pm
      where pm.pool_id = target_pool_id
        and pm.user_id = auth.uid()
        and coalesce(pm.role, '') in ('owner', 'admin')
    );
$$;

alter table if exists public.pools enable row level security;
alter table if exists public.pool_members enable row level security;
alter table if exists public.tournaments enable row level security;
alter table if exists public.golfers enable row level security;
alter table if exists public.picks enable row level security;
alter table if exists public.scores enable row level security;
alter table if exists public.tournament_golfers enable row level security;
alter table if exists public.driver_scores enable row level security;
alter table if exists public.tee_off_scores enable row level security;
alter table if exists public.live_4play_tournaments enable row level security;

drop policy if exists "pools_select_member" on public.pools;
create policy "pools_select_member"
on public.pools
for select
to authenticated
using (public.is_pool_member(id) or public.is_4play_admin());

drop policy if exists "pools_insert_admin" on public.pools;
create policy "pools_insert_admin"
on public.pools
for insert
to authenticated
with check (owner_id = auth.uid() or public.is_4play_admin());

drop policy if exists "pools_update_admin" on public.pools;
create policy "pools_update_admin"
on public.pools
for update
to authenticated
using (public.is_pool_admin(id))
with check (public.is_pool_admin(id));

drop policy if exists "pools_delete_admin" on public.pools;
create policy "pools_delete_admin"
on public.pools
for delete
to authenticated
using (public.is_pool_admin(id));

drop policy if exists "pool_members_select_self_or_admin" on public.pool_members;
create policy "pool_members_select_self_or_admin"
on public.pool_members
for select
to authenticated
using (user_id = auth.uid() or public.is_pool_admin(pool_id));

drop policy if exists "pool_members_manage_admin" on public.pool_members;
create policy "pool_members_manage_admin"
on public.pool_members
for all
to authenticated
using (public.is_pool_admin(pool_id))
with check (public.is_pool_admin(pool_id));

drop policy if exists "tournaments_select_pool_member" on public.tournaments;
create policy "tournaments_select_pool_member"
on public.tournaments
for select
to authenticated
using (public.is_pool_member(pool_id) or public.is_4play_admin());

drop policy if exists "tournaments_manage_admin" on public.tournaments;
create policy "tournaments_manage_admin"
on public.tournaments
for all
to authenticated
using (public.is_pool_admin(pool_id))
with check (public.is_pool_admin(pool_id));

drop policy if exists "golfers_select_pool_member" on public.golfers;
create policy "golfers_select_pool_member"
on public.golfers
for select
to authenticated
using (public.is_pool_member(pool_id) or public.is_4play_admin());

drop policy if exists "golfers_manage_admin" on public.golfers;
create policy "golfers_manage_admin"
on public.golfers
for all
to authenticated
using (public.is_pool_admin(pool_id))
with check (public.is_pool_admin(pool_id));

drop policy if exists "picks_select_owner_or_admin" on public.picks;
create policy "picks_select_owner_or_admin"
on public.picks
for select
to authenticated
using (user_id = auth.uid() or public.is_pool_admin(pool_id));

drop policy if exists "picks_insert_owner" on public.picks;
create policy "picks_insert_owner"
on public.picks
for insert
to authenticated
with check ((user_id = auth.uid() and public.is_pool_member(pool_id)) or public.is_pool_admin(pool_id));

drop policy if exists "picks_update_owner" on public.picks;
create policy "picks_update_owner"
on public.picks
for update
to authenticated
using ((user_id = auth.uid() and public.is_pool_member(pool_id)) or public.is_pool_admin(pool_id))
with check ((user_id = auth.uid() and public.is_pool_member(pool_id)) or public.is_pool_admin(pool_id));

drop policy if exists "picks_delete_owner" on public.picks;
create policy "picks_delete_owner"
on public.picks
for delete
to authenticated
using ((user_id = auth.uid() and public.is_pool_member(pool_id)) or public.is_pool_admin(pool_id));

drop policy if exists "scores_select_pool_member" on public.scores;
create policy "scores_select_pool_member"
on public.scores
for select
to authenticated
using (public.is_pool_member(pool_id) or public.is_4play_admin());

drop policy if exists "scores_manage_admin" on public.scores;
create policy "scores_manage_admin"
on public.scores
for all
to authenticated
using (public.is_pool_admin(pool_id))
with check (public.is_pool_admin(pool_id));

drop policy if exists "tournament_golfers_select_pool_member" on public.tournament_golfers;
create policy "tournament_golfers_select_pool_member"
on public.tournament_golfers
for select
to authenticated
using (public.is_pool_member(pool_id) or public.is_4play_admin());

drop policy if exists "tournament_golfers_manage_admin" on public.tournament_golfers;
create policy "tournament_golfers_manage_admin"
on public.tournament_golfers
for all
to authenticated
using (public.is_pool_admin(pool_id))
with check (public.is_pool_admin(pool_id));

drop policy if exists "driver_scores_select_authenticated" on public.driver_scores;
create policy "driver_scores_select_authenticated"
on public.driver_scores
for select
to authenticated
using (true);

drop policy if exists "driver_scores_insert_self" on public.driver_scores;
create policy "driver_scores_insert_self"
on public.driver_scores
for insert
to authenticated
with check (user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "driver_scores_manage_self" on public.driver_scores;
create policy "driver_scores_manage_self"
on public.driver_scores
for update
to authenticated
using (user_id = auth.uid() or public.is_4play_admin())
with check (user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "driver_scores_delete_self" on public.driver_scores;
create policy "driver_scores_delete_self"
on public.driver_scores
for delete
to authenticated
using (user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "tee_off_scores_select_authenticated" on public.tee_off_scores;
create policy "tee_off_scores_select_authenticated"
on public.tee_off_scores
for select
to authenticated
using (true);

drop policy if exists "tee_off_scores_insert_self" on public.tee_off_scores;
create policy "tee_off_scores_insert_self"
on public.tee_off_scores
for insert
to authenticated
with check (user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "tee_off_scores_manage_self" on public.tee_off_scores;
create policy "tee_off_scores_manage_self"
on public.tee_off_scores
for update
to authenticated
using (user_id = auth.uid() or public.is_4play_admin())
with check (user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "tee_off_scores_delete_self" on public.tee_off_scores;
create policy "tee_off_scores_delete_self"
on public.tee_off_scores
for delete
to authenticated
using (user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "live_4play_select_authenticated" on public.live_4play_tournaments;
create policy "live_4play_select_authenticated"
on public.live_4play_tournaments
for select
to authenticated
using (true);

drop policy if exists "live_4play_insert_owner" on public.live_4play_tournaments;
create policy "live_4play_insert_owner"
on public.live_4play_tournaments
for insert
to authenticated
with check (owner_user_id = auth.uid() or public.is_4play_admin());

drop policy if exists "live_4play_update_authenticated" on public.live_4play_tournaments;
create policy "live_4play_update_authenticated"
on public.live_4play_tournaments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "live_4play_delete_owner_or_admin" on public.live_4play_tournaments;
create policy "live_4play_delete_owner_or_admin"
on public.live_4play_tournaments
for delete
to authenticated
using (owner_user_id = auth.uid() or public.is_4play_admin());
