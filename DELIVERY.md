# ASC — delivery runbook (customer handover)

**The product:** https://manbeardog13.github.io/ASC/ → opens the real app
(splash → login → dashboard). The mock demo is gone. Database: live Supabase
(`asc-tire-hotel`), schema v5 deployed 2026-07-09.

## Already done (Claude)
- [x] Schema v5 in production (VIN, address, bolts, hubcaps)
- [x] All 12 pages wired to real data, Croatian empty states at zero
- [x] Root cutover + preview/ deleted + service worker v82
- [x] App icon (notched lava ring): Chrome tab + add-to-home-screen + PWA manifest
- [x] Prag launch splash on entry + login↔dashboard transitions
- [ ] Live smoke test through your browser (in progress)
- [ ] Run `supabase/purge-test-data.sql` — LAST, wipes test data (Claude runs it)

## Handover morning — Toni
1. **Accounts for the shop:** Supabase → Authentication, or in-app Korisnici
   page: invite each employee email (they get roles; owner stays protected).
   Alternative: add their emails to `allowed_emails` and let them self-signup.
2. **On their phones** (the moment they hand them over):
   - Open https://manbeardog13.github.io/ASC/ in Safari/Chrome
   - Sign in once (session persists)
   - Share → **Add to Home Screen** → the notched-ring ASC icon appears;
     opens full-screen, splash → dashboard, like a native app
3. **Optional — Google login:** takes 5 min, see `supabase/KEYS.md`
   (I click everything; you paste the two Google values).

## If something breaks day-1
- Every page fails soft: a failed fetch keeps the page calm, never blank.
- Roll back = `git revert` the cutover commit (2218253) — preview build
  and old root come back exactly as they were.
- Nightly encrypted DB backups continue via GitHub Actions.

## v1.1 (committed, next week)
Local voice agent for check-in: Web Speech (hr-HR) + Croatian slot-grammar
fuzzy-matched against the live customer DB — instant offline dictation-to-form,
Gemini as fallback. Spec follows tonight.
