// ============================================================================
// neroSessionHandoff.js — Nero-to-ASC session handoff (read-only consumer).
//
// Every ASC page should call establishHandoff() on load. This module never
// mints, refreshes, or changes Nero auth. It only reads a token Nero already
// handed over and verifies it.
//
// Token sources, in order, never from a URL or log:
//   1. sessionStorage['nero.asc.handoff.v1'] — short-lived, single-use JWT
//      with audience "asc". Removed when consumed.
//   2. sessionStorage['nero.company.session.v1'] — existing Summit session
//      (same origin, e.g. app.nerosummit.com/ASC/). See RemoteAccess.
//   3. sessionStorage['nero.tenant.session.v1'] — tenant session shape from
//      ASC PR 48 (v:1, access_token, expires).
//
// Verification uses Nero's public JWKS (ES256). Invalid, expired, wrong
// audience, tampered, replayed, or unreachable Nero => no session (fail
// closed). The existing ASC login stays as the fallback.
//
// Logout (asc:sign-out and clearHandoff()) clears the bridged session and
// the Nero/handoff tokens in this tab, per ASC PR 48 (logout must not leave
// the Nero token for the next user of the same tab).
// ============================================================================

export const COMPANY_SESSION_KEY = "nero.company.session.v1";
export const TENANT_SESSION_KEY = "nero.tenant.session.v1";
export const HANDOFF_KEY = "nero.asc.handoff.v1";
export const BRIDGE_KEY = "asc.nero.bridge.v1";
export const CONSUMED_KEY = "asc.nero.handoff.consumed.v1";
export const AUDIENCE = "asc";
export const NERO_APP_ORIGIN = "https://app.nerosummit.com";
export const NERO_ISSUER = "https://ryueshiunqobrluuuhyp.supabase.co/auth/v1";
export const JWKS_URL = "https://ryueshiunqobrluuuhyp.supabase.co/auth/v1/.well-known/jwks.json";
export const TOKEN_MIN = 1;
export const TOKEN_MAX = 8192;

export const REASON = Object.freeze({
  missing: "missing",
  expired: "expired",
  audience: "audience",
  tampered: "tampered",
  replay: "replay",
  unreachable: "unreachable",
  logout: "logout",
});

const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function defaultStorage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

function storageGet(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return typeof raw === "string" ? raw : null;
  } catch { return null; }
}

function storageSet(storage, key, value) {
  try { storage?.setItem?.(key, value); return storageGet(storage, key) === value; } catch { return false; }
}

function storageRemove(storage, key) {
  try { storage?.removeItem?.(key); } catch { /* ignore */ }
}

function b64urlToBytes(s) {
  if (typeof s !== "string" || !s) return null;
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return null; }
}

function bytesToJson(bytes) {
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export function splitJwt(token) {
  if (typeof token !== "string" || token.length < TOKEN_MIN || token.length > TOKEN_MAX) return null;
  if (!TOKEN_RE.test(token)) return null;
  const parts = token.split(".");
  const header = bytesToJson(b64urlToBytes(parts[0]));
  const payload = bytesToJson(b64urlToBytes(parts[1]));
  const signature = b64urlToBytes(parts[2]);
  if (!header || !payload || !signature) return null;
  return { header, payload, signature, signingInput: parts[0] + "." + parts[1] };
}

function audienceOf(payload) {
  const aud = payload?.aud;
  if (typeof aud === "string") return [aud];
  if (Array.isArray(aud)) return aud.filter((x) => typeof x === "string");
  return [];
}

function issuerOk(iss) {
  return iss === NERO_ISSUER;
}

function readConsumed(storage) {
  try {
    const raw = storageGet(storage, CONSUMED_KEY);
    if (!raw || raw.length > 16384) return new Set();
    const list = JSON.parse(raw);
    return Array.isArray(list) ? new Set(list.filter((x) => typeof x === "string" && x.length > 0 && x.length <= 128)) : new Set();
  } catch { return new Set(); }
}

function writeConsumed(storage, set) {
  const list = [...set].slice(-64);
  storageSet(storage, CONSUMED_KEY, JSON.stringify(list));
}

function markConsumed(storage, jti) {
  if (typeof jti !== "string" || !jti) return;
  const set = readConsumed(storage);
  set.add(jti);
  writeConsumed(storage, set);
}

export function readHandoffToken(storage = defaultStorage()) {
  const raw = storageGet(storage, HANDOFF_KEY);
  if (!raw || raw.length > 16384) return null;
  if (TOKEN_RE.test(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.v === 1 || parsed.version === 1) && typeof parsed.token === "string") {
      return parsed.token.length >= TOKEN_MIN && parsed.token.length <= TOKEN_MAX ? parsed.token : null;
    }
  } catch { /* not JSON */ }
  return null;
}

