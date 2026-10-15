# Agent surface and warehouse checks

All fixtures are synthetic. These tests never call a model, access a live session,
read production inventory, or write to Supabase.

Pure Node checks (Node 20+; the VM flag is required for mocked dynamic imports):

```sh
node --experimental-vm-modules --test tests/*.mjs
```

Browser checks require Playwright and an installed Chromium. They serve this
checkout on loopback and intercept external requests. Set `CHROMIUM_PATH` when
Chromium is not at `/usr/bin/chromium`. Reports and synthetic screenshots go to
ignored `out/assistant-tests`, or `ASC_TEST_OUTPUT` if supplied.

```sh
node tests/warehouse.browser.cjs
```

The original purple AI window remains in `nero-design-studio/`. The operational
board now uses the same shared Nero composer as the other pages, with direct
contextual actions above it. `tests/agent-surface.mjs` checks that separation and
the free Gemini flag. `tests/season-plan.mjs`
locks the corner-number questions: a seasonal answer takes the first free bay about
six months out, and the reminder window is five to seven days before that visit.
Neither test calls Gemini.
The warehouse browser check covers the spatial preview shell. These checks do not
certify model reasoning, live latency, or a deployed function.

`node tests/workflow.browser.cjs` exercises the shared proposals through placement,
pickup confirmation/cancellation, search, and intake validation. It renders the
board and signup at seven sizes, checks overflow, and tests readonly and failed
data states. Set `CHROMIUM_PATH` to an installed Chromium executable. Evidence
goes to `out/workflow-review/`; all records and sessions are synthetic.

Required repository checks for changes under js/:

```sh
node scripts/i18n-guard.test.mjs
node scripts/i18n-guard.mjs
```
