// ============================================================================
// qr.js — QR payload format (pure; no DOM). Shared by qrlabel.js (build) and
// scanner.js (parse).
//
// A label always encodes a deep-link URL with the set code IN THE PATH, so a
// plain phone-camera scan opens the record regardless of format version:
//
//   v1 (legacy):  <base>#/set/ASC-2026-0042
//   v2 (current): <base>#/set/ASC-2026-0042?v=2&k=<checksum>
//
// The code lives in the path, so if the format ever becomes v3, every old
// sticker still resolves. `v` lets the app adapt; `k` is a checksum that flags
// a damaged or wrong sticker before an employee acts on it.
// ============================================================================
import { config } from "./config.js";

export const QR_VERSION = 2;

// Small deterministic checksum (FNV-1a → 4 chars). Not security — just a guard
// against mis-scans and hand-typed codes. No dependencies.
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

// Parse anything a scanner/camera returns into { code, version, checksumOk }.
export function parseScan(text) {
  if (!text) return { code: null, version: null, checksumOk: true };
  const marker = "#/set/";
  const idx = text.indexOf(marker);
  if (idx !== -1) {
    const tail = text.slice(idx + marker.length);
    const [rawCode, queryString = ""] = tail.split("?");
    const code = decodeURIComponent(rawCode.split(/[#/]/)[0]).trim().toUpperCase();
    const params = new URLSearchParams(queryString);
    const version = params.has("v") ? Number(params.get("v")) : 1;
    const k = params.get("k");
    return { code, version, checksumOk: !k || k.toUpperCase() === qrChecksum(code) };
  }
  const match = text.match(/ASC-\d{4}-\d+/i);
  if (match) return { code: match[0].toUpperCase(), version: 1, checksumOk: true };
  return { code: text.trim().toUpperCase(), version: null, checksumOk: true };
}
