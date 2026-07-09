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

-- Stored tire photos (objects in the private bucket):
delete from storage.objects where bucket_id = 'tire-photos';

commit;

-- Verify (every count should be 0):
select
  (select count(*) from customers)     as customers,
  (select count(*) from vehicles)      as vehicles,
  (select count(*) from storage_sets)  as storage_sets,
  (select count(*) from tires)         as tires,
  (select count(*) from photos)        as photos,
  (select count(*) from audit_events)  as audit_events,
  (select count(*) from storage.objects where bucket_id = 'tire-photos') as photo_files;
