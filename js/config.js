// ============================================================================
// ASC Tire Hotel — configuration
// ----------------------------------------------------------------------------
// EDIT THE THREE VALUES BELOW, then save and commit this file.
//
//  1. SUPABASE_URL      — Supabase dashboard -> Project Settings -> Data API -> Project URL
//  2. SUPABASE_ANON_KEY — same page -> Project API keys -> "anon" / "public" key
//                         (This key is SAFE to publish. Row Level Security in
//                          schema.sql protects your data — nothing is readable
//                          until someone logs in.)
//  3. APP_BASE_URL      — the public web address where this app is hosted, e.g.
//                         https://manbeardog13.github.io/ASC/
//                         It is baked into every QR code so a plain phone-camera
//                         scan opens the right record. Include the trailing slash.
// ============================================================================

export const config = {
  SUPABASE_URL:      "YOUR_SUPABASE_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
  APP_BASE_URL:      "https://manbeardog13.github.io/ASC/",
};

// Returns true until the placeholders above have been replaced with real values.
export function isConfigured() {
  return (
    config.SUPABASE_URL.startsWith("http") &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
  );
}
