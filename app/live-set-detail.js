// ============================================================================
// live-set-detail.js — fills the komplet detail page with the REAL set from
// Supabase (via ../js/db.js) and wires every action button to a real mutation.
// The auth gate in app.js guarantees a session before anything shows. Every
// write is guarded: a failed fetch keeps the neutral placeholder markup ("—")
// instead of blanking; a bad/missing/deleted code shows the calm not-found
// card. The loaded row is stashed on window.ascLiveSet so the page-local
// sticker / edit-prefill / report handlers read real data.
// ============================================================================
import {
  getSession, loadStorageSet, changeStatus, setPaid, moveStorageSet,
  softDeleteSet, findSetAtLocation, signedPhotoUrls, addPhoto, loadAuditTrail,
} from '../js/db.js';

const SEASON_LABEL = { winter: 'Zimske', summer: 'Ljetne', all_season: 'Cjelogodišnje' };
const SEASON_CLASS = { winter: 'win', summer: '', all_season: 'all' };
const STATUS_LABEL = { in_storage: 'Spremljeno', reserved: 'Rezervirano', checked_out: 'Preuzeto', missing: 'Nedostaje' };
const POS_LABEL = { FL: 'PL', FR: 'PD', RL: 'ZL', RR: 'ZD', spare: 'Rez.' };
const BOLTS_LABEL = { stored: 'Uskladišteno', in_trunk: 'U prtljažniku kupca' };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMoney(n) { return Number(n).toLocaleString('hr-HR', { maximumFractionDigits: 2 }); }

// Replace/append the trailing text node (chips and stat values keep their svg).
function setTail(el, text) {
  if (!el) return;
  const last = el.lastChild;
  if (last && last.nodeType === 3) last.textContent = text;
  else el.appendChild(document.createTextNode(text));
}

// Same held-count-up trick as live-dashboard: while the Prag splash still holds
// the reveal, feed the real value into data-count so the animation counts up to
// it; after the reveal, write the number directly.
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}

// .btn / .sd-note carry author display rules, so [hidden] wouldn't stick — use
// inline display like the page's own [hidden] helpers do.
function show(el, on, disp = '') { if (el) el.style.display = on ? disp : 'none'; }

// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

// ---- calm not-found state (bad/missing code, deleted set) -------------------
function notFound(code) {
  const wrap = q('.wrap');
  if (!wrap) return;
  [...wrap.children].forEach((el) => { if (!el.classList.contains('sd-back')) el.style.display = 'none'; });
  const card = document.createElement('section');
  card.className = 'card reveal';
  card.innerHTML =
    '<span class="tab-tl">komplet</span>' +
    '<div style="font:400 clamp(20px,5.5vw,26px) Sora;letter-spacing:-.02em">Komplet nije pronađen</div>' +
    '<p class="muted" style="margin:8px 0 0;font:500 13.5px Inter">' +
      (code ? esc(code) + ' nije u evidenciji.' : 'Kôd nedostaje ili nije ispravan.') + '</p>' +
    '<a class="btn btn-ghost" href="warehouse.html" style="margin-top:16px;align-self:flex-start">Natrag na skladište</a>';
  wrap.appendChild(card);
  document.title = 'ASC — Komplet nije pronađen';
}

// ---- rendering ---------------------------------------------------------------
function renderIdentity(s) {
  const codeEl = q('.detail-head .code');
  if (codeEl) codeEl.textContent = s.public_code;
  document.title = 'ASC — ' + s.public_code;
  const cust = s.vehicle?.customer || null;
  const who = q('.detail-head .who');
  if (who) {
    if (cust && cust.name) {
      who.innerHTML = '<a href="customers.html?id=' + encodeURIComponent(cust.id) +
        '" style="color:inherit;text-decoration:none">' + esc(cust.name) + ' ›</a>';
    } else who.textContent = '—';
  }
}

function renderChips(s) {
  const chips = qa('.detail-chips .chip');
  if (chips[0]) { chips[0].className = 'chip status'; setTail(chips[0], STATUS_LABEL[s.status] || s.status || '—'); }
  if (chips[1]) {
    chips[1].className = 'chip ' + (SEASON_CLASS[s.season] || '');
    setTail(chips[1], SEASON_LABEL[s.season] || s.season || '—');
  }
  if (chips[2]) {
    chips[2].className = 'chip ' + (s.paid ? 'tone-ok' : 'tone-warn');
    setTail(chips[2], s.paid ? 'Plaćeno' : 'Neplaćeno');
  }
}

