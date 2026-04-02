create table if not exists public.planner_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.planner_snapshots enable row level security;

drop policy if exists "Users can read own planner snapshot" on public.planner_snapshots;
create policy "Users can read own planner snapshot"
on public.planner_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own planner snapshot" on public.planner_snapshots;
create policy "Users can insert own planner snapshot"
on public.planner_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own planner snapshot" on public.planner_snapshots;
create policy "Users can update own planner snapshot"
on public.planner_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
