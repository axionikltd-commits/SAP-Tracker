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
  if new.role is distinct from old.role and not public.is_admin(auth.uid()) then
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

-- 2. ENTRIES ------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  consultant_id uuid not null references public.profiles(id) on delete cascade,
  consultant_name text not null,
  expertise text not null check (expertise in ('Technical','Functional')),
  module text not null,
  bod time,
  eod time,
  hrs numeric,
  task text not null,
  result text[] not null default '{}',
  comments text,
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

-- owner or admin can edit
create policy "entries_update_own_or_admin"
  on public.entries for update
  using (auth.uid() = created_by or public.is_admin(auth.uid()));

-- owner or admin can delete
create policy "entries_delete_own_or_admin"
  on public.entries for delete
  using (auth.uid() = created_by or public.is_admin(auth.uid()));

create index if not exists entries_date_idx on public.entries(date);
create index if not exists entries_consultant_idx on public.entries(consultant_id);

-- ============================================================
-- 3. MAKE YOURSELF ADMIN (run this AFTER you sign up in the app)
-- ============================================================
-- update public.profiles set role = 'admin' where email = 'you@yourcompany.com';
