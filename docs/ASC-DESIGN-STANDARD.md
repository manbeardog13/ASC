# ASC product design standard

Status: implementation contract for the review candidate; not release approval.
Owner: Toni. Updated: 21 October 2026. Applies to phone, tablet, desktop and 3D review.

## Product truth

ASC locates, receives and releases actual customer tire sets. The existing
vanilla web/PWA and Supabase workflows remain the foundation. The architectural
model is a navigation layer, not a second inventory database.

Critical journeys: find a set by customer/registration/code; inspect its exact
record and storage location; receive/release it using the real workflow;
maintain measured or explicitly unmeasured operator areas and rack positions.
A successful visual animation never means a database operation succeeded.

Inventory quantities, owners and locations come from actual records. Complete
paginated reads reject partial failures. Editable geometry excludes customer
records. Only explicit real zone/rack bindings map inventory into a room;
missing bindings, stale reads, overflow and placement exclusions stay visible.
All writes retain server role protections. Profile failures disable editing.

States remain distinct: loading; unsaved local layout; shared save pending;
confirmed shared save; stale/offline; incomplete or failed read; synthetic
review data. No supplier/customer/stock data is fabricated to decorate a view.

## Users, navigation and layout

Employees, reception, managers and administrators can edit warehouse layouts
when the server grants their role. Read-only/customer/unknown/anonymous roles
cannot gain editing through UI controls. Permissions refresh while the view is
active and before writes; canceled dialogs cannot finish a pending write.

Keep ASC's existing destinations and return paths. Spatial view and find-a-set
are complementary views of the same records. Do not add a duplicate warehouse
navigation tree. Theme selection belongs in the sidebar's lower controls.
Search preserves the query across retry and offers real record links.

Phone controls remain reachable with keyboards and safe areas. Tablet rail
geometry must not shift during touch/scroll. Desktop supports keyboard work
without making required actions hover-only. Aim for 44×44 CSS-pixel targets,
visible focus and usable 200% zoom. Long Croatian text wraps rather than clips.

## Brand, typography and surfaces

Use the supplied ASC silhouette. Its approved treatment is glossy black with
restrained red underglow; never replace it with typed letters or a new symbol.
Daylight is the default. Explicit light and dark choices are preserved. The working surface uses warm stone, pearl, petrol, and restrained burgundy.
Existing ASC operational tokens in app.css remain authoritative. Inter/system
sans-serif is used for forms and the composer; no accidental browser serif
fallbacks. Preserve the existing brand accent outside the specific dark-red
composer send action.

The composer uses neutral translucent glass, not a purple opaque bar:

| Role | Light | Dark |
|---|---|---|
| Glass | rgba(248,249,251,.54) | rgba(30,32,37,.46) |
| Text | #23262d | #f1f3f5 |
| Secondary text | #626974 | #afb5bf |
| Send action | #9e2930 with white arrow | Same |
| Focus | #ac3037 | #e9a3a7 |

The desktop composer cap is 476px, 30% below the former 680px. Plus, microphone
and send controls are equal 44px circles, with equal 16px corner insets.
Symmetric shallow concave upper corners use one outline for clipping and rim;
the cutouts are genuinely transparent. Body text remains 16px/1.5. Suggestions
use one short row, with 28px visual capsules inside 44px hit targets. No tires
inside the composer. Context shortcuts must belong to the current rendered
section and cannot retain disconnected or disabled actions.

Surfaces must support default, focus, pressed, loading, disabled, error and
confirmed states. Do not use color alone for warnings or permissions. Forms
retain labels/units, and dialogs return focus and preserve drafts appropriately.
Fixed elements leave enough scroll clearance for the last actionable row.

## Motion and 3D contract

Camera transitions are interruptible. A search focuses only the requested set,
including four tires within a mixed eight-tire stack. Selected tires receive a
transparent green overlay; surrounding tires use .15 opacity. Occluding
architecture fades temporarily and restores on clear/manual navigation.

Idle pan starts after 120 seconds, respects typing/dialogs, stops on input, and
uses the visible assembly's bounds. Initial/reset framing fits all eight box
corners at the actual aspect ratio. Portrait upper-room views prefer a front
view; manual camera poses survive data refresh. Dusk exterior lighting and
neutral inspection lighting use local cached reflections with bounded GPU
resources. Hidden façades do not request continuous glow frames.

Reduced motion removes idle flights, decorative people and the large entry
movement while preserving immediate selection. The short entry is skippable,
keyboard-safe and never reveals content behind the authentication gate. The
last second of its approach decelerates. Optional figures are illustrations,
not employee likenesses or attendance records.

The upper assembly is protected by a geometry fingerprint from 190d1ed. Its
left attic, office, lower rear racks, middle deck and wider west passage must
not change to solve another building junction. Common walls are one physical
boundary, visible from either adjoining room. No duplicate house stair.

## Review isolation and localization

The standalone review exposes six inventory spaces plus office/table room.
Upper assembly and existing house are separate views while their junction is
unconfirmed. Sample tires are explicitly synthetic, opt-in and never persisted.
No business backend is requested. WebGL loss disables stale controls and offers
an explicit retry. Image export is a review artifact, not an inventory receipt.

Visible application/tutorial/review copy is Croatian. Conversation and technical
documentation may be English. Use truthful short errors with recovery actions.
Do not describe grid units as measured metres or schematic clearance as surveyed.

## Signature

Exact approved string: Powered by Nero Summit. Fixed 8px above the viewport's
bottom safe edge, subordinate and legible, without intercepting input or covering
controls. This is an ASC-specific requirement, not a global product default.

## Verification and exceptions

Automated fixture sizes include 390, 768 and 1440px, seven composer widths,
both themes, synthetic keyboard lift and 200% CSS zoom. Actual review/WebGL
flows cover all rooms, exact set focus, lighting, cutaway/plan, reset, PNG,
context loss/retry, lifecycle handlers and randomized interaction replay.
Node tests protect geometry, record mapping, bounds, roles and resource state.
SQL role/record preservation uses a disposable database only.

Unresolved release evidence: physical existing-house junction and floor levels;
measured clearances/rack tiers; real iPhone/iPad performance and backdrop-filter;
independent CI startup recovery; Toni's production migration/release approval.
Simulated page lifecycle events are not a physical-device bfcache certification.
