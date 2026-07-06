// Workflow-tool script template for the ASC bulletproof review.
// Before launching: update CONTEXT (HEAD commit + recent work), tune dimension
// prompts to the session, then pass this whole script inline to the Workflow tool.
export const meta = {
  name: 'asc-bulletproof-review',
  description: 'Multi-dimension review of the ASC PWA with adversarial verification',
  phases: [
    { title: 'Review', detail: 'six dimension finders over the repo' },
    { title: 'Verify', detail: 'adversarial refuter per finding' },
  ],
}

const REPO = 'C:/Users/tonij/Claude/Projects/ASC'
const CONTEXT = `
Repo: ${REPO} (ASC tire-storage PWA; no-build vanilla ES modules, hash router,
Supabase backend, service worker, bilingual HR/EN via js/i18n.js t() keys).
<<< UPDATE: HEAD commit + a short list of recent work before launching >>>
Project invariants that count as bugs when violated:
- Every t("key") used in JS must exist in BOTH the "en" and "hr" blocks of js/i18n.js.
- All user/db-derived strings interpolated into innerHTML must go through esc().
- service-worker.js SHELL must precache every shell file the app imports statically.
- View render(main, ctx) contract; handlers wired after innerHTML replacement.
- Roles: admin/manager = admin tier; employee; readonly = blocked app-wide.
- Views with live resources (camera/mic/timers) must clean up on "asc:teardown"
  AND hashchange; module-level state must not survive sign-out.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          fix_hint: { type: 'string' },
        },
        required: ['file', 'title', 'detail', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    real: { type: 'boolean' },
    reasoning: { type: 'string' },
    severity_ok: { type: 'boolean' },
  },
  required: ['real', 'reasoning'],
}

const DIMENSIONS = [
  {
    key: 'runtime',
    prompt: `${CONTEXT}
You are a correctness reviewer. Read the recently changed JS modules plus js/app.js.
Hunt for REAL runtime bugs: null derefs, race conditions (overlays vs navigation,
module-level state leaking between renders/sessions), broken event wiring, promise
handling errors, logic that cannot work on some path (offline, permission denied,
empty data, rapid re-clicks, auth-event re-renders). Only report bugs you can trace
to concrete lines — no style nits.`,
  },
  {
    key: 'xss',
    prompt: `${CONTEXT}
You are a security reviewer focused on XSS. In js/views/*.js and js/ui.js, audit EVERY
\${...} interpolation into an innerHTML template. Flag any customer/vehicle/set/user/db
or speech-derived value that reaches innerHTML WITHOUT esc() (or unsafe attribute
construction). t() strings and icon() output are trusted. Report each unescaped sink
with file+line.`,
  },
  {
    key: 'i18n',
    prompt: `${CONTEXT}
You are an i18n auditor. Extract every t("...") key used across js/*.js and js/views/*.js
(including dynamic keys like "status."+x and noun() usages), then check js/i18n.js: does
each key exist in BOTH the en and hr blocks? Are {param} placeholders consistent between
languages and call sites? Report missing/mismatched keys only.`,
  },
  {
    key: 'pwa',
    prompt: `${CONTEXT}
You are a PWA/service-worker reviewer. Read service-worker.js, index.html, and list the
actual files under js/, js/views/, css/ (Glob). Check: (1) every statically imported
module is in SHELL (dynamic chunks should be too); (2) cross-origin boot-critical deps
(CDN ESM imports) are cached or vendored; (3) fetch-handler behavior for navigations vs
assets is sound; (4) CACHE bump discipline; (5) stale/missing precache entries. Concrete
issues only.`,
  },
  {
    key: 'a11y',
    prompt: `${CONTEXT}
You are an accessibility reviewer. Focus on recently changed UI. Check: contrast of
muted/accent text tokens on their actual backgrounds (AA 4.5:1 small text), focus-visible
coverage and its contrast, touch targets >=44px, aria on icon-only controls, dialog
semantics + focus management + live regions on overlays, keyboard reachability of hidden
file inputs, prefers-reduced-motion coverage of every animation (incl. infinite ones).
Report concrete WCAG-level problems, not aspirations.`,
  },
  {
    key: 'regress',
    prompt: `${CONTEXT}
You are a regression hunter for the recent changes. Check: (1) CSS rules referencing
classes/tokens that no longer exist or changed meaning; (2) event-listener/interval/
camera/mic leaks across view swaps and sign-out; (3) ids referenced by wiring that are
missing from the same file's templates; (4) forms still posting every field they render.
Concrete breaks with file+line only.`,
  },
]

phase('Review')
const results = await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt + `
Work from the repo directory given above (read files with Read/Grep/Glob). Return ONLY the
structured findings.`, { label: `find:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  (review, d) => {
    const found = (review?.findings || []).map((f) => ({ ...f, dim: d.key }))
    log(`${d.key}: ${found.length} findings`)
    return found
  }
)

// barrier: dedupe across dimensions before paying for verification
const all = results.filter(Boolean).flat()
const seen = new Set()
const deduped = all.filter((f) => {
  const key = (f.file + '|' + f.title).toLowerCase().replace(/[^a-z0-9|]/g, '').slice(0, 80)
  if (seen.has(key)) return false
  seen.add(key)
  return true
})
log(`${all.length} raw findings -> ${deduped.length} after dedupe`)

phase('Verify')
const verified = await parallel(deduped.map((f) => () =>
  agent(`${CONTEXT}
You are an adversarial verifier. A reviewer claims this bug in the repo above:
FILE: ${f.file}${f.line ? ' line ~' + f.line : ''}
TITLE: ${f.title}
CLAIM: ${f.detail}
Read the actual code and try to REFUTE it. It is only real if the claimed behavior actually
occurs on a reachable path in THIS codebase (check callers, guards, CSS cascade, both i18n
blocks — whatever the claim needs). Default to real=false if uncertain or if it is a style
preference rather than a defect. Also sanity-check the severity (severity_ok).`,
    { label: `verify:${f.dim}:${(f.title || '').slice(0, 30)}`, phase: 'Verify', effort: 'high', schema: VERDICT_SCHEMA })
    .then((v) => ({ ...f, verdict: v }))
))

const confirmed = verified.filter(Boolean).filter((f) => f.verdict?.real)
const refuted = verified.filter(Boolean).filter((f) => f.verdict && !f.verdict.real)
log(`confirmed: ${confirmed.length}, refuted: ${refuted.length}`)
return { confirmed, refuted: refuted.map((f) => ({ title: f.title, why: f.verdict.reasoning.slice(0, 200) })) }
