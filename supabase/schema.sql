-- ============================================================
-- SAP Consultant Tracker — Supabase schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query
-- ============================================================

-- 1. PROFILES ---------------------------------------------------
-- One row per auth user. role = 'admin' | 'consultant'
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'consultant' check (role in ('admin','consultant')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = uid and role = 'admin'
  );
$$;

-- everyone can see everyone's profile (needed for filters, admin panel, consultant list)
create policy "profiles_select_all"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- a user can update their own full_name (role changes are blocked below by trigger)
create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id);

-- an admin can update anyone's profile (including role)
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin(auth.uid()));

-- prevent non-admins from smuggling a role change through the self-update policy
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_admin(auth.uid()) then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'consultant'
  );
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. PROJECTS -----------------------------------------------------
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

-- everyone can see the project list (needed for the entry form + filters)
create policy "projects_select_all"
  on public.projects for select
  using (auth.role() = 'authenticated');

-- any signed-in user can add a new project on the fly while logging time
create policy "projects_insert_authenticated"
  on public.projects for insert
  with check (auth.role() = 'authenticated');

-- only an admin can edit or remove a project (dates, name, client)
create policy "projects_update_admin"
  on public.projects for update
  using (public.is_admin(auth.uid()));

create policy "projects_delete_admin"
  on public.projects for delete
  using (public.is_admin(auth.uid()));

-- 3. ENTRIES ------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  consultant_id uuid not null references public.profiles(id) on delete cascade,
  consultant_name text not null,
  project_id uuid references public.projects(id),
  project_name text,
  expertise text not null check (expertise in ('Technical','Functional')),
  module text not null,
  bod time,
  eod time,
  hrs numeric,
  task text not null,
  result text[] not null default '{}',
  comments text,
  billable boolean not null default true,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_comment text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entries enable row level security;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_entries_updated_at on public.entries;
create trigger trg_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

-- whole team can see every entry (shared log)
create policy "entries_select_all"
  on public.entries for select
  using (auth.role() = 'authenticated');

-- any signed-in user can log an entry for themself
create policy "entries_insert_own"
  on public.entries for insert
  with check (auth.uid() = created_by);

-- owner or admin can attempt to edit (fine-grained locking is enforced by the trigger below)
create policy "entries_update_own_or_admin"
  on public.entries for update
  using (auth.uid() = created_by or public.is_admin(auth.uid()));

-- owner can only delete their own drafts/rejected rows; admin can delete anything
create policy "entries_delete_own_or_admin"
  on public.entries for delete
  using (
    public.is_admin(auth.uid())
    or (auth.uid() = created_by and status in ('draft','rejected'))
  );

-- APPROVAL WORKFLOW GUARDRAILS --------------------------------------
-- - Once a row is 'submitted' or 'approved', a non-admin can no longer change it at all.
-- - A non-admin can only move status draft -> submitted, or rejected -> draft/submitted.
-- - Only an admin can set status to 'approved' or 'rejected', and doing so stamps
--   reviewed_by / reviewed_at automatically. Non-admins can't touch review fields.
create or replace function public.enforce_entry_workflow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin boolean;
begin
  admin := public.is_admin(auth.uid());

  if not admin then
    if old.status in ('submitted','approved') then
      raise exception 'This entry is locked and can no longer be edited.';
    end if;

    if new.status not in ('draft','submitted') then
      raise exception 'Only an admin can set that status.';
    end if;

    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    new.review_comment := old.review_comment;

    if new.status = 'submitted' and old.status is distinct from new.status then
      new.submitted_at := now();
    end if;
  else
    if new.status in ('approved','rejected') and new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_entry_workflow on public.entries;
create trigger trg_enforce_entry_workflow
  before update on public.entries
  for each row execute function public.enforce_entry_workflow();

create index if not exists entries_status_idx on public.entries(status);

create index if not exists entries_date_idx on public.entries(date);
create index if not exists entries_consultant_idx on public.entries(consultant_id);
create index if not exists entries_project_idx on public.entries(project_id);

-- 4. HOLIDAYS -------------------------------------------------------
-- Public holidays excluded from "working days" counts in Reports.
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;

create policy "holidays_select_all"
  on public.holidays for select
  using (auth.role() = 'authenticated');

create policy "holidays_insert_admin"
  on public.holidays for insert
  with check (public.is_admin(auth.uid()));

create policy "holidays_delete_admin"
  on public.holidays for delete
  using (public.is_admin(auth.uid()));

create index if not exists holidays_date_idx on public.holidays(date);

-- ============================================================
-- 5. MAKE YOURSELF ADMIN (run this AFTER you sign up in the app)
-- ============================================================
-- update public.profiles set role = 'admin' where email = 'you@yourcompany.com';
