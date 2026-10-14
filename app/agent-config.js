/* Provider calls are disabled under the €0 policy. Local ASC assistance uses
   the existing app data connection; it does not call a language model.
   Enable remote requests only in a separately verified/authorized deployment.
   This flag is configuration, not a server authorization or billing control. */
globalThis.ASC_AGENT_REMOTE_ALLOWED = false;
globalThis.ASC_AGENT_URL = "https://ilnqhlrvchuvpjgptjfx.supabase.co/functions/v1/asc-agent";
globalThis.ASC_AGENT_REQUIRE_AUTH = true;
