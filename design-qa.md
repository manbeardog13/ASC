# ASC implementation review — 21 October 2026

Status: code and database review candidate; **not release ready**. The existing
house/upper-floor junction is unresolved. `BUILDING_TOPOLOGY.integrationReady`
is false, so the architectural reconstruction cannot replace the operational
warehouse map. No production database migration, merge, or deployment was made.

## Source and scope

This change builds on main `8d45a12b2dcc45497f770c58e92f0542e509698b`.
GitHub now records PRs 26 and 31 as merged on 19 October, before this work.
Their operator-created areas, real rack bindings, offline cache and recovery
controls are retained. The original missing browser CI was already fixed in
main; this change adds coverage for the new inventory, scene and brand work.

The recovered private spatial-test source is
`d75100dc4447d16917e2e5bd2aea65da7d60dac7`. Original supplied room images and
street/aerial photographs govern the reconstruction. Later generated dusk
images were rejected as geometry sources.

## Findings and fixes

| Area | Verified change | Remaining limitation |
|---|---|---|
| Upper rooms | Shared front/rear edges restored; office in L; common rigid placement; corridor door restored; reversible low-front cutaway | Unmeasured proportions; house connection unresolved |
| Existing building | House floor unions and one shared stair retained; gate order 3–2–1; sign above gate 1; table-room/triangular-store route | Site dimensions and junctions need confirmation |
| Inventory | Complete paginated reads; real sets projected separately from editable layout; exact warehouse/location/rack identity | Live customer inventory was not inspected; physical tier order is not surveyed |
| Shared layouts | Areas, positions and bindings paginated to an empty page, including short pages; later failures reject the result | Reads are not one transactional snapshot; UI shows last read status |
| Permissions | Additive binding table, four editor roles, deny other roles/anonymous, creator and warehouse guards | Production migration requires Toni's explicit approval |
| Data preservation | SQL compares operational records before/after migration and binding CRUD; no seeded production tires | Tests use disposable synthetic records |
| Camera | Exact set overlay, nearby opacity .15, sightline obstruction fading, interrupted flight/orbit, 120-second idle | Real iPhone/iPad GPU performance remains unverified |
| Motion safeguards | Reduced motion, typing/modal guard, pause/hidden state, disposal and resource stability | Automated Chromium/SwiftShader is not hardware certification |
| Interaction | Fixed camera reset on refresh, missing-area deletion crash, WebGL-loss coverage, warehouse-qualified QR lookup | Architecture review remains separated from operational areas |
| Composer | Neutral glass, 476px desktop cap, equal 44px corner controls, compact suggestions | Full live assistant backend behavior is outside synthetic fixtures |
| Contextual suggestions | Active-card mutations refresh shortcuts; disconnected, disabled and inert actions cannot navigate to stale records | Shortcuts follow currently rendered actions |
| Find a set | ASC typography/controls restored; complete inventory search; loading, retry and keyboard flow; query preserved on failure | Results are bounded to 30 with the full match count disclosed |
| Brand and footer | Original ASC silhouette in black gloss/red underglow, short skippable splash, default dark, footer 8px above viewport edge | Full building dusk/cinematic presentation is deferred until geometry resolves |
| Staff | Optional illustrative figures, bounded animation and visibility | No verified employee likenesses; no live presence claim |

## Validation evidence

- `node --experimental-vm-modules --test tests/*.mjs`: 196 passing tests at
  the geometry/scene freeze, zero failures.
- Localization guard: 19 guard tests and the UI scan pass.
- Actual Chromium/SwiftShader scene test: exact 4-of-8 selection, neighbor
  opacity, architectural occlusion, 120-second idle, interruption and disposal.
  Two identical seeded 60-action cycles retain equal geometry, material,
  texture and shader counts; paused/disposed scenes produce no frames.
- Synthetic app integration covers complete inventory, mapped/unmapped and
  inactive records, overflow, real record links, shared bindings, permissions,
  failed writes, stale reads, logout, readiness false/true, context loss and
  physical placement exclusions.
- All 11 existing area browser scenarios and five integrity scenarios pass.
  Existing navigation, placement, composer/history/async, dashboard assistant,
  and brand browser regressions were also run.
- Composer checked at seven widths and both themes. Actual dashboard footer
  checked at 390 and 1440 pixels, during scroll and a synthetic keyboard lift.
- Find-a-set flow checked at 390/1440 with 1,005 synthetic records, a delayed
  read, failure/retry, keyboard activation, record preservation and an attempted
  stale shortcut click after changing the search query.
- Disposable PGlite 0.5.10 with pgcrypto applied schema and all 13 migrations,
  then binding role/constraint/preservation tests. The new migration SHA-256 is
  `f66f7c88588bd4164a4bacf16ddd23678499ff4f920fed2f41f74056048cfb07`.
  Regular PostgreSQL checks are wired into `scripts/smoke.sh` and GitHub CI.

Managed browser WebGL was unavailable in this environment. The render proof
therefore uses the actual THREE geometry exported into Blender 4.5.3 Cycles;
the separate GPU regression uses synthetic Chromium/SwiftShader. Neither is
presented as a physical-device or production-data test.

## Review render

`scripts/export-warehouse.mjs --view upper-assembly --cutaway review` exports
the same source meshes used by the application. `scripts/render-warehouse.py`
renders the geometry without architectural substitution. The final source
SHA-256 is `406635e6b0fab15bc8a5c37601a5fa9921b0fe76830c23220cd8e965322dbe98`.
The 1800×1100 proof contains 645 mesh instances and zero inventory records.
It is an architectural review image, not the requested finished dusk building.

## Release blockers

1. Resolve the contradictory existing-house junction without redesigning the
   upper assembly; see `docs/reviews/asc-spatial-constraints-2026-10-21.md`.
2. Confirm physical dimensions, actual room/rack bindings and tier positions.
3. Finish and review the unified exterior, materials and dusk presentation
   against the real site after that junction is known.
4. Run the review candidate in independent CI and on representative iPhone/iPad
   hardware. Inspect first-use loading, sustained GPU temperature and recovery.
5. Obtain required explicit migration/release approval. This report grants none.
