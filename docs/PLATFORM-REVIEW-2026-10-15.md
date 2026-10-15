# ASC platform review — 2026-10-15

Status: draft repairs, awaiting release approval. This review did not merge, deploy, apply live SQL or send anything to customers.

## Scope and method

Six independent reviewers covered client security/offline state, business workflows, mobile UI/navigation, database/access controls, warehouse integrity, and Nero/voice/streaming. Review began at `3ae38c5` and incorporates main's subsequent #21/#22 changes (`828629a`). The root reviewer integrates fixes; reviewers rerun on actual combined source. Reproductions use synthetic records and blocked external network requests. Live ASC metadata checks were read-only.

The loop was reproduce → patch → targeted regression → independent cross-review → repair newly exposed race → full suite. Examples caught on second review include logout before SIGNED_OUT, fresh reset forms with empty hidden fields, a new scan still waiting for its record, and resizing between desktop/mobile during onboarding.

## Findings repaired in this browser change

| Area | Confirmed failure | Result |
| --- | --- | --- |
| Sessions | Dashboard skipped auth gate/logout; stale session and first-paint results could reveal old account | Auth gate, synchronous logout invalidation, account-switch and late-result guards |
| Offline edits | Jobs could replay for another account or discard newer jobs | Owner-bound replay, per-entry removal, explicit storage failures; legacy unowned jobs remain parked |
| Intake | Changing customer retained old fields; changing a selected plate renamed a historical vehicle | Clear missing identity fields, detach selected vehicle on changed plate, preserve intentional edit corrections |
| Set data | Placement bypassed registered slots; zero tread values were dropped; updates could silently affect zero rows | Atomic placement RPCs, meaningful tire-row retention, affected-row verification |
| Failed intake | Cleanup could lose concurrent jobs or continue under another account | Stable job identity, account checks before destructive work, retained failure queue |
| Placement | Lookup failures, duplicate submits and late/out-of-order scans targeted stale choices | Captured selection plus request/revision guards; unknown QR keeps scanner available |
| Recycle | Restoring into an occupied/blocked former slot stranded the record | Explicit confirmed restore without a location, guarded atomic update, then direct placement |
| Login | Signup overflow, erased confirmation messages, reset/recovery blocked by hidden required fields | Bounded responsive fields and correct mode validation/messages |
| Menu/introduction | Focus escaped mobile overlays; resizing intro restored stale inert state; slot route lost return context | Focus containment/restoration, breakpoint reconciliation and safe return route |
| Composer | Voice replaced draft; late audio/uploads entered another conversation; pending history sent to old chat | Generation guards, preserved draft, upload limit/order, history send isolation and recovery |
| Saved attachments | History discarded file references | Owner-scoped signed links plus validated model recall |
| Assistant routing | Commands were answered as FAQ; dashboard concierge errors stranded busy state | Action requests reach tools; dashboard falls through to assistant on concierge failure |
| Workshop voice | Button claimed to listen without speech recognition | Real recognition state and typed-search fallback |
| Builder queue | Failed/unconfigured delivery discarded messages | Only confirmed successful delivery removes a queued message |
| Warehouse | Demo geometry looked exact; find result opened schematic instead of saved row; logout/fullscreen escape races | Approximate label, real record handoff, reachable escape and disposal guards |
| PWA | Activation removed unrelated origin caches | Retires only old ASC-prefixed caches |

Database/backup and edge stream fixes are separate draft PRs. The database fix is needed to repair stale occupied slots after recycle/purge and enforce safe restore behavior. The edge fix preserves distinct same-name parallel tool calls and their signatures; it requires a separately approved function deployment.

## Verification

- All repository Node tests run via `node --experimental-vm-modules --test tests/*.mjs`, including account isolation, offline queues, data workflows, intake identity, recycle recovery, agent context and delivery failures.
- Both i18n guard self-test and UI scan run in smoke.
- Existing shared-composer browser regression plus platform, placement, warehouse integrity, composer history/async and dashboard-agent tests run in CI with synthetic network/session/model data.
- Platform tests cover 320, 390, 768, 1020, 1021 and 1440 pixel layouts, focus handoffs, fresh reset/recovery and portrait/landscape introduction. Placement has 10 adversarial ordering cases; warehouse has five targeted integrity cases.
- Existing page-load smoke covers the current app pages. Test coverage is bounded; it is not a claim that every possible workflow or device interaction is proven.
- Database PR runs disposable PostgreSQL lifecycle/concurrency/privilege tests and the actual encrypted recovery pipeline with exact QR/movement comparisons.

## Remaining delivery and verification gaps

- Physical iOS Safari/Android installed-PWA keyboard, gestures and orientation behavior still need real-device verification. Headless viewport tests are not physical-phone tests.
- No paid model or live customer/model prompt was used. Live signed-in free-tier responses remain a release smoke check.
- Full real-control spotlight tutorial/replay and exact QR-backed 3D inventory are planned features. This change repairs current navigation and labels schematic geometry honestly; it does not fabricate measured geometry or live stacks.
- Offers/internal-access draft #15 and ground-floor draft #19 are not silently ported or marked complete. Separate people/cars in #19 remain suitable for later animation.
- Owner transfer stays deferred. Legacy unowned offline/cleanup jobs are retained rather than assigned to a new account. No customer message, offer, printout or live change was authorized by this audit.
