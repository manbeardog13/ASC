-- Permanent owner is toni@nerosummit.com.
-- Replaces the previous hardcoded address. Existing profiles keep their roles;
-- this account is the one the app and asc_protect_owner() refuse to remove.

create or replace function public.asc_owner_email() returns text as $$
  select 'toni@nerosummit.com'::text;
$$ language sql immutable;

do $$
begin
  update public.profiles set role = 'admin'
    where lower(coalesce(email, '')) = lower(public.asc_owner_email());
  if not exists (
    select 1 from public.profiles
     where lower(coalesce(email, '')) = lower(public.asc_owner_email())
  ) then
    insert into public.allowed_emails (email, full_name, role)
    values (lower(public.asc_owner_email()), 'Owner', 'admin')
    on conflict (email) do update set role = 'admin', full_name = excluded.full_name;
  end if;
exception when others then
  raise notice 'owner bootstrap skipped: %', sqlerrm;
end $$;
