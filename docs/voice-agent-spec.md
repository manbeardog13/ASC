# ASC Sluh — local voice agent for check-in (v1.1 spec)

**Goal:** hold the mic → speak one Croatian sentence → the check-in form is
filled before your thumb leaves the button. Offline-capable, zero per-use cost,
private. Gemini stays as the fallback brain, not the front door.

## Architecture (three layers, graceful degradation)

```
voice ──► EARS: Web Speech API (hr-HR, continuous:false, interimResults:true)
              │  transcript
              ▼
        BRAIN-1: slot grammar (deterministic, ~0ms, offline)
              │  confidence ≥ threshold?          │ no / messy utterance
              ▼ yes                               ▼
        prefill form (sessionStorage             BRAIN-2: existing Gemini
        'asc.prefill' — the SAME bridge          asc-agent edge function
        Gemini and Uredi already use)            (network, ~2-4s)
```

## Brain-1: the slot grammar (`app/sluh.js`, ~300 lines, no deps)

Slots and their extractors, run over the normalized transcript
(lowercased, diacritics kept, number-words mapped):

| Slot | Extractor | Example match |
|---|---|---|
| quantity | `\b([1-8]|jedna?|dvije|tri|četiri|pet|šest|sedam|osam)\b` near "gume/kotača/komada" | "četiri zimske gume" → 4 |
| season | gazetteer: zimsk-/ljetn-/cjelogodišnj-/allseason | "zimske" → winter |
| tire_size | `\b(\d{3})[\s/]?(\d{2})\s?r?\s?(\d{2})\b` | "205 55 16" → 205/55 R16 |
| brand | gazetteer (~40: michelin, continental, pirelli, sava, kleber…) + Levenshtein ≤2 | "mišelin" → Michelin |
| plate | `\b([a-zžščćđ]{2})[\s-]?(\d{3,4})[\s-]?([a-zžščćđ]{1,2})\b` + HR city-code list boost | "du devetsto devedeset devet zz" |
| location | "zona X … regal N … polica N … mjesto N" (any subset, any order) | zona A regal 3 |
| on_rims | "na felgama/naplacima" ↔ "bez felgi" | boolean |
| bolts | "vijci kod nas/uskladišteni" ↔ "u gepeku/prtljažniku" | stored/in_trunk |
| hubcaps | "poklopci/ratkape" + kod nas/uskladišteni | boolean |
| name | residual tokens after all other slots are consumed, 2-3 capitalized-able words |
| phone | `(\+?385|0)\s?9\d[\s\d]{6,}` | |

**The grounding step (what beats Gemini):** the name candidate is fuzzy-matched
(normalized Levenshtein + token overlap) against `listCustomers()` cached at
page load. Hit ≥0.85 → link the EXISTING customer (prefill phone/vehicle too,
enable edit-aware flow). Miss → new-customer name as heard.

**Confidence gate:** filled-slot count weighted by importance (name+quantity+
season = core). Score ≥0.6 → instant prefill + toast "Provjeri i spremi".
Score <0.6 AND online → hand the raw transcript to Gemini. Score <0.6 AND
offline → prefill what we have + focus the first empty core field.

## Ears details
- `webkitSpeechRecognition`/`SpeechRecognition`, `lang:'hr-HR'`.
- Hold-to-talk reuses the existing mic button + press mechanics in checkin.
- Interim results stream into the existing "text above the tire" live bubble.
- No SpeechRecognition support (rare: old WebViews) → mic hides, text input stays.
- Privacy note: Chrome routes audio via Google's recognizer; iOS Safari is
  on-device where available. Truly-local ASR (Whisper-WASM) rejected for v1.1:
  40-250MB download + phone heat + Safari WebGPU flakiness.

## Non-goals (v1.1)
- Free-form dialogue (Gemini's job), multi-turn correction, TTS responses.
- Any new backend: Brain-1 is a static JS file; Brain-2 is the existing edge fn.

## Test corpus (acceptance)
20 recorded shop-realistic utterances (fast speech, dialect, background noise),
target: ≥17 fully-correct forms via Brain-1 alone, 0 wrong-customer links
(a wrong link is worse than no link — threshold errs toward "new customer").

Build estimate: grammar + grounding 1 day, mic/UX integration ½ day,
corpus tuning ½ day. Ships behind a Postavke toggle, default ON.
