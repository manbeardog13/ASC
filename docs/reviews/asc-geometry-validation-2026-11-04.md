# ASC geometry correction review - validation receipt

Date: 4 November 2026 (Europe/Zagreb).

Baseline: PR #49, `81ee98c6c59ef0891005b7a31bf941cbf9f00e5e`, branch
`feat/asc-spatial-operations-nov03`. Separate review branch:
`review/asc-geometry-fidelity-2026-11-04`.

## Result and scope

The six-room Studio catalogue reuses the existing architectural model. It does
not establish an integrated upper-floor fit. The review preserves the two
attics, L-shaped room, office, central raised deck, rear racks on the lower
floor, west passage, shelving, short steps, goods lift, original house floors
and single house stair. No model coordinate or geometry fingerprint changed.
`BUILDING_TOPOLOGY.integrationReady` remains false.

Implemented safe corrections:

- Catalogue width/depth now come from the same geometry manifest as rendering.
  Room IDs, order, zones and names remain unchanged.
- Studio's geometry label no longer describes unmeasured architecture as a
  measured plan merely because its bound operational layout uses metres.
  Operational layout units are described separately, without survey claims.
- The checked-in `assets/studio.js` was rebuilt from these source changes.
- A read-only diagnostic computes solid-floor polygons, contacts, plan overlap
  and floor elevations. Five geometry tests preserve the unresolved state and
  distinguish floor-plan overlap from coincident floor slabs.

No changes to inventory records, operational layouts or bindings, staff
permissions, tenant navigation, Osobe, release reconciliation, database schema
or production database. No merge or deployment is authorized by this review.
No coordinated release branch is updated by this work.

## Verification performed

| Command | Observed result |
| --- | --- |
| `cd app/spatial-studio && npm ci --no-audit --no-fund` | Installed locked dependencies successfully |
| `cd app/spatial-studio && npm test` | 19 passed; no failures |
| `cd app/spatial-studio && npm run build` | TypeScript and Vite passed; existing large 3D chunk warning remains |
| `node --experimental-vm-modules --test tests/warehouse-building.mjs tests/warehouse-drift.mjs tests/warehouse-presentation.mjs` | 27 passed, including immutable corrected upper geometry fingerprint |
| `node --experimental-vm-modules --test tests/asc-geometry-junction.mjs` | 5 passed |
| `node scripts/i18n-guard.mjs` | Clean |
| `git diff --check` | Clean |
| `node scripts/audit-asc-geometry.mjs` | Generated `asc-geometry-diagnostics-2026-11-04.json` from the unchanged model |
| `NODE_PATH="$CODEX_PRIMARY_RUNTIME_NODE_MODULES" CHROMIUM_PATH=/usr/bin/chromium node tests/spatial-studio.browser.cjs` | **Not executed to assertions:** Chromium launch failed with `socket() failed: Operation not permitted (1)` in this environment |

Total distinct unit/regression checks above: **51 passed**. An independent
agent also reran the five new geometry checks and the unchanged upper-geometry
fingerprint (6/6), reviewed the code scope, and verified the conditional
roof/slab intersection against transformed mesh vertices. These repeat checks
are not added to the 51 total.

The browser suite needs rerunning in a compatible environment before release.
No browser pass, production validation, on-site survey, load certification or
physical access approval is claimed. No SQL migration was applied.

The standalone HTML proposal was exported to a seven-page vector PDF. All
seven final pages were rendered and visually inspected for clipping, diagram
labels, table layout and page numbering. No external media or scripts are
required by the proposal.

## Evidence and review files

- [Visual correction proposal](asc-geometry-proposal-2026-11-04.html)
- [Detailed source-linked audit](asc-geometry-audit-notes-2026-11-04.md)
- [Machine-readable diagnostics](asc-geometry-diagnostics-2026-11-04.json)
- [Owner constraints](asc-spatial-constraints-2026-10-21.md)

Original photographs and the private Sites source cited by the constraints
were not independently recovered in this review. Owner-recorded relationships
come from the pinned authoritative constraints; numeric findings come from
the pinned code. Generated dusk imagery was not used as geometry evidence.

## Release handoff

Review this branch as a delta from the pinned PR #49 head. Do not merge it into
the active release branch as part of reconciliation. After the owner chooses
to integrate, reconcile or cherry-pick this small delta onto the then-current
release baseline and rerun affected checks. Real junction corrections remain
blocked on the proposal's survey/owner decisions; passing software tests does
not resolve the physical junction.
