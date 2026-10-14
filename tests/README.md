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
node tests/assistant-local.browser.cjs
```

The assistant browser suite uses mocked session/data/model responses; check-in
and dashboard data modules are explicitly stubbed for form/shell-only checks.
It checks 390, 768 and 1440px layouts, local navigation, contextual tool replies,
compact disclosures, cancellation, denied access, and check-in prefilling.
The small surface suite checks speech events, keyboard focus, failed asset
loading/manual retry, and a context change during initial script loading.
These checks do not certify real microphone recognition, a physical device,
model reasoning quality, live latency, backend deployment, or provider cost.

The default assistant uses `assistant-local.js`, a bounded Croatian/English intent
matcher and authorized inventory reads. It is not a general language model.
`assistant-local.browser.cjs` runs unchanged default-off model configuration at
390/768/1440px and verifies zero model requests for search, ambiguity, unsupported
questions, cancel, and preview isolation. It also checks direct remote-client
refusal. The local-loader tests use a synthetic shared client to verify session
checks and SELECT-only access without importing the offline write queue.

The older remote protocol/browser cases explicitly replace configuration with
synthetic opt-in **inside the intercepted fixture only** and use the dedicated
remote submit. These tests do not enable the application's remote setting.
Both client entry points require that setting and an explicit remote turn.

Required repository checks for changes under js/:

```sh
node scripts/i18n-guard.test.mjs
node scripts/i18n-guard.mjs
```
