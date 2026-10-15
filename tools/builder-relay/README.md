# Builder relay (NERO-SERVER)

`Send to Toni & Nero` posts from the ASC app to a MagicDNS name on Toni's tailnet. This process is the only listener. It stays on `127.0.0.1`. Tailscale Serve publishes it to the tailnet. Supabase cannot reach the tailnet, so this is not an edge function and there is no public fallback.

Logs are JSON lines on this machine (`BUILDER_RELAY_LOG`, or stdout). They are not written to a `builder_relay_log` table: a table in the public project would be another public path, and the database cannot see the tailnet anyway.

Nothing here is deployed by the app. Do not commit secrets.

## One-time setup on NERO-SERVER

1. Install Deno.
2. Copy this directory to the server, outside any place that syncs secrets into git.
3. Put the webhook URL in an env var or a mode-600 file that is not in the repo:

   ```sh
   export SUPABASE_URL=https://ilnqhlrvchuvpjgptjfx.supabase.co
   export SUPABASE_ANON_KEY=...   # the publishable anon key, from the OS keychain or a local env file
   export BUILDER_WEBHOOK_URL=... # or BUILDER_WEBHOOK_FILE=/home/toni/.config/asc-builder-webhook
   export BUILDER_RELAY_LOG=/var/log/asc-builder-relay.log
   ```

4. Start the relay on loopback:

   ```sh
   deno run --allow-net --allow-env --allow-read --allow-write server.ts
   ```

   `--allow-write` is only for the optional log file. The process refuses any bind address other than `127.0.0.1` (port 8787 unless `BUILDER_RELAY_PORT` is set).

5. Publish it to the tailnet only:

   ```sh
   sudo tailscale serve --bg 443 http://127.0.0.1:8787
   ```

6. Copy the MagicDNS name (`https://nero-server.<tailnet>.ts.net`) into `BUILDER_RELAY_URL` in `js/config.js` and `app/agent-config.js`. Leave it empty until then. The composer hides the mode while the value is empty.

Do not run `tailscale funnel`. Funnel would put the relay on the public internet. Serve is tailnet-only.

## What the relay checks

- Bearer token is the user's Supabase access token.
- Signature against the project JWKS when the key algorithm is ES256 or RS256, then `GET /auth/v1/user` so the auth server accepts the session.
- `profiles.role` is `admin` or `manager` (`asc_is_admin` is the same pair).
- At most 30 posts per user per 5 minutes.
- The JSON body has an id and text. Token-like fields are rejected. The webhook receives the message, attachment refs, and the verified user id. It does not receive the bearer token.
