-- ============================================================================
-- ASC Tire Hotel — close asc_audit() and pin set_updated_at's search_path
-- ----------------------------------------------------------------------------
-- Separate from the locations migration on purpose. Apply it second.
--
-- public.asc_audit() is a SECURITY DEFINER trigger. It must not be callable
-- through the Data API. Revoke PUBLIC and anon (and authenticated: PostgREST
-- uses that role, and a trigger does not need it).
--
-- set_updated_at() previously had no search_path, which the database linter
-- flags. The body is unchanged.
-- ============================================================================

revoke all on function public.asc_audit() from public;
revoke all on function public.asc_audit() from anon;
revoke all on function public.asc_audit() from authenticated;

alter function public.set_updated_at() set search_path = public, pg_temp;
