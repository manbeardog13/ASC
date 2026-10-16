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
//                         scan opens the right record. Resolved at runtime
//                         from where this file was served (origin + base path,
//                         e.g. https://asc-tire-hotel.netlify.app/ or
//                         https://manbeardog13.github.io/ASC/), so sign-in and
//                         password reset return to the host they started on.
//                         FALLBACK_BASE_URL is used if that can't be resolved.
// ============================================================================

export const FALLBACK_BASE_URL = "https://manbeardog13.github.io/ASC/";

// <base>/js/config.js → <base>/ ; only http(s) pages, otherwise the fallback.
export function resolveBaseUrl(moduleUrl, fallback = FALLBACK_BASE_URL) {
  try {
    const base = new URL("../", moduleUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return fallback;
    return base.href.endsWith("/") ? base.href : base.href + "/";
  } catch (e) { return fallback; }
}

export const config = {
  SUPABASE_URL:      "https://ilnqhlrvchuvpjgptjfx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_wLI8c19MvSw871n9wWSsyw_YpKHnkBA",
  APP_BASE_URL:      resolveBaseUrl(import.meta.url),
  // Optional MagicDNS https name of the NERO-SERVER relay (tailscale serve).
  // Leave empty until that name exists. The webhook URL and key stay in
  // Supabase secrets. Do not put a public function URL here.
  BUILDER_RELAY_URL: "",
};

// Returns true once the placeholders above have been replaced with real values.
export function isConfigured() {
  return (
    config.SUPABASE_URL.startsWith("http") &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
  );
}
