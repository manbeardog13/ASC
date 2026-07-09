-- ============================================================================
-- ASC — purge ALL test data before customer handover.        (2026-07-09)
--
-- Run ONCE in the Supabase SQL Editor (project ilnqhlrvchuvpjgptjfx) right
-- before delivery. Empties every business table and the tire-photos bucket,
-- but PRESERVES logins and permissions:
--   • profiles        (your team's accounts + roles)  — kept
--   • allowed_emails  (who may sign in)               — kept
--   • auth.users      (Supabase accounts)             — kept
--
-- Order matters only for clarity — FKs cascade from customers downward.
-- Idempotent: safe to re-run; an already-empty database stays empty.
-- ============================================================================

begin;

-- Business data (tires/photos/vehicles/storage_sets cascade from customers,
-- but delete explicitly so the intent is auditable):
delete from photos;
delete from tires;
delete from storage_sets;
delete from vehicles;
delete from customers;

-- Audit trail of the testing period:
delete from audit_events;

commit;

-- NOTE: tire-photo FILES cannot be deleted via SQL (storage.protect_delete
-- blocks direct deletes on storage.objects). Empty the bucket via the
-- dashboard: Storage → tire-photos → select all → Delete. With the photos
-- table wiped above, any leftover files are unreferenced and invisible to
-- the app either way.

-- Verify (every count should be 0):
select
  (select count(*) from customers)     as customers,
  (select count(*) from vehicles)      as vehicles,
  (select count(*) from storage_sets)  as storage_sets,
  (select count(*) from tires)         as tires,
  (select count(*) from photos)        as photos,
  (select count(*) from audit_events)  as audit_events;
