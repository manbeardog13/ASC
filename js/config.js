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

import { HOST_MODE } from "./host-mode.js";

export const FALLBACK_BASE_URL = "https://manbeardog13.github.io/ASC/";

// <base>/js/config.js → <base>/ ; only http(s) pages, otherwise the fallback.
export function resolveBaseUrl(moduleUrl, fallback = FALLBACK_BASE_URL) {
  try {
    const base = new URL("../", moduleUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return fallback;
    return base.href.endsWith("/") ? base.href : base.href + "/";
  } catch (e) { return fallback; }
}

const DIRECT = {
  SUPABASE_URL:      "https://ilnqhlrvchuvpjgptjfx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_wLI8c19MvSw871n9wWSsyw_YpKHnkBA",
  APP_BASE_URL:      resolveBaseUrl(import.meta.url),
  // Optional MagicDNS https name of the NERO-SERVER relay (tailscale serve).
  // Leave empty until that name exists. The webhook URL and key stay in
  // Supabase secrets. Do not put a public function URL here.
  BUILDER_RELAY_URL: "",
};

// Nero-hosted mode: data calls go to Nero Summit's backend (/ASC/api, same origin) with the
// Nero Summit session; ASC's own Supabase project and login are no longer used by the browser.
// The session key must match the Nero Summit login's supabase-js session (NERO docs/tenants/CONTRACT.md §5).
export const NERO = Object.freeze({
  API_PATH: "api",
  ANON_KEY: "sb_publishable_pYw_KxX1v98YGTZM31tL3Q_kFsTVefP",
  STORAGE_KEY: "sb-ryueshiunqobrluuuhyp-auth-token",
  LOGIN_URL: "/?next=%2FASC%2F",
});

export function buildConfig(mode, moduleUrl, direct = DIRECT) {
  if (mode !== "nero") return { ...direct, HOST_MODE: "direct" };
  const api = new URL(NERO.API_PATH, new URL("../", moduleUrl)).href.replace(/\/$/, "");
  return { ...direct, HOST_MODE: "nero", SUPABASE_URL: api, SUPABASE_ANON_KEY: NERO.ANON_KEY,
           STORAGE_KEY: NERO.STORAGE_KEY, LOGIN_URL: NERO.LOGIN_URL };
}

export const config = buildConfig(HOST_MODE, import.meta.url);

// Returns true once the placeholders above have been replaced with real values.
export function isConfigured() {
  return (
    config.SUPABASE_URL.startsWith("http") &&
    !config.SUPABASE_URL.includes("YOUR_") &&
    !config.SUPABASE_ANON_KEY.includes("YOUR_")
  );
}
