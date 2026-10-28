# Synthetic label print evidence

**Verified fact:** captured on 2026-10-28 from the real `app/qr.js` label renderer,
with synthetic fields and all browser requests intercepted. Base: ASC `main`
`39bc6cc6b0cfdbdc19caf10040d914d33fc9229e`. Source hashes and artifact hashes are
in `manifest.json`; these are author-side mechanical checks, not independent review.

- [Printable PDF](synthetic-label.pdf): A4 with 10 mm margins, one page.
- [Mobile render](synthetic-label-mobile.png): 390 × 844, reduced motion.
- [Raster of the PDF page](synthetic-label-pdf-page.png): rendered from the PDF
  bytes with PDF.js and decoded with the repository's vendored jsQR.
- [PDF validation](pdf-validation.json): text, page box and decoded payload.
- [Browser scenarios](scenarios.json): eight checks, using simulated print events.

**Verified fact:** the PDF raster decodes to
`https://asc.invalid/app/set-detail.html?code=ASC-2099-0000&k=N68K`.
The real ASC parser returns `ASC-2099-0000`. This reserved example host has no
customer record; no inventory, account, bridge or physical printer was accessed.
The PDF header/footer is disabled, so it contains no local path or account identity.

**Verified fact:** commands and observed results:

```text
node tests/label-render.browser.cjs
label-render: 8 scenarios passed; physical print UNVERIFIED

node tests/label-print.browser.cjs
label-print: 5 scenarios passed

node scripts/i18n-guard.test.mjs
19 passed, 0 failed

node scripts/i18n-guard.mjs
i18n-guard: clean — 15 UI files, no hardcoded text nodes.

node --experimental-vm-modules --test tests/*.mjs
tests 137; pass 136; fail 1; skipped 0
AssertionError: Locate the pure Gemini stream assembler
tests/agent-stream.behavior.mjs:14

git diff --check
(no output; exit 0)
```

**Verified fact:** the unit failure is in unchanged files. The test at
`tests/agent-stream.behavior.mjs:12` searches for `\n}\n`; the Windows checkout of
`supabase/functions/asc-agent/index.ts` contains CRLF instead. Its function start
is found at offset 19615, LF closing delimiter at -1, CRLF closing delimiter at
21251. `git diff --quiet HEAD -- tests/agent-stream.behavior.mjs
supabase/functions/asc-agent/index.ts` returned 0 before this commit. This check
was not weakened, skipped or edited to report green.

**Verified fact:** the earlier print-only failure/retry correction in
`24777de8e0ae63eb4ea3eae2539c67974dd5e7ad` was reused without its activity database
coupling or migration. This branch also handles encoder failure, exception/timeout
states and explicit confirmation of test prints. The activity/migration owner
must reconcile `app/label-print.js` when bringing that branch forward.

**Limitations:** physical print **UNVERIFIED**; real-label scan inside ASC
**UNVERIFIED**; printer model, stock dimensions, scaling, margins and adhesion
**UNKNOWN**. A4 is the digital evidence export profile, not a specification for
the shop's label stock. Native iOS/AirPrint and live bridge behavior are untested.
The screenshot uses local font fallback with remote fonts blocked. Existing
Croatian label-sheet chrome and season names remain unchanged.

**Proposal:** after independent review and separately authorized integration,
the operator prints a real label, photographs it and scans it in ASC. Record that separate
physical result and actual stock/printer settings. Never treat the PDF, simulated
confirmation or a browser screenshot as physical evidence.
