// ============================================================================
// tenantRole.js — the signed-in user's role in the ASC tenant on Nero Summit.
// Source of truth: Nero's public.tenant_my_tenants() (NERO PR 666/688, ADR 0157).
// It reads the verified Nero session that app.nerosummit.com hands over at sign-in
// (sessionStorage 'nero.tenant.session.v1', same origin, access token only).
//
// UI HINT ONLY. The server re-checks every People/Audit action in SQL, so a wrong
// or forged value here can only show/hide a link, never grant access. Any doubt
// (no session, expired, network error, function not deployed yet) returns null,
// and null hides tenant_admin-only UI (fail closed).
// ============================================================================
export const TENANT = "asc";
export const NERO_PROJECT = "https://ryueshiunqobrluuuhyp.supabase.co";
export const NERO_PUBLISHABLE_KEY = "sb_publishable_pYw_KxX1v98YGTZM31tL3Q_kFsTVefP";
export const SESSION_KEY = "nero.tenant.session.v1";
export const PEOPLE_URL = "https://app.nerosummit.com/tenant/?t=" + TENANT;
export const ROLES = ["tenant_admin", "manager", "staff", "viewer", "operator"];

export function readNeroSession(storage, now = Date.now()) {
  try {
    const s = JSON.parse(storage?.getItem(SESSION_KEY) || "null");
    return s && s.v === 1 && typeof s.access_token === "string" && Number.isFinite(s.expires) && s.expires > now ? s : null;
  } catch { return null; }
}

// Pick the role for `tenant` out of tenant_my_tenants() output. Unknown roles -> null.
export function roleFor(list, tenant = TENANT) {
  if (!Array.isArray(list)) return null;
  const row = list.find((x) => x && x.tenant === tenant);
  return row && ROLES.includes(row.role) ? row.role : null;
}

// Nero operators manage every tenant's people, so they get the link too.
export const canManagePeople = (role) => role === "tenant_admin" || role === "operator";

let cached;
export async function loadTenantRole({ storage = globalThis.sessionStorage, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const session = readNeroSession(storage, now);
  if (!session || typeof fetchImpl !== "function") return null;
  if (cached && cached.token === session.access_token) return cached.role;
  try {
    const r = await fetchImpl(NERO_PROJECT + "/rest/v1/rpc/tenant_my_tenants", {
      method: "POST", cache: "no-store", redirect: "error",
      headers: { apikey: NERO_PUBLISHABLE_KEY, Authorization: "Bearer " + session.access_token, "Content-Type": "application/json" },
      body: "{}",
    });
    const role = r.ok ? roleFor(await r.json().catch(() => null)) : null;
    cached = { token: session.access_token, role };
    return role;
  } catch { return null; }
}
export function _resetTenantRoleCache() { cached = undefined; }

// Show/hide every [data-tenant-admin] element. Default (null) hides.
export function applyTenantAccess(root, role) {
  if (!root) return;
  const ok = canManagePeople(role);
  root.querySelectorAll("[data-tenant-admin]").forEach((el) => { el.hidden = !ok; });
}
