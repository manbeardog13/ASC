// ============================================================================
// live-workshop.js — fills the workshop (shop-floor) screen with REAL shop data
// from Supabase (via ../js/db.js). The auth gate in app.js already guarantees a
// session before this runs. Every write is guarded: if a fetch fails, the page
// keeps its existing (empty) markup and stays silent — it never paints made-up
// rows. Search, the ?q= agent hand-off and the mic press feedback are wired
// here too, over the real inventory.
// ============================================================================
import { getSession, healthStats, listStorageSets } from '../js/db.js';

const SEASON_LABEL = { winter: 'Zimske', summer: 'Ljetne', all_season: 'Cjelogodišnje' };
const SEASON_CLASS = { winter: 'win', summer: '', all_season: 'all' };
const STATUS_LABEL = { in_storage: 'Spremljeno', reserved: 'Rezervirano', checked_out: 'Preuzeto', missing: 'Nedostaje' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Section headings reuse #wsCount's exact label styling so the rest view reads
// as one system with the search-count line above it.
const LABEL_STYLE = 'display:block;padding:6px 4px 0;font:600 12px Inter;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)';
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.8"/><path d="M20.6 20.6L16 16"/></svg>';
const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.4v13.2M5.4 12h13.2"/></svg>';

function localISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function onDay(dateStr, iso) { return dateStr ? String(dateStr).slice(0, 10) === iso : false; }
function kompleta(n) { return n === 1 ? 'komplet' : 'kompleta'; }

// Set a number. While the Prag splash still holds the reveal (html.splashing)
// the count-ups haven't run yet, so feed the REAL value into data-count and let
// the held animation count up to it the moment the surface lifts.
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}

// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

// ---- UI refs + state -------------------------------------------------------
const results = document.getElementById('wsResults');
const input = document.getElementById('wsSearch');
const count = document.getElementById('wsCount');

let loaded = false;      // true only after real data landed — nothing paints before that
let stats = null;        // healthStats(): todayCheckIns / todayPickups / inventory
let SETS = [];           // [{ set, hay }] — every live set, with a searchable haystack
let dueToday = [];       // expected_out_date = today, not yet picked up
let inToday = [];        // checked in today

function locParts(s) {
  const parts = [];
  if (s.zone) parts.push('Zona ' + s.zone);
  if (s.rack) parts.push('Regal ' + s.rack);
  if (s.shelf) parts.push('Polica ' + s.shelf);
  if (s.slot) parts.push('Mjesto ' + s.slot);
  return parts;
}

// One oversized result row — the exact structure the page's CSS was built for.
function row(s) {
  const who = s.vehicle?.customer?.name || 'Kupac';
  const plate = s.vehicle?.plate || '';
  const status = STATUS_LABEL[s.status] || s.status || '';
  const season = SEASON_LABEL[s.season] || '';
  const parts = locParts(s);
  const loc = parts.length
    ? '<span class="ws-loc"><span class="ws-loc-k">Lokacija</span><span class="ws-loc-v">' + parts.map(esc).join('<br>') + '</span></span>'
    : '<span class="ws-loc none"><span class="ws-loc-k">Lokacija</span><span class="ws-loc-v">Bez lokacije</span></span>';
  return '<a class="ws-row" href="set-detail.html?code=' + encodeURIComponent(s.public_code) + '">'
    + '<span class="ws-row-body">'
    +   '<b>' + esc(s.public_code) + '</b>'
    +   '<span class="ws-row-who">' + esc(who) + (plate ? ' · ' + esc(plate) : '') + '</span>'
    +   '<span class="ws-row-meta"><small>' + esc(status) + '</small>'
    +     (season ? '<span class="chip ' + (SEASON_CLASS[s.season] || '') + '">' + esc(season) + '</span>' : '')
    +   '</span>'
    + '</span>'
    + loc
    + '</a>';
}

function label(text) { return '<span style="' + LABEL_STYLE + '">' + esc(text) + '</span>'; }
function noneRow(icon, text) { return '<div class="ws-none">' + icon + ' ' + esc(text) + '</div>'; }

