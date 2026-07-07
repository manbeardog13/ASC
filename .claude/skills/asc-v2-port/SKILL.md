---
name: asc-v2-port
description: "Port the approved v2 design (design/*-arched-v2.html mockups) into live ASC views without drift. Use for any 'restyle X view', 'make X match the mockup', or v2 design-parity task. Encodes the one-source-of-truth pipeline: shared component CSS, mockup-markup adoption, mechanical parity check, ship checklist."
---

# ASC v2 Design Port — the pipeline

The v2 design language was approved via `design/login-arched-v2.html` and
`design/dashboard-arched-v2.html` (split shell, dark stage, corner notches,
glow-dot segments, capsule controls, cursor glow, twin light/dark themes,
locked 4-color palette, Sora display + Inter UI, one depth cue per element).

**Never hand-translate a mockup into old CSS classes.** That path produced
drift (kept flags, missing toggle, old buttons) and burned whole sessions.
Follow this loop instead — it is mechanical:

## Per-view loop

1. **Mockup first, app-vocabulary inside.** Design/adjust the view's mockup in
   `design/` USING the same class names you intend to ship. New shared
   components (v2 shell, stage, notch, seg, schip, capsule field/btn, stage
   card, action rows) live in the auth/v2 sections appended to
   `css/styles.css` — reuse those class names; add new components there, not
   in per-view CSS.
2. **Adopt markup, bind data.** Copy the mockup's DOM structure into the
   view's render function verbatim; replace static strings with `t()` keys
   (add BOTH `en` and `hr` blocks in `js/i18n.js`) and real data. Keep every
   existing behavior hook (ids, event handlers, `asc:teardown`, view refresh).
   Real data only — never ship the mockup's sample numbers; cache real counts
   (see `asc.loginChips` pattern) or omit.
3. **Mechanical parity check.** Load mockup and live view side by side, run
   `design/parity-check.js` (`__parity("body")`) in both tabs, diff with
   `__parityDiff(mock, live)`. Fix every finding or consciously record the
   deviation. Also do the alignment pass: shared top offsets measured to 0px
   (`getBoundingClientRect` on the anchor pairs).
4. **Both themes, both widths.** Screenshot light + dark (`theme-dark` class /
   toggle), desktop + 390px. The dark theme must keep stage darker than shell.
5. **Ship checklist** (from the handoff doc): bump `CACHE` in
   `service-worker.js` AND the `APP_V` const in `js/app.js` (login version
   chip) together; commit (Bash heredoc), push, verify Pages deploy, sync
   canonical clone.

## Landmarks

- v2 component CSS: end of `css/styles.css` (sections titled "v2 auth shell",
  "v2 auth controls", "Cursor glow", "v2 exact-match pass").
- Login reference implementation: `renderLogin`/`paintLogin` in `js/app.js` —
  the template for how mockup markup + i18n + behavior hooks coexist.
- Dark theme: token remap under `.login-canvas.auth.theme-dark` — when a view
  is ported, extend the same remap scope rather than inventing new colors.
- Approved mockups: `design/login-arched-v2.html`,
  `design/dashboard-arched-v2.html` (self-contained, logo embedded).
- Views to port: checkin, warehouse, set-detail, customers, reminders, scan,
  workshop, users, assistant, recycle, export (+ dashboard first).

## Alignment gate (MANDATORY — no view ships without it)

Step 3 is not optional and not visual. Procedure, every single view:

1. Load live view; load its mockup in a hidden same-origin iframe
   (`/design/<view>-arched-v2.html`), inject `design/parity-check.js` in both.
2. Run `__parityDiffPos(mockFP, liveFP, 3)` — position-aware: x, y, w, h,
   font, color, bg, radius, SHADOW per text-keyed element. Fix until the only
   findings are consciously recorded deviations (list them in the commit msg).
3. Run `__align(pairs)` on the view's anchor pairs — canonical login pairs:
   logo↔seg tops, stage-title↔form-title tops, chips↔notch baseline. Every
   view must declare its pairs; deltas must be 0.0 within ±2px.
4. Repeat in BOTH themes (toggle `theme-dark`) — colors/shadows differ per
   theme and inheritance bugs only show in one (see the black-title-in-dark
   incident).

Component specs learned the hard way (do not re-derive):
- v2 inputs: `background: transparent`, `box-shadow: none`, 1px var(--line)
  border, pill radius — any fill or resting shadow reads as "white glow" on
  the dark theme.
- Headings inside themed scopes need `color: var(--ink)` re-anchored on the
  scope root (inheritance resolves at body otherwise).
- Stage must stay darker than shell in dark theme.

## The perfection loop (run after EVERY change batch — no exceptions)

1. Screenshot the LIVE view. Screenshot the MOCKUP at the same viewport.
2. Put them side by side mentally; scan top-left → bottom-right. List EVERY
   difference, however small (copy, wrap, gap, tone, shadow, radius, order).
3. For each difference: audit root cause (never patch symptoms), fix, note it.
4. Reload, re-screenshot, repeat. Exit ONLY when two consecutive rounds find
   zero unrecorded differences (recorded deviations = real-data substitutions
   and functionality the mockup lacks).
5. Then run the numeric gate (__parityDiffPos + __align) as final proof.
