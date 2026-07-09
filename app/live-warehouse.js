// ============================================================================
// live-warehouse.js — builds the warehouse map (zone → regal → polica → mjesto)
// from REAL shop data in Supabase (via ../js/db.js). The auth gate in app.js
// already guarantees a session before this runs. Every write is guarded: if a
// fetch fails, the page keeps its skeleton (header at 0, empty map region)
// instead of blanking or showing fake people.
//
// The peek window (click a lot → white card) is preserved from the preview
// build; its action is "Uredi" — it stashes the set in sessionStorage
// 'asc.prefill' and opens checkin.html?prefill=1, the same bridge the ASC
// Agent and set-detail.html use.
// ============================================================================
import { getSession, warehouseOccupancy, listStorageSets } from '../js/db.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (s, r = document) => r.querySelector(s);
const splashing = () => document.documentElement.classList.contains('splashing');

const CHEV = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.2s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const GO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';

// Set a number — same contract as live-dashboard: while the Prag splash still
// holds the reveal we feed data-count (app.js's held count-up animates to it on
// asc:reveal); after the reveal we write the number directly.
function setNum(el, val) {
  if (!el) return;
  if (splashing() && Number.isFinite(+val)) { el.dataset.count = String(+val); return; }
  el.removeAttribute('data-count'); el.textContent = String(val);
}
// The same idea for numbers born inside generated markup.
function numCell(val) {
  return splashing() ? '<b data-count="' + (+val || 0) + '">0</b>' : '<b>' + (+val || 0) + '</b>';
}

// "A" → "Zona A"; a value that already says "Zona …" stays as typed; empty → null.
function label(prefix, v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  return new RegExp('^' + prefix, 'i').test(s) ? s : prefix + ' ' + s;
}
// Slot tile text: the stored slot value ("3" → "03"), or the running position.
function slotText(v, i) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return String(i + 1).padStart(2, '0');
  return /^\d$/.test(s) ? '0' + s : s;
}
// Croatian count: 1 komplet / 2 kompleta, 1 regal / 2 regala.
function hrCount(n, one, many) {
  return n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? one : many);
}

