/* Free Gemini, €0 tier, through the existing asc-agent function.
   The key stays on the server. This flag only allows that one function.
   It is not a billing control and it does not select a paid model. */
globalThis.ASC_AGENT_REMOTE_ALLOWED = true;
globalThis.ASC_AGENT_URL = "https://ilnqhlrvchuvpjgptjfx.supabase.co/functions/v1/asc-agent";
globalThis.ASC_AGENT_REQUIRE_AUTH = true;
globalThis.ASC_APP_VERSION = "asc-tirehotel-v102-nero-glass";
// Optional tailnet MagicDNS name. Empty by default. The webhook URL and key
// for Send to Toni & Nero stay in Supabase secrets, not here.
globalThis.BUILDER_RELAY_URL = "";
