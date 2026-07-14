-- Fixes the role-escalation trigger so it only blocks CLIENT requests
-- (where auth.uid() is a real logged-in user), not SQL Editor / service-role
-- operations (where auth.uid() is NULL). Run this once if you already
-- deployed schema.sql before this fix was added.

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

-- now a direct role update from the SQL Editor will actually stick, e.g.:
-- update public.profiles set role = 'admin' where email = 'you@yourcompany.com';
