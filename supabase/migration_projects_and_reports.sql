-- ============================================================
-- Migration: add PROJECTS + project-wise reporting to an EXISTING
-- SAP Consultant Log database.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
-- ============================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  client_name text,
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

drop policy if exists "projects_select_all" on public.projects;
create policy "projects_select_all"
  on public.projects for select
  using (auth.role() = 'authenticated');

drop policy if exists "projects_insert_authenticated" on public.projects;
create policy "projects_insert_authenticated"
  on public.projects for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "projects_update_admin" on public.projects;
create policy "projects_update_admin"
  on public.projects for update
  using (public.is_admin(auth.uid()));

drop policy if exists "projects_delete_admin" on public.projects;
create policy "projects_delete_admin"
  on public.projects for delete
  using (public.is_admin(auth.uid()));

alter table public.entries
  add column if not exists project_id uuid references public.projects(id),
  add column if not exists project_name text;

create index if not exists entries_project_idx on public.entries(project_id);

-- Optional: backfill a placeholder project for existing entries so old rows
-- aren't blank in reports. Uncomment and edit if you want this.
-- insert into public.projects (name) values ('Unassigned') on conflict (name) do nothing;
-- update public.entries set project_name = 'Unassigned'
--   where project_name is null;
