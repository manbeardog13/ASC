// ============================================================================
// live-reminders.js — fills the pickup-reminders screen (reminders.html) with
// REAL shop data from Supabase (via ../js/db.js), following live-dashboard.js.
// Sets with an expected_out_date are tiered: Kasni (overdue) / Danas / Ovaj
// tjedan (next 7 days) / Kasnije, with reminded ones (reminded_at set) in the
// collapsed "Već podsjećeno" section.
//
// One deliberate difference from live-dashboard: the mock rows here ARE fake
// customers, so they are wiped SYNCHRONOUSLY at module start — before the auth
// gate ever restores page visibility — and a failed fetch lands on the calm
// empty state (console.warn '[live] …') instead of keeping fake people around.
//
// "Označi podsjećeno" persistence rides the page's EXISTING inline interaction
// script: the inline handler does the visual move into "Već podsjećeno"; this
// module writes reminded_at (markReminded → updateStorageSet, offline-queued).
// ============================================================================
import { getSession, listStorageSets, markReminded } from '../js/db.js';

const SEASON_LABEL = { winter: 'Zimske', summer: 'Ljetne', all_season: 'Cjelogodišnje' };
const SEASON_CLASS = { winter: 'win', summer: '', all_season: 'all' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

// The page's own row icons, verbatim (clock / phone / sms / mail / check).
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><path d="M12 7.6v4.6l3 1.9"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4.5c.3 0 .6.2.7.5l1 2.4a.8.8 0 01-.2.9L7 9.3a11 11 0 004.7 4.7l1-1a.8.8 0 01.9-.2l2.4 1c.3.1.5.4.5.7V17a2 2 0 01-2 2A13 13 0 014.5 6.5a2 2 0 012-2z"/></svg>',
  sms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.4A1.4 1.4 0 016.4 5h11.2A1.4 1.4 0 0119 6.4v7.2a1.4 1.4 0 01-1.4 1.4H9l-4 3.4V6.4z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" rx="2.2"/><path d="M4.6 7.2l7.4 5.6 7.4-5.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4.5 4.5L19 7"/></svg>',
};

const fmtDate = (d) => new Date(d).toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
function dayDiff(dateish) {
  const d = new Date(dateish); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 864e5);
}
function relReminded(iso) {
  const t = new Date(iso);
  if (isNaN(t)) return 'podsjećeno';
  const mins = Math.round((Date.now() - t.getTime()) / 6e4);
  if (mins < 5) return 'podsjećeno upravo';
  if (mins < 60) return 'podsjećeno prije ' + mins + ' min';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return 'podsjećeno prije ' + hrs + ' h';
  if (-dayDiff(t) === 1) return 'podsjećeno jučer';
  return 'podsjećeno ' + fmtDate(t);
}

// Same rules as live-dashboard's setNum: while the Prag splash holds the reveal
// we feed the real value into data-count for the held count-up; otherwise we
// claim the element (strip data-count so a stale count-up can't overwrite it).
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}

// ---- Page handles ----------------------------------------------------------
const secs = {
  overdue: q('[data-sec="overdue"]'),
  today: q('[data-sec="today"]'),
  week: q('[data-sec="week"]'),
  later: q('[data-sec="later"]'),
  rested: q('[data-sec="rested"]'),
  empty: q('[data-sec="empty"]'),
};
const heroNum = q('.rem-stage .hero-num [data-count]');
const heroCap = q('.rem-stage .cap');
const meterBar = q('.rem-stage .meter i');
const spillNums = qa('.rem-stage .spills .spill b');
const cta = q('.rem-stage .cta');
const brief = q('.rem-brief');
const corner = q('.rem-stage .tab-corner');

// ---- SYNCHRONOUS mock wipe — runs before the gate restores visibility, so a
// fake customer can never flash, whatever the fetch does later. -------------
for (const key of ['overdue', 'today', 'week', 'later', 'rested']) {
  const sec = secs[key];
  if (!sec) continue;
  const list = q('.rr-list', sec);
  if (list) list.innerHTML = '';
  const badge = q('.count-badge', sec);
  if (badge) { badge.dataset.count = '0'; badge.textContent = '0'; }
  sec.hidden = true;
}
if (heroNum) { heroNum.dataset.count = '0'; heroNum.textContent = '0'; }
if (heroCap) heroCap.textContent = '';
if (meterBar) { meterBar.dataset.w = '0'; meterBar.style.width = '0%'; }
spillNums.forEach((b) => { b.dataset.count = '0'; b.textContent = '0'; });
if (cta) cta.hidden = true;
if (brief) brief.hidden = true;
if (corner) {
  const now = new Date();
  corner.textContent = now.toLocaleDateString('hr-HR', { weekday: 'short' }) + ' · ' + fmtDate(now) + ' · Dubrovnik';
}

