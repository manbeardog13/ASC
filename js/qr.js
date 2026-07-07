// ============================================================================
// qr.js — QR payload format + bulletproof parsing (pure; no DOM). Shared by
// qrlabel.js (build) and scanner.js (parse). Scanning is the product's core
// promise, so parseScan is the single hardened chokepoint: it turns ANYTHING a
// camera / photo / keyboard produces into either a validated canonical code or
// an explicit "not an ASC sticker".
//
// Canonical code (schema-defined): ASC-<YYYY>-<NNNN>, sequence lpad-4 (may run
// to 5+ digits after 9999). Looked up by exact match on public_code.
//
// A label encodes a deep-link URL with the code IN THE PATH so a plain
// phone-camera scan opens the record regardless of format version:
//   v1 (legacy):  <base>#/set/ASC-2026-0042
//   v2 (current): <base>#/set/ASC-2026-0042?v=2&k=<checksum>
// ============================================================================
import { config } from "./config.js";

export const QR_VERSION = 2;

// Small deterministic checksum (FNV-1a → 4 chars). Not security — a guard
// against camera mis-reads and hand-typed codes. No dependencies.
export function qrChecksum(code) {
  let hash = 0x811c9dc5;
  const s = String(code).toUpperCase();
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().slice(-4).padStart(4, "0");
}

function baseUrl() {
  return config.APP_BASE_URL.endsWith("/") ? config.APP_BASE_URL : config.APP_BASE_URL + "/";
}

export function deepLinkFor(code) {
  return `${baseUrl()}#/set/${encodeURIComponent(code)}?v=${QR_VERSION}&k=${qrChecksum(code)}`;
}

// Turn a code-ish fragment into the canonical ASC-YYYY-NNNN, or null.
// `typed` loosens matching for hand entry (partial codes an employee would key
// in); scanned payloads always carry the full code, so scanning stays strict —
// this stops a random numeric QR/barcode from being read as a set.
export function normalizeCode(raw, typed = false) {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, "");
  s = s.split(/[?#]/)[0];                                  // drop any query/fragment
  if (!s) return null;
  const pad = (seq) => seq.padStart(4, "0");              // never truncate (>9999 stays)
  let m = s.match(/^ASC-(\d{4})-(\d{1,6})$/);             // exact full code
  if (m) return `ASC-${m[1]}-${pad(m[2])}`;
  m = s.match(/ASC-(\d{4})-(\d{1,6})/);                   // full code embedded in junk
  if (m) return `ASC-${m[1]}-${pad(m[2])}`;
  if (typed) {
    m = s.match(/^(\d{4})-(\d{1,6})$/);                   // "2026-0005"
    if (m) return `ASC-${m[1]}-${pad(m[2])}`;
    m = s.match(/^(\d{1,6})$/);                           // bare sequence → current year
    if (m) return `ASC-${new Date().getFullYear()}-${pad(m[1])}`;
  }
  return null;
}

// Parse anything into { code, version, checksum, checksumOk, valid }.
//   valid=false  → not recognizable as an ASC code (show "not an ASC sticker")
//   checksumOk=false → code read but the sticker's checksum disagrees (likely
//                      a mis-read digit; caller warns, still lets them proceed)
// Pass { typed:true } for keyboard entry to accept partial codes.
export function parseScan(text, { typed = false } = {}) {
  const none = { code: null, version: null, checksum: null, checksumOk: true, valid: false };
  if (text == null) return none;
  const s = String(text).trim();
  if (!s) return none;

  // The code always lives in the path segment after #/set/ when present; for a
  // bare payload the whole string is the candidate. Split the (in-hash) query off.
  const marker = "#/set/";
  const i = s.indexOf(marker);
  const segment = i !== -1 ? s.slice(i + marker.length) : s;
  const qi = segment.indexOf("?");
  const rawHead = qi === -1 ? segment : segment.slice(0, qi);
  const query = qi === -1 ? "" : segment.slice(qi + 1);

  let head = rawHead;
  try { head = decodeURIComponent(rawHead); } catch { /* malformed %-escape: use raw */ }

  const code = normalizeCode(head, typed);
  if (!code) return none;

  let params;
  try { params = new URLSearchParams(query); } catch { params = new URLSearchParams(); }
  const k = params.get("k");
  const checksum = k ? k.toUpperCase() : null;
  return {
    code,
    version: params.has("v") ? Number(params.get("v")) : (i !== -1 ? 1 : null),
    checksum,
    checksumOk: !checksum || checksum === qrChecksum(code),
    valid: true,
  };
}
