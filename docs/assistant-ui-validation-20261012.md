# Contextual ASC assistant: validation boundary

This change follows the merged warehouse navigation/map correction, based on
`daa962843dbef1480aee7a3f9b0cd7169c667cfa`.

## Behavior

- Warehouse selections and tyre details remain below the map. Editing and QR
  details expand on demand; all-warehouse navigation remains available.
- One compact conversation surface serves app pages, dashboard prompts and the
  warehouse preview. Replies expand on demand and next-action buttons identify
  their target. Page navigation and supported local preview commands need no model.
- A request is acknowledged immediately; inventory reads can take longer. Voice
  dictation requires explicit send, with optional spoken responses. Closing,
  hiding or leaving the surface cancels in-flight work and stops dictation.
- The existing authenticated `asc-agent` route is retained behind a disabled
  configuration flag AND a separate explicit remote submit. Ordinary Send uses
  local workflows only and unsupported questions never escalate automatically. Session credentials are sent only to the configured ASC project
  and exact function path. No server function or secret is changed.
- Search tolerates bounded spelling errors in words, preserves structured
  identifiers within a single field, and offers ambiguous names for selection.
- New-set tasks prepare the existing check-in form. Saving still needs explicit
  confirmation. Date, fee and rim state are included in the form preparation.
- Warehouse tools use only its browser-local demo inventory, labelled as such.
  They do not turn demo identities into real customer lookups or saved records.

## Independent review and corrections

Separate agents reviewed the client/search, warehouse adapter and conversation
surface. Concrete findings were corrected before publication:

- Natural questions misrouted as searches; unrelated questions answered with
  selected-column counts; vacancy answers missing locations.
- Context captured after loading; stale selected-column targets; same-turn tool
  navigation wrongly invalidating the next action.
- Unavailable 3D selected through chat; hidden mobile launcher; dashboard
  navigation prompts sent to a backend without page-navigation tools.
- Structured registration digits borrowed from another field; duplicate sticker
  effects under formatting variants.
- Voice errors overwritten by stale draft text, empty/stopped voice sessions
  claiming to listen, keyboard Stop losing focus, and unbounded script loading.

Focused independent follow-up confirmed the client identifier correction and
context/navigation fixes. Surface follow-up confirmed the loading, focus and
voice settlement fixes; the final stopped-dictation edge was corrected and
covered by the isolated surface check.

## Checks and limits

43 Node cases pass: 20 client, 13 search, 10 warehouse adapter. Isolated Chromium
checks pass at 390/768/1440px for warehouse navigation and assistant interaction.
The focused surface checks cover voice events, explicit send, failed-script
retry, submit-time context, Stop focus and stopped-dictation status. Syntax and
whitespace checks pass. See `tests/README.md` for reproduction.

The October 12 baseline above is retained as historical validation. The follow-up
checks and corrected operating mode are recorded below.

No live model call was made: the requested €0 boundary remains in force. The
existing deployed function has server-side retry/model fallback behavior, and
its cost allowance was not verified. This source change does not claim those
server-side behaviors were removed. Real AI output quality, latency, voice on a
physical device, and deployment of this revision remain unverified. Immediate
acknowledgement is not a promise of instantaneous model completion. Synthetic
passing checks do not certify production operations.

## October 14: useful assistance without a model dependency

The normal conversation runs a small local intent matcher over ASC's existing
user-authorized data. It supports bounded Croatian/English search, minor word
typos, registration/set-code lookup, inventory summaries, pickup dates, selected
set/customer follow-ups, page navigation and confirmation-form entry. It labels answers
as **U aplikaciji** and states its limits; it does not impersonate general AI.
Search ambiguity offers explicit labelled choices. New-set requests open the
existing form for entry/review, and never silently save or claim it was filled.

Only the authenticated shared client and a narrow SELECT are used by the local
loader; `db.js` is deliberately not imported, because its startup can flush
queued writes. It reads up to 1000 recently updated visible sets with the user's
existing RLS access. Summaries state **among loaded sets**, not total inventory
or verified warehouse capacity. Read failures are unavailable, not empty. Dates
use the device calendar and displayed dates. Context, cancellation and session
changes suppress stale answers and actions. The preview continues to use only
its fictional browser-local inventory; unknown preview questions cannot read
real customers.

`ASC_AGENT_REMOTE_ALLOWED` is false. Both the current and retained legacy client
reject model requests by default; configured URLs or keys do not enable them.
There is no automatic provider fallback. The previous optional remote protocol
is tested only with explicit synthetic opt-in and intercepted responses. This
is a client behavior change, not a provider-account spending cap: old open tabs,
unrelated clients and server endpoints are not globally revoked. The deployed
function's retries/fallback remain unchanged. No provider call, credential,
backend deployment, quota change, or paid model download is needed for this
local path. Existing database/network charges are outside this claim.

Browser dictation remains optional and requires explicit Send. Its implementation
belongs to the browser and may use a speech service; it is not certified offline.
Unsupported open-ended questions get capabilities and next steps. Full general
language-model reasoning and production latency remain unverified; they are no
longer prerequisites for the supported local workflows.

Validation: 69 Node tests pass (including 21 local-assistant and 5 new
remote-disabled cases), isolated browser checks
at 390/768/1440px with zero provider requests, retained explicitly synthetic
remote protocol cases, focused surface tests, and repository i18n checks.
Independent review also found a pickup-query scope issue: unrecognized date or
customer qualifiers must clarify rather than returning a broader list. The
correction and its regression cases are in the local assistant tests. A failed
replacement search also clears the previous target, and requests to add users
or reminders no longer suggest tyre check-in. Independent follow-up verified
these bounded corrections. Explicit selected-customer wording takes priority
over a previous search target, while a generic pronoun can follow the last
unambiguous search.
