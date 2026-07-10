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

## Telegram backup alerts (optional — the backup itself already works without it)

The daily backup + recovery drill will Telegram you if a backup fails or a backup
can't be recovered. Telegram bots **cannot message a phone number**, so we need a
bot token + your numeric chat id. Two GitHub secrets, ~2 minutes:

1. In Telegram, open **@BotFather** → send `/newbot` → give it a name (e.g.
   "ASC Backup Watch") and a username ending in `bot`. It replies with a **token**
   like `8123456789:AAH...`.
2. Open the new bot (BotFather gives you a link) and tap **Start**.
3. Message **@userinfobot** — it replies with your numeric **Id** (e.g. `123456789`).
4. Add both as repo secrets — GitHub → this repo → **Settings → Secrets and
   variables → Actions → New repository secret**:
   - `TELEGRAM_BOT_TOKEN` = the BotFather token (step 1) — this is a real secret.
   - `TELEGRAM_CHAT_ID` = your numeric Id (step 3).

You can hand me just the **chat id** and I'll set that one for you (`gh secret set`);
the **bot token** you paste yourself (I never handle secrets). Until both are set,
alerts are skipped with a log notice — everything else runs normally.

## SQL deployments

None needed from you — I run every .sql file in this folder via the dashboard
SQL Editor myself. Deployed so far:
- `schema.sql` — full schema incl. v5 intake fields (2026-07-09) ✅
- `purge-test-data.sql` — runs LAST, right before handover (wipes test data,
  keeps logins/roles) ⏳
