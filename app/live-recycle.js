// ============================================================================
// live-recycle.js — fills the recycle bin (koš) with REAL soft-deleted sets
// from Supabase (via ../js/db.js). The auth gate in app.js already guarantees
// a session before this runs. The markup ships with the calm empty state ON,
// so a failed fetch (or an empty database) never shows anything broken —
// rows only appear once real data lands. Every DB write completes BEFORE the
// row leaves the DOM; a failure keeps the row and warns in the console.
// ============================================================================
import { getSession, listRecycleBin, restoreSet, purgeSetPermanently } from '../js/db.js';

const SEASON_LABEL = { winter: 'Zimske', summer: 'Ljetne', all_season: 'Cjelogodišnje' };
const SEASON_CLASS = { winter: 'win', summer: '', all_season: 'all' };
const STATUS_LABEL = { in_storage: 'Spremljeno', reserved: 'Rezervirano', checked_out: 'Preuzeto', missing: 'Nedostaje' };
// Decorative tire thumbs only (CSS desaturates them) — never customer data.
const THUMBS = ['set-1.jpg', 'set-2.jpg', 'set-3.jpg', 'set-4.jpg', 'set-5.jpg', 'set-6.jpg'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const list = document.getElementById('binList');
const empty = document.getElementById('binEmpty');
const badge = document.getElementById('binCount');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toastMsg');
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
let toastTimer;

function showToast(msg) {
  if (!toast || !toastMsg) return;
  toastMsg.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// Same trick as live-dashboard: while the Prag splash still holds the reveal,
// feed the real value into data-count so the held count-up lands on it.
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}

function fmtDeleted(iso) {
  const d = new Date(iso);
  return isNaN(d) ? 'Obrisano' : 'Obrisano ' + d.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ICON_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v5h5"/><path d="M4.6 14.5A7.5 7.5 0 105 8"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V5.4A1.4 1.4 0 0110.9 4h2.2A1.4 1.4 0 0114.5 5.4V7M6 7l.9 12.1A1.9 1.9 0 008.8 21h6.4a1.9 1.9 0 001.9-1.9L18 7"/></svg>';

function rowHtml(s, i) {
  const code = esc(s.public_code);
  const who = [s.vehicle?.customer?.name, s.vehicle?.plate].filter(Boolean).map(esc).join(' · ');
  const season = SEASON_LABEL[s.season];
  return '<div class="rec-row" data-id="' + esc(s.id) + '" data-code="' + code + '">'
    + '<span class="rec-thumb" style="background-image:url(\'assets/' + THUMBS[i % THUMBS.length] + '\')"></span>'
    + '<div class="rec-body">'
    +   '<div class="rec-top"><span class="rec-code">' + code + '</span>'
    +     '<span class="rec-status">' + esc(STATUS_LABEL[s.status] || s.status || '') + '</span>'
    +     (season ? '<span class="chip ' + (SEASON_CLASS[s.season] || '') + '">' + esc(season) + '</span>' : '')
    +   '</div>'
    +   (who ? '<div class="rec-who">' + who + '</div>' : '')
    +   '<div class="rec-when">' + esc(fmtDeleted(s.deleted_at)) + '</div>'
    + '</div>'
    + '<div class="rec-actions">'
    +   '<button class="rbtn" data-restore aria-label="Vrati komplet ' + code + '">' + ICON_RESTORE + 'Vrati</button>'
    +   '<button class="rbtn danger" data-purge aria-label="Trajno obriši komplet ' + code + '">' + ICON_TRASH + '<span class="lab">Obriši</span></button>'
    + '</div>'
    + '</div>';
}

function refresh() {
  const n = list.querySelectorAll('.rec-row').length;
  setNum(badge, n);
  if (badge) badge.style.display = n ? '' : 'none';
  if (empty) empty.classList.toggle('on', n === 0);
}

function removeRow(row, msg) {
  row.classList.add('leaving');
  const done = () => { row.remove(); refresh(); };
  if (reduce) { done(); } else { setTimeout(done, 300); }
  showToast(msg);
}

// ---- Actions: DB first, DOM second — a failed call keeps the row ------------
list?.addEventListener('click', async (e) => {
  const restore = e.target.closest('[data-restore]');
  const purge = e.target.closest('[data-purge]');
  if (!restore && !purge) return;
  const row = (restore || purge).closest('.rec-row');
  if (!row || row.dataset.busy) return;

  if (restore) {
    row.dataset.busy = '1'; restore.disabled = true;
    try {
      await restoreSet(row.dataset.id);
      removeRow(row, 'Komplet vraćen');
    } catch (err) {
      console.warn('[live] restore failed:', err);
      delete row.dataset.busy; restore.disabled = false;
      showToast('Vraćanje nije uspjelo');
    }
    return;
  }

  // Two-step confirm: first tap arms the danger button, second tap fires.
  if (!purge.classList.contains('arm')) {
    purge.classList.add('arm');
    purge.querySelector('.lab').textContent = 'Potvrdi?';
    setTimeout(() => {
      if (purge.isConnected) { purge.classList.remove('arm'); purge.querySelector('.lab').textContent = 'Obriši'; }
    }, 2600);
    return;
  }
  row.dataset.busy = '1'; purge.disabled = true;
  try {
    await purgeSetPermanently(row.dataset.id);
    removeRow(row, 'Trajno obrisano');
  } catch (err) {
    console.warn('[live] purge failed:', err);
    delete row.dataset.busy; purge.disabled = false;
    purge.classList.remove('arm'); purge.querySelector('.lab').textContent = 'Obriši';
    showToast('Brisanje nije uspjelo');
  }
});

// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }  // the gate in app.js handles the redirect

  let sets;
  try {
    sets = await listRecycleBin();
  } catch (e) {
    console.warn('[live] recycle bin failed — keeping the empty state:', e);
    liveFirstDone();
    return;
  }

  if (list && sets.length) {
    list.innerHTML = sets.map(rowHtml).join('');
    if (empty) empty.classList.remove('on');
    setNum(badge, sets.length);
    if (badge) badge.style.display = '';
  }
  liveFirstDone();
})();