function accessTokenFromCompany(parsed, now) {
  if (!parsed || parsed.version !== 1) return null;
  const token = parsed.access_token;
  if (typeof token !== "string" || token.length < TOKEN_MIN || token.length > TOKEN_MAX) return null;
  if (typeof parsed.user === "string" && parsed.user && !UUID.test(parsed.user) && parsed.user.length > 256) return null;
  if (!Number.isFinite(parsed.expires)) return null;
  if (parsed.expires <= now) return { token, expired: true };
  return { token, expired: false };
}

function accessTokenFromTenant(parsed, now) {
  if (!parsed || parsed.v !== 1) return null;
  const token = parsed.access_token;
  if (typeof token !== "string" || token.length < TOKEN_MIN || token.length > TOKEN_MAX) return null;
  if (!Number.isFinite(parsed.expires)) return null;
  if (parsed.expires <= now) return { token, expired: true };
  return { token, expired: false };
}

function readStoredSession(storage, key, reader, now) {
  const raw = storageGet(storage, key);
  if (!raw || raw.length > 16384) return null;
  try { return reader(JSON.parse(raw), now); } catch { return null; }
}

async function fetchJwks(fetchImpl, url) {
  if (typeof fetchImpl !== "function") throw Object.assign(new Error("unreachable"), { reason: REASON.unreachable });
  let res;
  try {
    res = await fetchImpl(url, { method: "GET", cache: "no-store", redirect: "error", headers: { Accept: "application/json" } });
  } catch {
    throw Object.assign(new Error("unreachable"), { reason: REASON.unreachable });
  }
  if (!res || !res.ok) throw Object.assign(new Error("unreachable"), { reason: REASON.unreachable });
  let data;
  try { data = await res.json(); } catch {
    throw Object.assign(new Error("unreachable"), { reason: REASON.unreachable });
  }
  if (!data || !Array.isArray(data.keys)) throw Object.assign(new Error("unreachable"), { reason: REASON.unreachable });
  return data.keys;
}

function jwkForKid(keys, kid) {
  if (!Array.isArray(keys)) return null;
  if (kid) return keys.find((k) => k && k.kid === kid && k.kty === "EC" && (k.crv === "P-256" || k.crv === "P-256K" || k.crv === "prime256v1")) || null;
  const matches = keys.filter((k) => k && k.kty === "EC" && k.crv === "P-256");
  return matches.length === 1 ? matches[0] : null;
}

async function importVerifyKey(jwk) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !jwk) return null;
  const clean = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true };
  if (jwk.kid) clean.kid = jwk.kid;
  try {
    return await subtle.importKey("jwk", clean, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch { return null; }
}

async function verifyEs256(signingInput, signature, key) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || !key) return false;
  try {
    const data = new TextEncoder().encode(signingInput);
    return await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, data);
  } catch { return false; }
}

function fail(reason) {
  return { session: null, reason };
}

function sessionFromPayload(payload, source, nowMs) {
  const expSec = payload.exp;
  const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  if (!sub) return null;
  return {
    v: 1,
    sub,
    email: typeof payload.email === "string" ? payload.email : null,
    exp: expSec,
    expires: Number.isFinite(expSec) ? expSec * 1000 : 0,
    aud: audienceOf(payload)[0] || null,
    source,
    verifiedAt: nowMs,
  };
}

export function writeBridge(storage, session) {
  if (!storage || !session) return false;
  const safe = {
    v: 1,
    sub: session.sub,
    email: session.email,
    exp: session.exp,
    expires: session.expires,
    aud: session.aud,
    source: session.source,
    verifiedAt: session.verifiedAt,
  };
  return storageSet(storage, BRIDGE_KEY, JSON.stringify(safe));
}

export function readBridge(storage = defaultStorage(), now = Date.now()) {
  const raw = storageGet(storage, BRIDGE_KEY);
  if (!raw || raw.length > 16384) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || typeof s.sub !== "string" || !s.sub) return null;
    if (!Number.isFinite(s.expires) || s.expires <= now) return null;
    return s;
  } catch { return null; }
}

export function clearHandoff(storage = defaultStorage()) {
  storageRemove(storage, HANDOFF_KEY);
  storageRemove(storage, BRIDGE_KEY);
  storageRemove(storage, COMPANY_SESSION_KEY);
  storageRemove(storage, TENANT_SESSION_KEY);
  return { session: null, reason: REASON.logout };
}

