/* Free Gemini, €0 tier, through the existing asc-agent function.
   The key stays on the server. This flag only allows that one function.
   It is not a billing control and it does not select a paid model. */
globalThis.ASC_AGENT_REMOTE_ALLOWED = true;
globalThis.ASC_AGENT_URL = "https://ilnqhlrvchuvpjgptjfx.supabase.co/functions/v1/asc-agent";
globalThis.ASC_AGENT_REQUIRE_AUTH = true;
// Empty until Toni's tailnet MagicDNS name is set. The composer hides
// "Send to Toni & Nero" while this stays blank. Never a public Supabase URL.
globalThis.BUILDER_RELAY_URL = "";
