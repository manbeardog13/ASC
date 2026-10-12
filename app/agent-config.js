/* Existing authenticated ASC function. No provider key belongs in the browser.
   Opening chat does not invoke it; explicit user submission does. Actual model
   availability/cost is governed by the existing server account, not this file. */
window.ASC_AGENT_URL = "https://ilnqhlrvchuvpjgptjfx.supabase.co/functions/v1/asc-agent";
window.ASC_AGENT_REQUIRE_AUTH = true;