export function bindSignOut(target = globalThis.document, storage = defaultStorage()) {
  if (!target?.addEventListener) return () => {};
  const onOut = () => { clearHandoff(storage); };
  target.addEventListener("asc:sign-out", onOut);
  return () => { try { target.removeEventListener("asc:sign-out", onOut); } catch { /* ignore */ } };
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("asc:sign-out", () => clearHandoff());
}

async function verifyJwt(token, { fetchImpl, jwks, jwksUrl, requireAudience, nowMs }) {
  const parts = splitJwt(token);
  if (!parts) return fail(REASON.tampered);
  const { header, payload, signature, signingInput } = parts;
  if (header.alg !== "ES256") return fail(REASON.tampered);
  if (!issuerOk(payload.iss)) return fail(REASON.tampered);
  const expSec = payload.exp;
  if (!Number.isFinite(expSec) || expSec * 1000 <= nowMs) return fail(REASON.expired);
  if (requireAudience) {
    if (!audienceOf(payload).includes(AUDIENCE)) return fail(REASON.audience);
  }
  let keys = jwks;
  if (!keys) {
    try { keys = await fetchJwks(fetchImpl, jwksUrl || JWKS_URL); }
    catch (err) { return fail(err.reason || REASON.unreachable); }
  }
  const jwk = jwkForKid(keys, header.kid);
  if (!jwk) return fail(REASON.tampered);
  const key = await importVerifyKey(jwk);
  if (!key) return fail(REASON.tampered);
  const ok = await verifyEs256(signingInput, signature, key);
  if (!ok) return fail(REASON.tampered);
  const session = sessionFromPayload(payload, requireAudience ? "handoff" : "nero-session", nowMs);
  if (!session) return fail(REASON.tampered);
  return { session, reason: null, payload };
}

async function consumeHandoffToken(storage, { fetchImpl, jwks, jwksUrl, nowMs }) {
  const token = readHandoffToken(storage);
  if (!token) return null;
  const preview = splitJwt(token);
  const jti = preview?.payload && typeof preview.payload.jti === "string" ? preview.payload.jti : "";
  if (!jti) {
    storageRemove(storage, HANDOFF_KEY);
    return fail(REASON.tampered);
  }
  if (readConsumed(storage).has(jti)) {
    storageRemove(storage, HANDOFF_KEY);
    return fail(REASON.replay);
  }
  const result = await verifyJwt(token, { fetchImpl, jwks, jwksUrl, requireAudience: true, nowMs });
  if (result.reason === REASON.unreachable) return result;
  storageRemove(storage, HANDOFF_KEY);
  markConsumed(storage, jti);
  return result;
}

export async function establishHandoff({
  storage = defaultStorage(),
  fetchImpl = globalThis.fetch,
  jwks,
  jwksUrl = JWKS_URL,
  now = Date.now(),
  location,
} = {}) {
  const nowMs = typeof now === "function" ? now() : now;
  // Tokens in URLs are ignored on purpose — never treat query/hash as a handoff.
  if (location && (location.search || location.hash || location.href)) {
    /* explicitly unused */
  }
  if (!storage) return fail(REASON.missing);

  const existing = readBridge(storage, nowMs);
  if (existing) return { session: existing, reason: null };

  const oneTime = await consumeHandoffToken(storage, { fetchImpl, jwks, jwksUrl, nowMs });
  if (oneTime) {
    if (oneTime.session) writeBridge(storage, oneTime.session);
    return oneTime.session ? { session: oneTime.session, reason: null } : oneTime;
  }

  const company = readStoredSession(storage, COMPANY_SESSION_KEY, accessTokenFromCompany, nowMs);
  const tenant = readStoredSession(storage, TENANT_SESSION_KEY, accessTokenFromTenant, nowMs);
  const stored = company || tenant;
  if (!stored) return fail(REASON.missing);
  if (stored.expired) return fail(REASON.expired);
  const result = await verifyJwt(stored.token, { fetchImpl, jwks, jwksUrl, requireAudience: false, nowMs });
  if (result.session) {
    result.session.source = company ? "company-session" : "tenant-session";
    writeBridge(storage, result.session);
    return { session: result.session, reason: null };
  }
  return result;
}

export function hasBridgedSession(storage = defaultStorage(), now = Date.now()) {
  return Boolean(readBridge(storage, typeof now === "function" ? now() : now));
}
