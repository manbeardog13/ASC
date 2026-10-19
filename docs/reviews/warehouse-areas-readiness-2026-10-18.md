# Warehouse areas: verification review, 18 October 2026

This review advances draft PR #31. It does not authorize accepting either PR,
applying a production migration, merging, or deploying.

## Source and stack

- Reviewed starting head: `b9b075d5fbed8c72b46a2b817dc464fdc8e65d69`.
- #31 base is #26's exact head: `732f6a830a8459bd1eaa0e932cc7c198539f7405`.
  Git ancestry confirms the dependency. Both PRs were open drafts, with no
  submitted reviews on #31 at inspection.
- Observed main: `b6a3a06467bb798ceacf0c168df641eec4c807df`.
- A non-mutating `git merge-tree` check finds four #26/main conflicts:
  `app/warehouse-preview/app.js`, `js/mapPin.js`, `service-worker.js`, and
  `tests/map-pin.mjs`. The navigation conflict includes main's asynchronous
  lifecycle guards and the blank-slate branch's non-fictional binding behavior.
  Preserve both when reconciling. This review does not merge or retarget the stack.

## Defects reproduced or established and corrected

- The original seven browser scenarios were absent from CI. The smoke workflow
  now runs the expanded suite and uploads only synthetic test evidence.
- When location loading failed, area/rack validation could be skipped. Unknown
  zones now fail closed; rack moves also validate the destination binding.
- Shared rack edits were committed locally before backend success; capacity
  edits never reached the backend. Shared geometry is now acknowledged only
  after a returned row, and a failed write preserves the saved map.
- An interrupted upload could create its area but strand unsent rack positions.
  The area identity is retained, unsent racks remain eligible, and retry reuses
  the existing area. Shared rack ids also prevent duplicate stacks on moves.
- A readonly cached inspector exposed a local tire-add action. Mutation guards
  now apply at the save boundary as well as the visible controls.
- Shared reads mixed warehouses even though the UI creates areas in `main`.
  Queries and location choices now consistently select that warehouse.
- Update/delete calls could acknowledge zero affected rows. They now require a
  returned row. The actual database adapter has dedicated behavioral tests.
- Broad database defaults left authenticated `TRUNCATE` permission intact.
  The migration now resets grants before allowing only SELECT/INSERT/UPDATE/DELETE.
  Read policies use the same explicit role allowlist as writes.
- Direct database writes could store fictional bindings or invalid geometry.
  Invoker triggers normalize labels, verify existing locations in the same
  warehouse/zone, reject invalid placements and area relabeling, serialize rack
  placement within an area, and prevent forged creator metadata. No foreign key
  or mutation reaches customer/inventory tables.

## Evidence and its limits

- Original baseline: 93 Node tests passed. The added unavailable-location browser
  scenario failed before the fix. A SQL privilege probe showed authenticated
  TRUNCATE before the migration change and no such privilege afterward.
- Updated local checks: 101 Node tests; 19 localization guard tests; clean
  localization scan; 11 warehouse browser scenarios; composer regression; all
  13 smoke pages; whitespace check.
- SQL: schema, all migrations, map role/constraint/preservation regressions,
  operational exercise and chat regressions passed on PGlite's PostgreSQL 17.5
  engine. This local environment could not install/run the system PostgreSQL
  service. The harness skipped only `CREATE EXTENSION pgcrypto`; core
  `gen_random_uuid()` was used. This is supplemental evidence, not a claim that
  the regular PostgreSQL CI job ran here.
- Local browsers: Playwright 1.62.1 with headless Chromium 133. GitHub Actions
  uses the workflow's stable Chrome. No real sessions, production inventory,
  paid APIs or production Supabase calls were used.
- Full operational-row snapshots include customers, vehicles, storage_sets,
  tires and locations, with a synthetic tire sentinel. Assertions compare data
  before/after the migration and after map CRUD, not only row counts.
- Browser integration uses synthetic backend responses. Separate real-adapter
  and SQL tests cover the layers it replaces; this is not a live PostgREST or
  physical iPhone/Safari certification. Concurrent conflicting edits still use
  the existing last-successful-write semantics, not multi-device version locks.

## Review recommendation and release gates

The fixes and regression coverage are ready for the next code/database review
stage once the updated candidate's GitHub Actions checks have completed green.
Keep both pull requests draft until their existing review controls allow a change.

Before release: reconcile #26 with current main without restoring demo inventory
or guessed map pins; revalidate the complete stack; obtain the required review
and Toni's explicit approval for the production migration and release. This
review neither applied the migration nor merged/deployed anything.
