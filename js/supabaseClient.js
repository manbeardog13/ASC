// Creates the shared Supabase client from the values in config.js.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { config, isConfigured } from "./config.js";

export { isConfigured };

// When not configured yet, export null so the UI can show a friendly setup screen
// instead of crashing.
export const supabase = isConfigured()
  ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;