// ---- Row rendering ---------------------------------------------------------
function actionsHTML(s) {
  const name = s.vehicle?.customer?.name || 'Kupac';
  const phone = String(s.vehicle?.customer?.phone || '').trim();
  const email = String(s.vehicle?.customer?.email || '').trim();
  const tel = phone.replace(/[^\d+]/g, '');
  const call = phone
    ? '<a class="ract" href="tel:' + esc(tel) + '" aria-label="Nazovi — ' + esc(name) + '">' + ICON.phone + 'Nazovi</a>'
    : '<span class="ract is-disabled" aria-disabled="true" title="Nema telefona">' + ICON.phone + 'Nazovi</span>';
  const sms = phone
    ? '<a class="ract" href="sms:' + esc(tel) + '" aria-label="Pošalji poruku">' + ICON.sms + 'Poruka</a>'
    : '<span class="ract is-disabled" aria-disabled="true" title="Nema telefona">' + ICON.sms + 'Poruka</span>';
  const mail = email
    ? '<a class="ract" href="mailto:' + esc(email) + '?subject=' + encodeURIComponent('ASC — ' + (s.public_code || '')) + '" aria-label="Pošalji e-poštu">' + ICON.mail + 'E-pošta</a>'
    : '<span class="ract is-disabled" aria-disabled="true" title="Nema e-pošte">' + ICON.mail + 'E-pošta</span>';
  return call + sms + mail;
}

function rowHTML(s, tier) {
  const code = s.public_code || '';
  const name = s.vehicle?.customer?.name || 'Kupac';
  const plate = s.vehicle?.plate || '';
  const seasonLbl = SEASON_LABEL[s.season] || '';
  const rested = tier === 'rested';
  const cls = 'rr' + (tier === 'overdue' ? ' rr-overdue' : tier === 'today' ? ' rr-today' : rested ? ' rr-rest' : '');
  const chip = seasonLbl ? '<span class="chip ' + (SEASON_CLASS[s.season] || '') + '">' + esc(seasonLbl) + '</span>' : '';
  const ok = rested && s.reminded_at ? '<span class="rr-ok">' + ICON.ok + esc(relReminded(s.reminded_at)) + '</span>' : '';
  const btn = rested
    ? '<button type="button" class="ract wide again" data-remind>' + ICON.check + 'Podsjećeno — označi ponovno</button>'
    : '<button type="button" class="ract wide" data-remind>' + ICON.check + 'Označi podsjećeno</button>';
  const href = 'set-detail.html?code=' + encodeURIComponent(code);
  return '<article class="' + cls + '" data-set-id="' + esc(s.id) + '" data-code="' + esc(code) + '">' +
    '<div class="rr-top"><span class="rem-due">' + ICON.clock + 'Rok ' + esc(fmtDate(s.expected_out_date)) + '</span>' +
    '<a class="rr-code" href="' + href + '">' + esc(code) + '</a></div>' +
    '<div class="rr-id"><span class="rr-name">' + esc(name) + '</span>' + (plate ? '<span class="rr-plate">' + esc(plate) + '</span>' : '') + '</div>' +
    '<div class="rr-meta">' + chip + ok + '</div>' +
    '<div class="rr-acts">' + actionsHTML(s) + '</div>' +
    btn + '</article>';
}

function fillSection(key, items, tier) {
  const sec = secs[key];
  if (!sec) return;
  const list = q('.rr-list', sec);
  if (list) list.innerHTML = items.map((s) => rowHTML(s, tier)).join('');
  setNum(q('.count-badge', sec), items.length);
  sec.hidden = items.length === 0;
}

function showEmpty() {
  for (const key of ['overdue', 'today', 'week', 'later', 'rested']) {
    if (secs[key]) secs[key].hidden = true;
  }
  if (secs.empty) secs.empty.hidden = false;
  setNum(heroNum, 0);
  if (heroCap) heroCap.textContent = 'Nema zakazanih preuzimanja';
  if (meterBar) { meterBar.dataset.w = '0'; meterBar.style.width = '0%'; }
  spillNums.forEach((b) => setNum(b, 0));
  if (cta) cta.hidden = true;
  if (brief) brief.hidden = true;
}

let counts = null;   // { pending, total } — the CTA handler settles the hero from this