function renderActions(s) {
  const done = s.status === 'checked_out';
  show(document.getElementById('statusBtn'), !done);
  show(document.getElementById('reserveBtn'), !done && s.status !== 'reserved');
  show(document.getElementById('payBtn'), !s.paid);
}

function renderLocation(s) {
  const vals = [s.zone, s.rack, s.shelf, s.slot];
  // blocks: [0] main display, [1] "Iz" move preview ([2] is the live "U" preview)
  qa('.loc-block').slice(0, 2).forEach((block) => {
    qa('.loc-cell', block).forEach((cell, i) => {
      const v = vals[i];
      const el = q('.loc-value', cell);
      if (el) el.textContent = v || '—';
      cell.classList.toggle('loc-cell-empty', !v);
    });
  });
  const main = q('.loc-block');
  const labeled = ['Zona', 'Regal', 'Polica', 'Mjesto'].map((L, i) => (vals[i] ? L + ' ' + vals[i] : null)).filter(Boolean);
  if (main) main.setAttribute('aria-label', labeled.length ? 'Lokacija: ' + labeled.join(' · ') : 'Lokacija nije dodijeljena');
  const stat = qa('.u-stats .u-stat-v')[0];
  if (stat) setTail(stat, vals.filter(Boolean).join(' · ') || '—');
  // pre-fill the move inputs with the current spot (dispatch input → "U" preview syncs)
  ['m_zone', 'm_rack', 'm_shelf', 'm_slot'].forEach((id, i) => {
    const f = document.getElementById(id);
    if (f) { f.value = vals[i] || ''; f.dispatchEvent(new Event('input')); }
  });
}

function renderPayment(s) {
  const stat = qa('.u-stats .u-stat')[1];
  if (stat) {
    stat.classList.toggle('is-warn', !s.paid);
    stat.classList.toggle('is-ok', !!s.paid);
    const v = q('.u-stat-v', stat);
    const num = v ? v.querySelectorAll('span')[1] : null;   // [0] is the dot
    if (Number.isFinite(+s.fee) && s.fee != null) { setNum(num, Math.round(+s.fee)); setTail(v, ' €'); }
    else if (num) { num.removeAttribute('data-count'); num.textContent = '—'; setTail(v, ''); }
  }
  const feeEl = q('.fee');
  if (feeEl) feeEl.textContent = s.fee != null && Number.isFinite(+s.fee) ? fmtMoney(s.fee) + ' €' : '—';
}

function treadClass(t) { return t >= 6 ? 'tread-ok' : t >= 4 ? 'tread-warn' : 'tread-danger'; }

function renderTires(s) {
  const tires = s.tires || [];
  const table = q('.tire-table');
  if (table) {
    qa('.tr:not(.th)', table).forEach((el) => el.remove());
    const empty = q('.tire-empty', table);
    if (tires.length) {
      if (empty) empty.remove();
      tires.forEach((t) => {
        const tread = t.tread_mm != null && t.tread_mm !== '' ? +t.tread_mm : null;
        const row = document.createElement('div');
        row.className = 'tr';
        row.innerHTML =
          '<span class="tnum">' + esc(POS_LABEL[t.position] || t.position || '·') + '</span>' +
          '<span class="tnum">' + esc(t.size || '—') + '</span>' +
          '<span>' + esc([t.brand, t.model].filter(Boolean).join(' ') || '—') + '</span>' +
          '<span class="tnum ' + (tread != null ? treadClass(tread) : '') + '">' + (tread != null ? esc(fmtMoney(tread)) + ' mm' : '—') + '</span>' +
          '<span class="tnum">' + esc(t.dot_code || '—') + '</span>';
        table.appendChild(row);
      });
    }
  }
  // insight strip: worst (lowest) tread
  const stat = qa('.u-stats .u-stat')[2];
  if (stat) {
    const treads = tires.map((t) => +t.tread_mm).filter(Number.isFinite);
    const v = q('.u-stat-v', stat);
    if (treads.length) {
      const min = Math.min(...treads);
      stat.classList.toggle('is-ok', min >= 4);
      stat.classList.toggle('is-warn', min < 4);
      setNum(q('span', v), Math.round(min)); setTail(v, ' mm');
    } else {
      stat.classList.remove('is-ok', 'is-warn');
      const num = q('span', v);
      if (num) { num.removeAttribute('data-count'); num.textContent = '—'; }
      setTail(v, '');
    }
  }
}

