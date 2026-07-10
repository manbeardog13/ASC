-- ============================================================================
-- HOTFIX — v7 column that was in schema.sql but never applied to production.
-- Symptom: "Could not find the 'hubcaps_location' column of 'storage_sets'
--           in the schema cache" when saving a new set from Zaprimi.
-- Idempotent, safe to re-run.
-- ============================================================================
alter table storage_sets add column if not exists hubcaps_location text;  -- 'in_trunk' | 'stored' | 'none' | null

-- Backfill: rows saved before v7 only had the boolean — carry it over.
update storage_sets set hubcaps_location = 'stored'
  where hubcaps_location is null and hubcaps_stored = true;

-- Tell PostgREST to reload its schema cache immediately (no waiting).
notify pgrst, 'reload schema';
