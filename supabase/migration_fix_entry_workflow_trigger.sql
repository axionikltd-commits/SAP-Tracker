-- ============================================================
-- Migration: fixes enforce_entry_workflow() so it only locks
-- submitted/approved entries against CLIENT requests (a real
-- logged-in non-admin user), not SQL Editor / service-role
-- operations where auth.uid() is NULL. Run once. Idempotent.
-- ============================================================

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

  if auth.uid() is not null and not admin then
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
  elsif admin then
    if new.status in ('approved','rejected') and new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;