function renderDetails(s) {
  const v = s.vehicle || {}, cust = v.customer || {};
  const set = (sel, text) => { const el = q(sel); if (el) el.textContent = text || '—'; };
  set('[data-f="vehicle"]', [v.year, v.make, v.model].filter(Boolean).join(' '));
  set('[data-f="plate"]', v.plate);
  set('[data-f="vin"]', v.vin);
  const phone = q('[data-f="phone"]');
  if (phone) {
    if (cust.phone) { phone.textContent = cust.phone; phone.setAttribute('href', 'tel:' + String(cust.phone).replace(/[^\d+]/g, '')); }
    else { phone.textContent = '—'; phone.removeAttribute('href'); }
  }
  set('[data-f="gume"]', s.quantity != null
    ? s.quantity + ' · ' + (s.on_rims ? 'na naplacima' : 'bez naplataka')
    : '');
  const bolts = q('[data-f="bolts"]');
  if (bolts) { bolts.setAttribute('data-v', s.bolts_location || ''); bolts.textContent = BOLTS_LABEL[s.bolts_location] || '—'; }
  const hub = q('[data-f="hubcaps"]');
  if (hub) {
    const loc = s.hubcaps_location || (s.hubcaps_stored ? 'stored' : '');
    const HUBS = { stored: 'Uskladišteno', in_trunk: 'U prtljažniku kupca', none: 'Ne postoje' };
    hub.setAttribute('data-v', loc); hub.textContent = HUBS[loc] || '—';
  }
  set('[data-f="checkIn"]', fmtDate(s.check_in_date));
  setTail(q('[data-f="expectedOut"]'), fmtDate(s.expected_out_date));
  const note = q('.sd-note');
  if (note) {
    const span = q('[data-f="notes"]', note);
    if (span) span.textContent = s.notes || '';
    show(note, !!s.notes, 'flex');
  }
}

function render(s) {
  renderIdentity(s); renderChips(s); renderActions(s);
  renderLocation(s); renderPayment(s); renderTires(s); renderDetails(s);
}

