// ============================================================================
// live-scan.js — fills the scan page's "Nedavno skenirano" card with REAL
// scans. The scanner itself is already live (qr.js + the inline script): every
// successful open writes { code, at } into localStorage 'asc.recentScans'.
// This module renders that list instantly (no network needed), then enriches
// each row with the real owner/plate from Supabase and prunes codes that no
// longer exist in the database. Every write is guarded: if the fetch fails the
// plain-code list stays; if the store is empty the static Croatian empty state
// ("Još nema skeniranja") in the HTML is left untouched.
// ============================================================================
import { getSession, listStorageSets } from '../js/db.js';

const KEY = 'asc.recentScans';
const MAX_SHOW = 5;
const MAX_KEEP = 12;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Read the store defensively: dedupe, validate through ASCQR's strict (non-typed)
// normalizer so only canonical ASC-YYYY-NNNN codes ever render.
function readRecent() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  for (const r of raw) {
    const code = window.ASCQR ? window.ASCQR.normalize(r && r.code) : (r && typeof r.code === 'string' ? r.code : null);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, at: Number(r && r.at) || 0 });
  }
  return out;
}

function writeRecent(entries) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_KEEP))); } catch (e) { /* storage blocked */ }
}

// Quiet time label: today → "14:32", yesterday → "Jučer", older → "5. srp".
function whenLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const day = new Date(ts); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 864e5);
  if (diff === 0) return d.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Jučer';
  return d.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
}

function render(entries, byCode) {
  const box = document.getElementById('recentList');
  if (!box) return;
  if (!entries.length) {
    box.innerHTML = '<p class="rs-empty">Još nema skeniranja</p>';
    return;
  }
  box.innerHTML = entries.slice(0, MAX_SHOW).map((e) => {
    const s = byCode ? byCode.get(e.code) : null;
    const sub = s ? [s.vehicle?.customer?.name, s.vehicle?.plate].filter(Boolean).join(' · ') : '';
    return '<a class="rs-row" href="set-detail.html?code=' + encodeURIComponent(e.code) + '">' +
      '<span class="rs-code">' + esc(e.code) + '</span>' +
      (sub ? '<span class="rs-who">' + esc(sub) + '</span>' : '') +
      '<time class="rs-when">' + esc(whenLabel(e.at)) + '</time>' +
    '</a>';
  }).join('');
}

// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  // Instant paint from the device-local store — codes there came from real,
  // validated scans on this device, so no network is needed for first render.
  let entries = readRecent();
  render(entries, null);
  liveFirstDone();

  const session = await getSession().catch(() => null);
  if (!session) return;              // the gate in app.js handles the redirect
  if (!entries.length) return;       // empty store: the calm empty state stands

  // Enrich with real owner/plate and prune codes that no longer exist (deleted
  // sets, demo leftovers). A failed fetch keeps the plain-code list as-is.
  try {
    const sets = await listStorageSets();
    const byCode = new Map(sets.map((s) => [s.public_code, s]));
    const pruned = entries.filter((e) => byCode.has(e.code));
    if (pruned.length !== entries.length) writeRecent(pruned);
    render(pruned, byCode);
  } catch (e) {
    console.warn('[live] recent scans enrichment failed — keeping plain codes:', e);
  }
})();
