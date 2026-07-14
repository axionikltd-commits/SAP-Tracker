-- ============================================================
-- Migration: move Billable from per-entry to per-PROJECT, restrict
-- project creation to admins, and add consultant<->project
-- ASSIGNMENTS so each consultant's Add Entry dropdown only shows
-- projects they've been assigned to.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
-- ============================================================

alter table public.projects
  add column if not exists billable boolean not null default true;

-- consultants used to be able to create projects inline; now only admins can
drop policy if exists "projects_insert_authenticated" on public.projects;
drop policy if exists "projects_insert_admin" on public.projects;
create policy "projects_insert_admin"
  on public.projects for insert
  with check (public.is_admin(auth.uid()));

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  consultant_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, consultant_id)
);

alter table public.project_assignments enable row level security;

drop policy if exists "assignments_select_all" on public.project_assignments;
create policy "assignments_select_all"
  on public.project_assignments for select
  using (auth.role() = 'authenticated');

drop policy if exists "assignments_insert_admin" on public.project_assignments;
create policy "assignments_insert_admin"
  on public.project_assignments for insert
  with check (public.is_admin(auth.uid()));

drop policy if exists "assignments_delete_admin" on public.project_assignments;
create policy "assignments_delete_admin"
  on public.project_assignments for delete
  using (public.is_admin(auth.uid()));

create index if not exists assignments_project_idx on public.project_assignments(project_id);
create index if not exists assignments_consultant_idx on public.project_assignments(consultant_id);

-- One-time convenience: assign every existing project to every existing
-- consultant, so nobody is suddenly locked out of projects they were
-- already logging time against. Remove/adjust assignments afterward in
-- Settings → Projects as needed.
insert into public.project_assignments (project_id, consultant_id)
select p.id, pr.id
from public.projects p
cross join public.profiles pr
where pr.role = 'consultant'
on conflict (project_id, consultant_id) do nothing;
