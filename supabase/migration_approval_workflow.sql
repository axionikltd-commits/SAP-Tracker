-- ============================================================
-- Migration: add submit/approve/reject workflow to an EXISTING
-- SAP Consultant Log database.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
-- ============================================================

alter table public.entries
  add column if not exists status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected')),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

-- replace the delete policy so owners can only delete drafts/rejected rows
drop policy if exists "entries_delete_own_or_admin" on public.entries;
create policy "entries_delete_own_or_admin"
  on public.entries for delete
  using (
    public.is_admin(auth.uid())
    or (auth.uid() = created_by and status in ('draft','rejected'))
  );

-- workflow guardrail trigger
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

-- backfill: every existing row becomes 'draft' by default already (see column default above)
