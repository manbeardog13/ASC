-- ============================================================================
-- ASC Tire Hotel — remember that a person has finished the first-run tour
-- ----------------------------------------------------------------------------
-- ADDITIVE. Apply after the locations migrations. Do not edit profiles by
-- hand. The app reads profiles.onboarded_at and stamps it with mark_onboarded().
-- Profile writes are admin-only under RLS, so the stamp is a SECURITY DEFINER
-- function that can touch only the caller's own row.
-- ============================================================================

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

create or replace function public.mark_onboarded()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  update public.profiles
     set onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid()
   returning onboarded_at into v;
  return v;
end;
$$;

revoke all on function public.mark_onboarded() from public, anon;
grant execute on function public.mark_onboarded() to authenticated;
