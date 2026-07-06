---
name: asc-bulletproof-review
description: >
  Run a multi-agent adversarial review of the ASC tire-hotel PWA and fix what it
  finds — the "bulletproof" process. Use this whenever the user asks for a
  multi-agent review, an audit, "make it bulletproof", "find bugs", a deep/full
  review of the app, or a pre-release hardening pass — even if they don't name
  the skill. Six specialised finders sweep the codebase in parallel, findings are
  deduplicated, and EVERY finding faces an adversarial verifier that tries to
  refute it against the real code before anything gets fixed. Then fix all
  confirmed findings, verify in the preview, and ship with the ASC checklist.
---

# ASC Bulletproof Review

A three-phase process: **review → fix → ship**. It was built for this repo
(no-build vanilla-ESM PWA, hash router, Supabase backend, service worker,
bilingual HR/EN) and encodes what actually breaks here.

## Phase 1 — the multi-agent review

Launch the review with the **Workflow tool** using the script template in
[references/review-workflow.js](references/review-workflow.js). Read that file,
update its `CONTEXT` block (HEAD commit, what changed recently), adjust the
dimension prompts if the session's work suggests extra focus areas, then pass
the whole script inline to Workflow. It runs in the background; keep working
and process the notification when it completes.

Why this shape works (don't simplify it away):

- **Six dimensions, not one reviewer** — runtime correctness, XSS/escaping,
  i18n completeness, PWA/service-worker, accessibility, and regressions each
  need a different way of reading the code. One generalist misses what a
  specialist catches.
- **Adversarial verification is the load-bearing step.** Roughly 1 in 7 raw
  findings here is plausible-but-wrong. Each verifier is told to REFUTE the
  claim and to default to not-real when uncertain. Only fix what survives.
- **Findings must be structured** (file, line, title, detail, severity,
  fix_hint) so the fix phase can be executed mechanically.

Extract a compact digest of confirmed findings from the result file with a
small node script (file:line — title — fix_hint); the full JSON is far too
large to read whole.

## Phase 2 — fix everything confirmed

Fix confirmed findings grouped **by file**, not by severity — you touch each
file once. While fixing, hold to the project invariants in
[references/asc-invariants.md](references/asc-invariants.md) (read it before
editing; it also lists the recurring bug patterns this codebase breeds, like
module-level state surviving sign-out and views leaking camera/mic on
teardown). If a finding's fix_hint conflicts with an invariant, the invariant
wins — note the deviation in the commit message.

Refuted findings are not fixed, but list them in your summary so the user
knows they were considered.

## Phase 3 — verify and ship

1. `node --check --input-type=module < <file>` every edited JS module.
2. Preview verification per the gotchas in the invariants file (the preview
   can't sign in — verify via module imports, DOM injection, and computed
   styles; the login screen renders directly).
3. Ship with the checklist at the bottom of the invariants file (SW cache
   bump, commit, push, canonical-clone sync, Pages transient-failure retry).
4. Update the project memory if the review changed any durable doctrine.

## Output

End with a summary the shop owner can read: what was found (counts by
severity), what was fixed with the user-visible consequence of each major fix,
what was refuted, and what shipped (commit, SW version, deploy status).
