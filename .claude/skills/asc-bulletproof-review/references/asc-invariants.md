# ASC invariants, recurring bug patterns, and the ship checklist

Read this before fixing anything. These are the rules the codebase actually
lives by — violating one while "fixing" a finding creates the next finding.

## Locked design decisions (do not relitigate)

- **Palette is LOCKED to 4 colors**: Cloud Ash `#EDF0F5` canvas, Black Core
  `#020305` ink/dark cards, Lava Rush `#FF4E1B` accent, Gunmetal `#2E2F31`.
  Plus muted functional hints only: `--ok` green, `--danger` red; warn reuses
  Lava. The `-ink` variants (`--brand-ink`, `--ok-ink`, `--danger-ink`,
  `--info-ink`) are the AA text-safe shades — TEXT on tints uses those, bright
  colors are for fills/icons.
- **Elevation doctrine**: ONE depth cue per element. Resting white cards =
  hairline + `--shadow-1`; nested elements (tiles, u-stat, u-row, hstat) =
  border/tint only, no shadow; floating layers = `--shadow-pop`. `--hi` is
  retired (resolves to nothing) — never re-add inset highlights. Secondary
  `.btn` is flat; the Lava glow belongs to `.btn-primary` and the scan orb only.
- **No photos/automotive clichés**; login backdrop is composed from the palette.
- Fonts: Inter + Sora. No build step, no framework — vanilla ES modules.

## Hard invariants (violations are bugs)

- Every `t("key")` used in JS exists in **both** the `en` and `hr` blocks of
  `js/i18n.js`, with matching `{param}` placeholders.
- Every user/db/speech-derived string interpolated into `innerHTML` goes
  through `esc()`. Trusted: `t()` output, `icon()` output.
- `service-worker.js` SHELL precaches **every** statically imported shell file
  (check new modules AND their static imports) plus dynamic chunks. Bump
  `const CACHE = "asc-tirehotel-vNN"` on EVERY shell-file change.
- Views export `render(main, ctx)`; wire handlers after `innerHTML`
  replacement; preserve existing element ids — other code and tests target them.
- Roles: `admin|manager` = admin tier, `employee` = staff, `readonly` =
  blocked app-wide (access gate). Client checks are UX; RLS is the boundary.

## Recurring bug patterns in this codebase (check fixes against these)

- **Module-level view state survives sign-out.** Any `let cache = []` at
  module scope must be reset at the top of `render()` and cleared on failed
  loads, or the next signed-in account can read the previous user's data.
- **Live resources leak across view swaps.** The router dispatches
  `window.dispatchEvent(new Event("asc:teardown"))` at the start of every
  `route()` — anything holding a camera, microphone, recognizer, overlay, or
  timer must listen for `asc:teardown` AND `hashchange` and shut down
  (self-removing listeners).
- **Auth events are not navigation.** `db.onAuthChange` fires TOKEN_REFRESHED
  hourly and SIGNED_IN on tab refocus; app.js only reboots when the signed-in
  user id actually changes. Never add code that re-renders on every auth event.
- **`e.currentTarget` after `await` is null.** Capture the element into a
  const before any await in an event handler.
- **Stale async work vs the current view.** `route()` uses a navigation
  sequence token; view-level async callbacks (debounces, load catches) must
  bail if their elements are gone (`if (!main.querySelector("#x")) return`).
- **SpeechRecognition:** `stop()` FINALIZES captured audio, `abort()` discards
  it. "Skip/cancel" semantics need `abort()`. One recognizer per page — guard
  re-entrancy on anything that starts a session.
- **File inputs:** reset `e.target.value = ""` in onchange (same-file re-pick
  fires nothing otherwise) and trigger them from real `<button>`s, never
  hidden-input + label (keyboard users can't reach labels).

## Preview verification gotchas

- Start the preview with `preview_start` name `asc-static` (.claude/launch.json).
- The preview is a **different origin** → not authenticated → main-app screens
  can't be reached by login. Verify via: dynamic `import()` of modules in
  `preview_eval` (unit-test exports/normalizers), DOM injection of
  representative markup + screenshots, and computed-style evals. The **login
  screen renders directly** — but the preview tab may hold a persisted
  Supabase session in localStorage; `localStorage.clear()` + reload first.
- Magnetic hover is pointer-gated — off in headless; don't chase it.
- Screenshots flake when the tab goes `visibilityState:"hidden"` — restart the
  preview server, or fall back to computed-style assertions.
- Syntax-check every edited module: `node --check --input-type=module < file`.

## Ship checklist (in order)

1. Bump `const CACHE` in `service-worker.js`; add any new files to SHELL.
2. Commit with a message that explains user-visible consequences; push `main`.
3. Fast-forward the canonical clone: `cd C:/Users/tonij/Documents/GitHub/ASC
   && git pull --ff-only`.
4. Check the Pages deploy (`gh run list --limit 1`); transient "Deployment
   failed, try again later" → `gh run rerun <id> --failed` (sometimes twice,
   with a delay).
5. Confirm live: `curl -s https://manbeardog13.github.io/ASC/service-worker.js
   | grep CACHE` shows the new version.
6. Update project memory if doctrine changed (elevation rules, invariants,
   new gotchas).
