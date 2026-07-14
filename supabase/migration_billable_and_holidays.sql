-- ============================================================
-- Migration: add BILLABLE flag + HOLIDAY CALENDAR to an EXISTING
-- SAP Consultant Log database.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
-- ============================================================

alter table public.entries
  add column if not exists billable boolean not null default true;

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;

drop policy if exists "holidays_select_all" on public.holidays;
create policy "holidays_select_all"
  on public.holidays for select
  using (auth.role() = 'authenticated');

drop policy if exists "holidays_insert_admin" on public.holidays;
create policy "holidays_insert_admin"
  on public.holidays for insert
  with check (public.is_admin(auth.uid()));

drop policy if exists "holidays_delete_admin" on public.holidays;
create policy "holidays_delete_admin"
  on public.holidays for delete
  using (public.is_admin(auth.uid()));

create index if not exists holidays_date_idx on public.holidays(date);