// The gate in app.js races this against a 1200ms cap before lifting the splash,
// so the map usually reveals with live occupancy already in place.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }  // the gate in app.js handles the redirect

  let occ, sets;
  try {
    [occ, sets] = await Promise.all([warehouseOccupancy(), listStorageSets()]);
  } catch (e) {
    console.warn('[live] warehouse data failed — keeping the skeleton:', e);
    liveFirstDone();
    return;
  }

  const ACTIVE = new Set(['in_storage', 'reserved']);
  const located = occ.filter((s) => ACTIVE.has(s.status) && String(s.zone == null ? '' : s.zone).trim() !== '');
  const activeSets = sets.filter((s) => ACTIVE.has(s.status));
  const byCode = new Map(activeSets.map((s) => [s.public_code, s]));       // full records (make/model/season) for "Uredi"
  const occByCode = new Map(located.map((s) => [s.public_code, s]));       // located rows for the peek window

  // ---- Occupancy header: numbers + meter ----------------------------------
  const stored = located.filter((s) => s.status === 'in_storage').length;
  const reserved = located.length - stored;
  const zoneNames = [...new Set(located.map((s) => String(s.zone).trim()))];
  const pct = located.length ? Math.round((stored / located.length) * 100) : 0;

  setNum(q('#stStored'), stored);
  setNum(q('#stReserved'), reserved);
  setNum(q('#stZones'), zoneNames.length);
  const subNum = q('.wh-title .sub span');
  setNum(subNum, located.length);
  if (subNum && subNum.nextSibling) subNum.nextSibling.textContent = ' ' + (located.length % 10 === 1 && located.length % 100 !== 11 ? 'komplet' : 'kompleta') + ' na karti';
  const meter = q('#stMeter');
  if (meter) { meter.dataset.w = String(pct); if (!splashing()) meter.style.width = pct + '%'; }
  const cap = q('#stCap');
  if (cap) cap.textContent = located.length ? ('Popunjenost skladišta · ' + pct + ' % zauzeto') : 'Popunjenost skladišta';

  const zonebar = q('#zonebar'), map = q('#map');
  if (!zonebar || !map) { liveFirstDone(); return; }

  // ---- Empty state — visual silence at zero data ---------------------------
  if (!located.length) {
    zonebar.innerHTML = '';
    const first = activeSets.length === 0;   // nothing stored at all vs. stored but not yet located
    map.innerHTML =
      '<section class="card wh-empty reveal" style="animation-delay:150ms">' +
        '<span class="tab-tl">skladište</span>' +
        '<h2>' + (first ? 'Skladište je prazno' : 'Nema kompleta na karti') + '</h2>' +
        '<p>' + (first ? 'Zaprimljeni kompleti pojavit će se ovdje.' : 'Dodijeli lokaciju pri zaprimanju.') + '</p>' +
        (first ? '<a href="checkin.html">Zaprimi prvi set</a>' : '') +
      '</section>';
    liveFirstDone();
    return;
  }

  // ---- Group zone → rack → shelf (rows arrive pre-sorted from the query) ---
  const zones = new Map();
  for (const s of located) {
    const zk = String(s.zone).trim();
    if (!zones.has(zk)) zones.set(zk, new Map());
    const racks = zones.get(zk);
    const rk = String(s.rack == null ? '' : s.rack).trim();
    if (!racks.has(rk)) racks.set(rk, new Map());
    const shelves = racks.get(rk);
    const sk = String(s.shelf == null ? '' : s.shelf).trim();
    if (!shelves.has(sk)) shelves.set(sk, []);
    shelves.get(sk).push(s);
  }

  // ---- Render pills + map ---------------------------------------------------
  let pillHtml = '', mapHtml = '', zi = 0;
  for (const [zk, racks] of zones) {
    const zid = 'zone-' + zi;
    let zCount = 0, racksHtml = '';
    for (const [rk, shelves] of racks) {
      let rFill = 0, shelvesHtml = '';
      for (const [sk, list] of shelves) {
        const cells = list.map((s, ci) => {
          rFill++; zCount++;
          const cls = s.status === 'reserved' ? 'reserved' : 'filled';
          const dot = s.status === 'reserved' ? '<span class="rdot" aria-hidden="true"></span>' : '';
          const name = (s.vehicle && s.vehicle.customer && s.vehicle.customer.name) || 'Kupac';
          const plate = (s.vehicle && s.vehicle.plate) || '';
          const lab = [name, plate, s.public_code].filter(Boolean).join(' · ');
          return '<a class="slot ' + cls + '" href="#" role="button" data-code="' + esc(s.public_code) + '" aria-label="' + esc(lab) + '">' + esc(slotText(s.slot, ci)) + dot + '</a>';
        }).join('');
        shelvesHtml += '<div class="wh-shelf"><span class="wh-shelf-lab">' + esc(label('Polica', sk) || 'Bez police') + '</span><div class="slots">' + cells + '</div></div>';
      }
      racksHtml += '<div class="wh-rack"><div class="wh-rack-head"><span class="r">' + esc(label('Regal', rk) || 'Bez regala') + '</span>' +
        '<span class="rfill">' + numCell(rFill) + ' zauzeto</span></div>' + shelvesHtml + '</div>';
    }
    const zoneName = label('Zona', zk);
    mapHtml += '<details class="card wh-zone reveal" id="' + zid + '" open style="animation-delay:' + (150 + zi * 40) + 'ms">' +
      '<span class="tab-tl">zona</span>' +
      '<summary><span class="wh-badge" aria-hidden="true">' + PIN + '</span>' +
      '<span class="wh-name">' + esc(zoneName) + '<small>' + esc(hrCount(racks.size, 'regal', 'regala')) + '</small></span>' +
      '<span class="wh-fill">' + numCell(zCount) + ' ' + (zCount % 10 === 1 && zCount % 100 !== 11 ? 'komplet' : 'kompleta') + '</span>' +
      '<span class="wh-chev" aria-hidden="true">' + CHEV + '</span></summary>' +
      '<div class="wh-zone-body">' + racksHtml + '</div></details>';
    pillHtml += '<span class="chip wh-zonepill" role="button" tabindex="0" data-z="' + zid + '">' +
      esc(zoneName) + '<span class="n">' + zCount + '</span></span>';
    zi++;
  }

  zonebar.innerHTML = '<div class="wh-zonebar" role="group" aria-label="Zone">' + pillHtml + '</div>';
  map.innerHTML = mapHtml;

  // Zone pills jump to (and open) their zone — preserved from the preview build.
  zonebar.querySelectorAll('.wh-zonepill').forEach((pill) => {
    const go = () => {
      const el = document.getElementById(pill.dataset.z);
      if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    };
    pill.addEventListener('click', go);
    pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  // ---- Peek window (click a lot → white card) + "Uredi" ---------------------
  // Click a lot → a small white window with the customer's name, plate and the
  // exact shelf. Click the SAME lot again → close. Click the WINDOW → "Uredi":
  // the set is stashed in sessionStorage 'asc.prefill' and check-in opens
  // pre-filled (checkin.html?prefill=1) — the user-requested edit mechanic.
  const win = document.createElement('div');
  win.className = 'wh-win'; win.setAttribute('role', 'dialog'); win.hidden = true;
  document.body.appendChild(win);
  let active = null;

  function openWin(s) {
    const code = s.getAttribute('data-code') || '';
    const o = occByCode.get(code), full = byCode.get(code);
    const name = (full && full.vehicle && full.vehicle.customer && full.vehicle.customer.name) ||
                 (o && o.vehicle && o.vehicle.customer && o.vehicle.customer.name) || 'Kupac';
    const plate = (full && full.vehicle && full.vehicle.plate) || (o && o.vehicle && o.vehicle.plate) || '';
    const loc = o ? [label('Zona', o.zone), label('Regal', o.rack), label('Polica', o.shelf), label('Mjesto', o.slot)].filter(Boolean).join(' · ') : '';
    win.dataset.code = code;
    win.innerHTML =
      '<div class="wh-win-name">' + esc(name) + '</div>' +
      '<div class="wh-win-sub">' + esc(plate || code) + '</div>' +
      (loc ? '<div class="wh-win-loc">' + esc(loc) + '</div>' : '') +
      '<div class="wh-win-go">Uredi' + GO + '</div>';
    win.hidden = false; win.classList.remove('below');
    win.style.left = '-9999px'; win.style.top = '0px';
    const r = s.getBoundingClientRect(), pw = win.offsetWidth, ph = win.offsetHeight;
    const cx = r.left + r.width / 2;
    const left = Math.max(8, Math.min(cx - pw / 2, innerWidth - 8 - pw));
    let top = r.top - ph - 12;
    if (top < 8) { top = r.bottom + 12; win.classList.add('below'); }
    win.style.setProperty('--caret', (cx - left) + 'px');
    win.style.left = left + 'px'; win.style.top = top + 'px';
    void win.offsetWidth; win.classList.add('show');
    if (active && active !== s) active.classList.remove('slot-active');
    active = s; s.classList.add('slot-active');
  }
  function closeWin() {
    if (!active) return;
    win.classList.remove('show');
    active.classList.remove('slot-active'); active = null;
    setTimeout(() => { if (!active) win.hidden = true; }, 220);
  }

  map.addEventListener('click', (e) => {
    const s = e.target.closest('.slot.filled, .slot.reserved'); if (!s) return;
    e.preventDefault();
    if (active === s) closeWin(); else openWin(s);
  });

  // "Uredi" — the same sessionStorage 'asc.prefill' bridge set-detail.html and
  // the ASC Agent use; checkin.html?prefill=1 fills the form from it.
  win.addEventListener('click', () => {
    const code = win.dataset.code || '';
    const s = byCode.get(code), o = occByCode.get(code);
    const v = (s && s.vehicle) || (o && o.vehicle) || {};
    const locSrc = s || o || {};
    const pf = {
      edit: true,
      code: code,
      customer_name: (v.customer && v.customer.name) || '',
      plate: v.plate || '',
      make: (s && s.vehicle && s.vehicle.make) || '',
      model: (s && s.vehicle && s.vehicle.model) || '',
      season: (s && s.season) || '',
      zone: locSrc.zone || '', rack: locSrc.rack || '',
      shelf: locSrc.shelf || '', slot: locSrc.slot || '',
    };
    try { sessionStorage.setItem('asc.prefill', JSON.stringify(pf)); } catch (err) {}
    location.href = 'checkin.html?prefill=1';
  });

  document.addEventListener('pointerdown', (e) => {
    if (active && !e.target.closest('.slot') && !e.target.closest('.wh-win')) closeWin();
  });
  addEventListener('scroll', closeWin, { passive: true });
  addEventListener('resize', closeWin);

  liveFirstDone();   // real occupancy is in the DOM — the splash may lift into live numbers
})();
