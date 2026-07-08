# Daily job — refresh the ASC Agent hooks

**Goal:** keep the dashboard agent card feeling *alive* — never a fixed daily loop.
Every day, add **20 brand-new** rotating hooks and drop the **20 oldest**, so the
pool is a rolling window of fresh invitations.

**File:** `preview/assets/agent-hooks.json` — shape `{ "_note", "updated", "hooks": string[] }`.
The dashboard fetches this at load and rotates through it (order is day-seeded, so
even the same pool shows a different sequence each day).

## What the daily run does
1. Read `preview/assets/agent-hooks.json`.
2. Write **20 new** hooks in the exact same voice as the existing ones:
   - Croatian, one sentence, ~4–10 words.
   - Warm, capable, inviting — the agent offering to *do* something for a tire-hotel
     clerk (find a set by plate/name/size, count occupancy, prep a pickup call/SMS,
     take dictation, pull a customer's history, build the morning briefing, etc.).
   - No duplicates of anything already in the pool; vary the opening verb/question so
     they don't all start alike. Keep the ASC domain (gume, setovi, regali, police,
     zone, sezone, preuzimanje, zaprimanje, kupci, registracije).
3. **Prepend** the 20 new lines, **drop the oldest 20** from the end (keep the pool at
   a steady rolling size — target ~45, hard cap 120; if under 45 after seeding, just
   prepend without dropping).
4. Set `"updated"` to today's date (YYYY-MM-DD).
5. Commit (`preview: daily agent hooks refresh (YYYY-MM-DD)`) and push. Repo is public
   — only this JSON changes. (Single source of truth is this repo; no clones to sync.)

## Scheduling
Run once per day (early morning HRT). It is opt-in because it auto-commits to a public
repo daily. `updated` lets you confirm it actually ran.
