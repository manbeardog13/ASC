// Creates the shared Supabase client from the values in config.js.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { config, isConfigured } from "./config.js";

export { isConfigured };

// When not configured yet, export null so the UI can show a friendly setup screen
// instead of crashing.
//
// flowType "implicit": OAuth (and invite/recovery) returns land back with tokens in
// the URL hash (#access_token=…&type=…) that the client reads on load. The default
// "pkce" flow instead returns a ?code that must be exchanged using a stored verifier,
// which is fragile on a static, hash-routed GitHub Pages app (Google finished but the
// session never got established). Implicit is the reliable choice here — and it makes
// invite/reset links carry `type=recovery` in the hash, which the set-password screen
// already detects.
// `lock` (pass-through): bypass supabase-js's default Web Locks API coordination.
// That default (navigatorLock) could DEADLOCK on reload — a lock left stuck by a
// prior tab/context made getSession() hang forever, so boot() never finished and
// the app showed a blank white screen until storage was manually cleared. This is
// a single-user shop tool that doesn't need cross-tab lock coordination, so we run
// the callback directly: no lock, no deadlock, reloads are instant and reliable.
const passThroughLock = (_name, _acquireTimeout, fn) => fn();

export const supabase = isConfigured()
  ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        lock: passThroughLock,
      },
    })
  : null;
