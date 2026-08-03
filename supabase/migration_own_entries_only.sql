-- ============================================================
-- Migration: consultants see only their own entries in the
-- Activity Log; admins still see everyone's. Run once in
-- Supabase → SQL Editor. Safe to re-run (idempotent).
-- ============================================================

drop policy if exists "entries_select_all" on public.entries;
drop policy if exists "entries_select_own_or_admin" on public.entries;

create policy "entries_select_own_or_admin"
  on public.entries for select
  using (auth.uid() = consultant_id or public.is_admin(auth.uid()));