// Everything the placeholder promised search would cover: name, plate, code,
// status, season, dimension, DOT, brand, location.
function toHay(s) {
  const bits = [s.public_code, s.vehicle?.customer?.name, s.vehicle?.plate,
    STATUS_LABEL[s.status], SEASON_LABEL[s.season], locParts(s).join(' ')];
  (s.tires || []).forEach((t) => bits.push(t.size, t.brand, t.model, t.dot_code));
  return bits.filter(Boolean).join(' ').toLowerCase();
}

// Rest view (no search query): today's expected pickups + today's check-ins.
function paintRest() {
  if (!loaded) { results.innerHTML = ''; count.textContent = ''; return; }
  const html = [];
  html.push(label('Danas za preuzimanje'));
  html.push(dueToday.length ? dueToday.map(row).join('') : noneRow(ICON_CLOCK, 'Danas nema preuzimanja'));
  html.push(label('Danas zaprimljeno'));
  html.push(inToday.length ? inToday.map(row).join('') : noneRow(ICON_PLUS, 'Danas nema zaprimanja'));
  if (stats && stats.inventory === 0) {
    html.push('<a class="ws-none" href="checkin.html" style="text-decoration:none;color:var(--lava-ink)">' + ICON_PLUS + ' Zaprimi prvi set</a>');
  }
  results.innerHTML = html.join('');
  count.textContent = stats
    ? (stats.inventory === 0
        ? 'Skladište je prazno'
        : 'Danas: zaprimljeno ' + stats.todayCheckIns + ' · preuzeto ' + stats.todayPickups + ' · na čuvanju ' + stats.inventory)
    : '';
}

function paint() {
  const query = (input.value || '').trim().toLowerCase();
  if (!query) { paintRest(); return; }
  if (!loaded) { results.innerHTML = ''; count.textContent = ''; return; }
  const rows = SETS.filter((x) => x.hay.indexOf(query) > -1).slice(0, 8);
  if (rows.length) {
    results.innerHTML = rows.map((x) => row(x.set)).join('');
    count.textContent = rows.length + ' ' + kompleta(rows.length);
  } else {
    results.innerHTML = noneRow(ICON_SEARCH, 'Ništa za „' + input.value.trim() + '”');
    count.textContent = 'Ništa za „' + input.value.trim() + '”';
  }
}

// ---- Mechanics preserved from the preview build ----------------------------
input.addEventListener('input', paint);
// A voice/typed command from the global ASC Agent arrives as ?q= — apply it.
try {
  const qp = new URLSearchParams(location.search).get('q');
  if (qp) { input.value = qp; setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }
} catch (e) { /* no-op */ }

// Mic press feedback (no real speech yet).
const mic = document.getElementById('wsMic');
const sub = document.getElementById('wsMicSub');
const IDLE = 'Dodirnite pa recite registraciju, ime ili kôd';
if (mic) mic.addEventListener('click', () => {
  const on = mic.classList.toggle('is-listening');
  mic.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (sub) sub.textContent = on ? 'Slušam…' : IDLE;
});

// ---- Real data --------------------------------------------------------------
(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }  // the gate in app.js handles the redirect

  let health, sets;
  try {
    [health, sets] = await Promise.all([healthStats(), listStorageSets()]);
  } catch (e) {
    console.warn('[live] workshop data failed — keeping placeholder markup:', e);
    liveFirstDone();
    return;
  }

  stats = health;
  SETS = sets.map((s) => ({ set: s, hay: toHay(s) }));

  const today = localISO();
  dueToday = sets
    .filter((s) => s.status !== 'checked_out' && onDay(s.expected_out_date, today))
    .sort((a, b) => String(a.vehicle?.customer?.name || '').localeCompare(String(b.vehicle?.customer?.name || ''), 'hr'))
    .slice(0, 8);
  inToday = sets
    .filter((s) => onDay(s.check_in_date, today))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 8);

  loaded = true;

  // The dark "Za preuzimanje" bar: how many sets are due for pickup today.
  setNum(document.querySelector('.ws-btn-num [data-count]'), dueToday.length);

  paint();          // respects a live search / ?q= hand-off; otherwise paints the rest view
  liveFirstDone();  // real data is in the DOM — the splash may lift into live numbers
})();
