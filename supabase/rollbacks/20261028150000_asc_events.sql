-- DRAFT rollback: deploy the prior client first, then run as migration owner.
-- Preserve collected evidence. No rows are deleted and no access is widened.
begin;
revoke all on public.asc_events from public, anon, authenticated, service_role;
alter table public.asc_events rename to asc_events_rollback_20261028150000;
commit;
-- Restoring this migration requires separate review of the retained table;
-- do not rerun the forward migration blindly or drop the archive.
