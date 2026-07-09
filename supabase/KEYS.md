# ASC — key hand-offs (what Toni pastes, where)

I (Claude) do all the clicking and run all SQL deployments through your
logged-in browser. The ONLY thing I never touch is secrets — those you paste
yourself, once, exactly here:

## Google login (optional — email login already works)

Google requires an OAuth client that only you can mint:

1. I open https://console.cloud.google.com/apis/credentials for you →
   **Create credentials → OAuth client ID → Web application**.
2. Authorized redirect URI (paste exactly):
   `https://ilnqhlrvchuvpjgptjfx.supabase.co/auth/v1/callback`
3. Google shows **Client ID** and **Client secret**.
4. I open Supabase → Authentication → Providers → Google, flip it ON —
   **you paste the two values into the two fields**, I click Save and verify.

That's the entire flow. No tokens in chat, no tokens in the repo.

## SQL deployments

None needed from you — I run every .sql file in this folder via the dashboard
SQL Editor myself. Deployed so far:
- `schema.sql` — full schema incl. v5 intake fields (2026-07-09) ✅
- `purge-test-data.sql` — runs LAST, right before handover (wipes test data,
  keeps logins/roles) ⏳
