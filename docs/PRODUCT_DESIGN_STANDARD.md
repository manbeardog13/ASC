# ASC product design standard

Status: Implemented and locally verified on `feat/guided-asc-workflows`.
Publication blocked by GitHub integration write access (403); real device review pending.
Updated: 2026-10-15. Scope: Croatian web app, phone, tablet and desktop.

## Product and users

ASC staff receive tyre sets, connect them to a customer and vehicle, place them
in a warehouse seat, find them, and record pickup. Administrators also manage
users and setup. Readonly and unapproved roles receive no write proposals.
Database policies remain the authority for all access and mutations.

## The interaction contract

One Nero composer follows every workflow, including the dashboard. Above it,
at most three proposals name the next useful actions for the current page and
selected record. The first is visually emphasized. These controls stay visible
when the conversation is collapsed. They never depend on hover.

Links open real destinations immediately. Buttons call the page's existing
validated action. Receiving, placement and pickup retain their existing write
paths; pickup retains an explicit confirmation. Suggesting a seat does not
reserve it or claim it has been saved. Typed explicit navigation uses the same
destinations; open-ended questions continue through the existing Nero agent.

The selected set travels in the URL. Customer details and inventory decisions
are not copied to a second local workflow state store. Search results open the
real set record. The spatial trial remains labeled as local trial data.

| Job | Progression | Next useful action |
| --- | --- | --- |
| Receive | Customer/vehicle → tyres → saved set → seat | Continue, then place or print |
| Find | Name/plate/code → real record | Place an unplaced set or prepare pickup |
| Place | Selected set → suggested/scanned seat → confirmation | Open the saved record |
| Pickup | Selected set → verify → confirmation | Receipt/label, new intake or search |

## Information hierarchy

The board shows three job entry points, three linked operational counts, upcoming
pickups and recent records. Shift totals, seasonal split, zone capacity and
movements are available in an expandable section. Device-local notes retain
their content and explicitly state where they are stored. No fake customer
records, example counts, live labels, backup ages or automatic carousel appear.

Navigation keeps actual links, `aria-current`, a consistent home logo and the
existing history. The mobile dock sits at the bottom; the composer sits above
it. Opening the menu hides the composer to prevent competing overlays.

## Visual language and tokens

Use the existing ASC light/dark tokens: `--bg` for the canvas, `--panel-2` for
working surfaces, `--ink` for primary content, `--muted` for supporting content,
`--line` for boundaries, and `--lava-ink`/`--lava-tint` for priority and focus.
Nero's input keeps the violet identity on an opaque dark surface so text remains
legible in both themes. Avoid overlapping translucent cards and decorative grain.

Inter with a system sans-serif fallback is the body face. Sora with a sans-serif
fallback is used for page headings. Body/actions use 13–16 px, supporting labels
11–13 px, page headings 26–36 px. Numeric figures are tabular. Long customer
names wrap. Data remains readable independently of color.

Use a 4 px spacing unit; common gaps are 8/12/16/24/32 px. Controls have 10–12 px
radii, cards 16–18 px, composer/auth surfaces 20–22 px. Frequent controls target
44 CSS px minimum height. Focus uses a visible 2 px outline with an offset.
Inputs retain persistent labels; placeholders are examples, not labels.

## Responsive contract

| Range | Behavior |
| --- | --- |
| Narrow phone | Three compact job links; stacked record lists; name fields stack below 380 px |
| Phone landscape | Content scrolls; fixed controls remain reachable; no horizontal page overflow |
| Tablet portrait | Overlay navigation, bottom dock, two record columns when space permits |
| Tablet landscape | Stable desktop rail above 1020 px; content and composer share its offset |
| Desktop/wide | Max 1180 px board, 720 px composer, two record columns |
| Keyboard open | Composer follows visual viewport; dock hides; page fields have scroll clearance |

The full composer height reserves space after content. Name grids use
`minmax(0,1fr)` and all field containers have `min-width:0`. Browser zoom must
trigger responsive layouts; it must not clip actions or user-entered text.

## States, motion and accessibility

Loading uses dashes and a text state. Failed loads show a retry action and no
invented values. Failed refresh retains previous data with an explicit stale
notice. Partial zone/history availability is identified. Offline is explicit.
Only resolved backend calls can produce a completed inventory state.

Use semantic links for destinations, buttons for commands, headings for screen
structure, and details/summary for optional information. Status announcements
are polite and concise. A proposal never hides the conventional page action.
Nero history, attachments, speech input and owner relay remain available when
the composer expands. Explicit navigation does not send a model request.

Feedback transitions are 150–200 ms; no ambient motion on the board. Respect
reduced motion. Do not animate counters or imply a task completed early.
The target is WCAG 2.2 AA; real assistive-device coverage remains a release check.

## Signature

The already approved `powered by nerosummit.com` signature remains in a
subordinate footer. It must never become a side-by-side auth layout column or
overlap the working composer. No additional author mark is introduced.

## Verification

`tests/workflow.mjs` covers role filtering, record identity, explicit navigation,
unknown commands and duplicate command blocking. `tests/workflow.browser.cjs`
uses synthetic sessions and blocks external requests to exercise direct links,
search, placement, cancel/confirm pickup, intake validation, readonly behavior,
load failure/retry and viewport geometry. Existing agent protocol and server
policy checks must continue to pass.

Viewport fixtures: 360×800, 390×844, 844×390, 768×1024, 1024×768,
1366×1024 and 1920×1080; 683×512 tests the layout size corresponding to a
1366×1024 desktop at 200%. This does not replace real Safari keyboard/zoom,
camera, printer, live Gemini, Supabase or device assistive-technology checks.
No backend schema, inventory data or auth policy changes belong in this redesign.

Verified on 2026-10-15: 76 Node tests, 19 localization guard tests, the localization
scan, seven browser viewport fixtures, both themes, and seven synthetic workflow
journeys passed. Browser console recorded no uncaught errors. The placement and
pickup success paths were rerun after adding duplicate-submit guards. Native
keyboard activation of expandable dashboard sections was checked as well.
