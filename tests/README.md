# Assistant and warehouse checks

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
node tests/assistant.browser.cjs
node tests/assistant-surface.browser.cjs
```

The assistant browser suite uses mocked session/data/model responses; check-in
and dashboard data modules are explicitly stubbed for form/shell-only checks.
It checks 390, 768 and 1440px layouts, local navigation, contextual tool replies,
compact disclosures, cancellation, denied access, and check-in prefilling.
The small surface suite checks speech events, keyboard focus, failed asset
loading/manual retry, and a context change during initial script loading.
These checks do not certify real microphone recognition, a physical device,
model reasoning quality, live latency, backend deployment, or provider cost.
