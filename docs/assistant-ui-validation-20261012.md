# Contextual ASC assistant: validation boundary

This change follows the merged warehouse navigation/map correction, based on
`daa962843dbef1480aee7a3f9b0cd7169c667cfa`.

## Behavior

- Warehouse selections and tyre details remain below the map. Editing and QR
  details expand on demand; all-warehouse navigation remains available.
- One compact conversation surface serves app pages, dashboard prompts and the
  warehouse preview. Replies expand on demand and next-action buttons identify
  their target. Page navigation and supported local preview commands need no AI.
- A request is acknowledged immediately; a model answer can take longer. Voice
  dictation requires explicit send, with optional spoken responses. Closing,
  hiding or leaving the surface cancels in-flight work and stops dictation.
- The existing authenticated `asc-agent` route replaces the public demo route in
  this client. Session credentials are sent only to the configured ASC project
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

No live model call was made: the requested €0 boundary remains in force. The
existing deployed function has server-side retry/model fallback behavior, and
its cost allowance was not verified. This source change does not claim those
server-side behaviors were removed. Real AI output quality, latency, voice on a
physical device, and deployment of this revision remain unverified. Immediate
acknowledgement is not a promise of instantaneous model completion. Synthetic
passing checks do not certify production operations.
