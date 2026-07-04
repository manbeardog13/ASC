// ============================================================================
// ASC Tire Hotel — configuration  (LIVE — already wired to the shop's backend)
// ----------------------------------------------------------------------------
//  1. SUPABASE_URL      — the PROJECT URL only (https://<ref>.supabase.co).
//                         ⚠ Do NOT append /rest/v1 — the Supabase client adds
//                         that itself; including it here breaks every request.
//  2. SUPABASE_ANON_KEY — the "publishable" / anon key. SAFE to publish:
//                         Row Level Security in schema.sql protects the data —
//                         nothing is readable until someone logs in.
//  3. APP_BASE_URL      — the public address where this app is hosted. It is
//                         baked into every QR label so a plain phone-camera
//                         scan opens the right record. Keep the trailing slash.
// ============================================================================

export const config = {
  SUPABASE_URL:      "https://ilnqhlrvchuvpjgptjfx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_wLI8c19MvSw871n9wWSsyw_YpKHnkBA",
  APP_BASE_URL:      "https://manbeardog13.github.io/ASC/",
};

// Returns true once the placeholders above have been replaced with real values.
export function isConfigured() {
  return (
    config.SUPABASE_URL.startsWith("http") &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
  );
}