// ---- photos + history (after the first paint; failures keep the empty states) --
async function renderPhotos(s) {
  const grid = q('.photos-grid');
  const empty = q('[data-photos-empty]');
  const photos = s.photos || [];
  if (!grid || !photos.length) return;
  try {
    const urls = await signedPhotoUrls(photos.map((p) => p.path));
    const spans = photos
      .filter((p) => urls[p.path])
      .map((p) => '<span class="ph" style="background-image:url(\'' + urls[p.path].replace(/'/g, '%27') + '\')"></span>')
      .join('');
    if (spans) { grid.innerHTML = spans; show(empty, false); }
  } catch (e) { console.warn('[live] photos failed — keeping empty state:', e); }
}

async function renderHistory(s) {
  try {
    const events = await loadAuditTrail(s.id);
    if (!events.length) return;                       // "Još nema zapisa" stays
    const tl = q('.timeline');
    if (!tl) return;
    const today = new Date().toDateString();
    tl.innerHTML = events.slice(0, 20).map((ev) => {
      const d = new Date(ev.at);
      const when = isNaN(d) ? '' : (d.toDateString() === today
        ? d.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' }));
      return '<div class="tl-item"><div class="tl-top"><span class="tl-action">' + esc(ev.summary || ev.action || 'Promjena') +
        '</span><span class="tl-time">' + esc(when) + '</span></div><div class="tl-who">' + esc(ev.actor_email || '') + '</div></div>';
    }).join('');
  } catch (e) { console.warn('[live] history failed — keeping empty state:', e); }
}

// ---- real mutations ------------------------------------------------------------
function guard(btn, fn, failMsg) {
  return async (e) => {
    if (e) e.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    try { await fn(); }
    catch (err) {
      console.warn('[live] action failed:', err);
      alert(failMsg || 'Nije uspjelo. Pokušajte ponovno.');
    }
    finally { btn.disabled = false; }
  };
}

function wire(s) {
  const statusBtn = document.getElementById('statusBtn');
  if (statusBtn) statusBtn.addEventListener('click', guard(statusBtn, async () => {
    await changeStatus(s.id, 'checked_out');
    s.status = 'checked_out'; s.picked_up_at = new Date().toISOString();
    renderChips(s); renderActions(s);
  }, 'Promjena statusa nije uspjela. Pokušajte ponovno.'));

  const reserveBtn = document.getElementById('reserveBtn');
  if (reserveBtn) reserveBtn.addEventListener('click', guard(reserveBtn, async () => {
    await changeStatus(s.id, 'reserved');
    s.status = 'reserved';
    renderChips(s); renderActions(s);
  }, 'Rezervacija nije uspjela. Pokušajte ponovno.'));

  const payBtn = document.getElementById('payBtn');
  if (payBtn) payBtn.addEventListener('click', guard(payBtn, async () => {
    await setPaid(s.id, true);
    s.paid = true;
    renderChips(s); renderActions(s); renderPayment(s);
  }, 'Označavanje plaćanja nije uspjelo. Pokušajte ponovno.'));

  const moveBtnEl = document.getElementById('confirmMove');
  if (moveBtnEl) moveBtnEl.addEventListener('click', guard(moveBtnEl, async () => {
    const val = (id) => { const f = document.getElementById(id); return f ? f.value.trim() : ''; };
    const to = { zone: val('m_zone'), rack: val('m_rack'), shelf: val('m_shelf'), slot: val('m_slot') };
    const occupant = await findSetAtLocation(to, s.id).catch(() => null);
    if (occupant) { alert('Na toj lokaciji već je ' + occupant.public_code + '.'); return; }
    await moveStorageSet(s, to);
    s.zone = to.zone || null; s.rack = to.rack || null; s.shelf = to.shelf || null; s.slot = to.slot || null;
    renderLocation(s);
    const area = document.getElementById('moveArea');
    if (area) area.hidden = true;
    const toggler = document.getElementById('moveBtn');
    if (toggler) toggler.setAttribute('aria-expanded', 'false');
  }, 'Premještanje nije uspjelo. Pokušajte ponovno.'));

  const delItem = q('.sd-menu-item.danger');
  if (delItem) delItem.addEventListener('click', guard(delItem, async () => {
    if (!confirm('Obrisati komplet ' + s.public_code + '? Završit će u košu za smeće.')) return;
    await softDeleteSet(s.id);
    location.href = 'warehouse.html';
  }, 'Brisanje nije uspjelo. Pokušajte ponovno.'));

  const addBtn = document.getElementById('addPhotoBtn');
  if (addBtn) {
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
    document.body.appendChild(file);
    addBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', guard(addBtn, async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      const path = await addPhoto(s.id, f);
      (s.photos = s.photos || []).push({ path });
      await renderPhotos(s);
    }, 'Fotografija nije spremljena.'));
  }
}

// ---- boot -----------------------------------------------------------------------
(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }          // app.js gate handles the redirect

  const raw = new URLSearchParams(location.search).get('code');
  const code = window.ASCQR ? window.ASCQR.normalize(raw, true) : ((raw || '').trim().toUpperCase() || null);
  if (!code) { notFound(null); liveFirstDone(); return; }

  let set;
  try { set = await loadStorageSet(code); }
  catch (e) {
    if (/no connection/i.test(e?.message || '')) {
      console.warn('[live] set-detail fetch failed — keeping placeholder markup:', e);
    } else {
      console.warn('[live] set not found:', e);
      notFound(code);
    }
    liveFirstDone(); return;
  }
  if (!set || set.deleted_at) { notFound(code); liveFirstDone(); return; }

  window.ascLiveSet = set;                             // the sticker/edit/report handlers read this
  try { render(set); wire(set); }
  catch (e) { console.warn('[live] render failed — keeping existing markup:', e); }
  liveFirstDone();

  renderPhotos(set);                                   // after first paint; guarded inside
  renderHistory(set);
})();