function render(sets) {
  const due = sets.filter((s) => s.status !== 'checked_out' && s.expected_out_date);
  const g = { overdue: [], today: [], week: [], later: [], rested: [] };
  for (const s of due) {
    if (s.reminded_at) { g.rested.push(s); continue; }
    const d = dayDiff(s.expected_out_date);
    if (d < 0) g.overdue.push(s);
    else if (d === 0) g.today.push(s);
    else if (d <= 7) g.week.push(s);
    else g.later.push(s);
  }
  const byDue = (a, b) => new Date(a.expected_out_date) - new Date(b.expected_out_date);
  g.overdue.sort(byDue); g.today.sort(byDue); g.week.sort(byDue); g.later.sort(byDue);
  g.rested.sort((a, b) => new Date(b.reminded_at) - new Date(a.reminded_at));

  const pending = g.overdue.length + g.today.length + g.week.length + g.later.length;
  const total = pending + g.rested.length;
  counts = { pending, total };

  if (!total) { showEmpty(); return; }

  if (secs.empty) secs.empty.hidden = true;
  fillSection('overdue', g.overdue, 'overdue');
  fillSection('today', g.today, 'today');
  fillSection('week', g.week, 'week');
  fillSection('later', g.later, 'later');
  fillSection('rested', g.rested, 'rested');

  setNum(heroNum, pending);
  if (heroCap) {
    heroCap.textContent = g.overdue.length + ' kasni · ' + g.today.length + ' danas · ' + g.week.length + ' ovaj tjedan'
      + (g.later.length ? ' · ' + g.later.length + ' kasnije' : '')
      + ' · ' + g.rested.length + ' od ' + total + ' već podsjećeno';
  }
  const pct = Math.round((g.rested.length / total) * 100);
  if (meterBar) { meterBar.dataset.w = String(pct); meterBar.style.width = pct + '%'; }
  setNum(spillNums[0], g.overdue.length);
  setNum(spillNums[1], g.today.length);
  setNum(spillNums[2], g.week.length);
  if (brief) {
    brief.hidden = pending === 0;
    if (pending > 0) brief.innerHTML = '<span class="dot"></span>Podsjetnici za danas: ' + pending;
  }
  if (cta) cta.hidden = pending === 0;
}

// ---- Interactions ----------------------------------------------------------
// Persist "označi podsjećeno". The page's inline script (registered first) does
// the visual move into "Već podsjećeno"; here we only write reminded_at.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remind]');
  if (!btn) return;
  const row = btn.closest('.rr');
  const id = row && row.dataset.setId;
  if (!id) return;
  if (secs.rested) secs.rested.hidden = false;   // the visual move must never land in a hidden card
  if (row.classList.contains('rr-rest')) {       // re-mark: refresh the "podsjećeno …" stamp
    const okEl = q('.rr-ok', row);
    if (okEl) okEl.innerHTML = ICON.ok + 'podsjećeno upravo';
  }
  markReminded(id).catch((err) => console.warn('[live] mark reminded failed:', err));
});

// Row click (outside links/buttons) opens the set.
document.addEventListener('click', (e) => {
  if (e.target.closest('a,button,summary')) return;
  const row = e.target.closest('.rr');
  const code = row && row.dataset.code;
  if (code) location.href = 'set-detail.html?code=' + encodeURIComponent(code);
});

// "Podsjeti sve preostale": click every pending row's own button — the inline
// script animates each move, the handler above persists each reminded_at —
// then settle the hero on "everything reminded".
if (cta) {
  cta.addEventListener('click', () => {
    qa('.rem-sec .rr:not(.rr-rest) [data-remind]').forEach((b) => b.click());
    setNum(heroNum, 0);
    spillNums.forEach((b) => setNum(b, 0));
    if (meterBar) { meterBar.dataset.w = '100'; meterBar.style.width = '100%'; }
    if (heroCap && counts) {
      heroCap.textContent = '0 kasni · 0 danas · 0 ovaj tjedan · ' + counts.total + ' od ' + counts.total + ' već podsjećeno';
    }
    if (brief) brief.hidden = true;
    cta.hidden = true;
  });
}

// ---- Boot (the gate in app.js races ascLiveFirst before lifting the page) ---
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }   // the gate in app.js handles the redirect

  let sets;
  try {
    sets = await listStorageSets();
  } catch (e) {
    console.warn('[live] reminders data failed — showing the empty state:', e);
    showEmpty();
    liveFirstDone();
    return;
  }
  try {
    render(sets);
  } catch (e) {
    console.warn('[live] reminders render failed — showing the empty state:', e);
    showEmpty();
  }
  liveFirstDone();
})();
