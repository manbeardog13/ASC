# Agent surface and warehouse checks

All fixtures are synthetic. These tests never call a model, access a live session,
read production inventory, or write to Supabase.

Pure Node checks (Node 22.13+; the VM flag is required for mocked dynamic imports):

```sh
node --experimental-vm-modules --test tests/*.mjs
```

Label evidence (no HTTP server or live print bridge):

```sh
node tests/label-print.browser.cjs
node tests/label-render.browser.cjs
```

`label-render.browser.cjs` intercepts every request, loads the real label renderer
and the vendored QR encoder/decoder, and exports a synthetic A4 PDF and screenshots
to `out/assistant-tests/label-render/` (or `ASC_TEST_OUTPUT`). Its print calls and
bridge responses are simulated. It checks missing QR generation, print exceptions,
missing `afterprint`, retries, EN/HR confirmation, and test-print isolation.
The PDF is digital evidence only: physical print and scanning a real label in ASC
remain **UNVERIFIED**. The fixture uses `asc.invalid`, never a customer record.

Browser checks require Playwright and an installed Chromium. They serve this
checkout on loopback and intercept external requests. Set `CHROMIUM_PATH` when
Chromium is not at `/usr/bin/chromium`. Reports and synthetic screenshots go to
ignored `out/assistant-tests`, or `ASC_TEST_OUTPUT` if supplied.

```sh
node tests/warehouse.browser.cjs
node tests/composer.browser.cjs
node tests/warehouse-areas.browser.cjs
```

`tests/warehouse-areas.mjs` and `tests/warehouse-areas.browser.cjs` cover the
operator-built map: empty start, area creation from operator-entered size only,
binding a stack to a real rack, `?zone=&rack=` navigation, and that area changes
never touch tyres, stacks or database rows.

The smoke workflow also runs `tests/warehouse-areas.browser.cjs` and retains
synthetic browser evidence for seven days. Its eleven scenarios cover the
original seven cases plus unavailable location data, failed shared writes and
capacity synchronization, readonly cached inspectors, and interrupted-upload
recovery. Cross-device browser tests use an in-memory backend, not PostgreSQL.
`tests/warehouse-db.mjs` separately exercises the real `js/db.js` adapter with
only the Supabase transport mocked, including warehouse scoping and zero-row
update/delete failures.

The disposable PostgreSQL smoke job snapshots complete operational records
immediately before the warehouse migration and checks their equality after the
migration and after map CRUD. The warehouse SQL suite exercises every permitted
role, readonly/unknown/missing profiles, least-privilege grants, real-location
binding, geometric constraints and delete-restrict behavior. No production
migration is authorized by these tests.

The purple AI window is the original ASC card, copied as-is in `nero-design-studio/`.
`tests/agent-surface.mjs` locks that card and the free Gemini flag. `tests/season-plan.mjs`
locks the corner-number questions: a seasonal answer takes the first free bay about
six months out, and the reminder window is five to seven days before that visit.
Neither test calls Gemini.
The warehouse browser check covers the spatial preview shell. These checks do not
certify model reasoning, live latency, or a deployed function.

The composer check covers reachable controls at 320–1440px, light/dark themes,
long drafts, history above the sheet, synthetic keyboard resizing, stopped and
superseded replies, concierge failure, IME input, and conversation restoration.
It does not replace a real iOS/Android keyboard and gesture pass.
`tests/sql/nero-chats.sql` runs in smoke's disposable database and checks owner
isolation, private attachments, and the absence of anonymous/table-wide grants.

Required repository checks for changes under js/:

```sh
node scripts/i18n-guard.test.mjs
node scripts/i18n-guard.mjs
```

`tests/agent-stream.behavior.mjs` isolates the pure Gemini assembler with Node's TypeScript stripping API. It verifies that distinct same-name calls preserve
arguments, IDs, signatures and text ordering without initializing an edge runtime.
