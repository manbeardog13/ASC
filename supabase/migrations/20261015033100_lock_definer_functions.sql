-- ============================================================================
-- ASC Tire Hotel — stop the Data API calling SECURITY DEFINER helpers
-- ----------------------------------------------------------------------------
-- ADDITIVE and separate from the tour migration. Apply after it.
-- Postgres grants EXECUTE to PUBLIC by default, and this project also grants
-- it to anon and authenticated. The linter flags that. search_path was unset
-- on asc_owner_email(); it is pinned here together with the other seven.
--
-- Decisions (app + RLS, checked against js/db.js and schema.sql policies):
--   asc_role, asc_is_admin
--     RLS policies call them as the signed-in user. Keep authenticated.
--     The browser never calls them, and anon has no policy that needs them.
--   set_my_name(text)
--     The name gate calls it as the signed-in user. Keep authenticated.
--   asc_owner_email()
--     Not used by RLS or the client. Other definer functions call it as the
--     owner. Authenticated keeps EXECUTE only because it is not a trigger
--     or admin helper; anon does not need it. This was the mutable search_path.
--   handle_new_user(), asc_protect_owner()
--     Trigger functions. Firing a trigger does not need EXECUTE on the
--     session role. Revoke anon, public, and authenticated.
--   purge_deleted(interval)
--     Nightly backup calls it through the database owner, not the Data API.
--     Revoke anon, public, and authenticated.
--   list_users()
--     Not referenced by any RLS policy. The body is not admin-guarded: any
--     role other than readonly can read the directory. Revoke anon, public,
--     and authenticated. Admins still open Users: js/db.js listUsers() falls
--     back to profiles, and profiles_select allows an admin to read every row.
-- ============================================================================

revoke all on function public.asc_role() from public, anon;
grant execute on function public.asc_role() to authenticated;
alter function public.asc_role() set search_path = public, pg_temp;

revoke all on function public.asc_is_admin() from public, anon;
grant execute on function public.asc_is_admin() to authenticated;
alter function public.asc_is_admin() set search_path = public, pg_temp;

revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
alter function public.set_my_name(text) set search_path = public, pg_temp;

revoke all on function public.asc_owner_email() from public, anon;
grant execute on function public.asc_owner_email() to authenticated;
alter function public.asc_owner_email() set search_path = public, pg_temp;

revoke all on function public.handle_new_user() from public, anon, authenticated;
alter function public.handle_new_user() set search_path = public, pg_temp;

revoke all on function public.asc_protect_owner() from public, anon, authenticated;
alter function public.asc_protect_owner() set search_path = public, pg_temp;

revoke all on function public.purge_deleted(interval) from public, anon, authenticated;
alter function public.purge_deleted(interval) set search_path = public, pg_temp;

revoke all on function public.list_users() from public, anon, authenticated;
alter function public.list_users() set search_path = public, pg_temp;
