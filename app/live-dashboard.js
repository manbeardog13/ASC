// ============================================================================
// live-dashboard.js — fills the redesigned dashboard with REAL shop data from
// Supabase (via ../js/db.js). The auth gate in app.js already guarantees a
// session before this runs. Every write is guarded: if a fetch fails, the page
// keeps its existing markup instead of blanking.
// ============================================================================
import { getSession, loadMyProfile, healthStats, countsByStatus, listStorageSets } from '../js/db.js';

const SEASON_LABEL = { winter: 'Zimske', summer: 'Ljetne', all_season: 'Cjelogodišnje' };
const SEASON_CLASS = { winter: 'win', summer: '', all_season: 'all' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Dobra noć' : h < 12 ? 'Dobro jutro' : h < 18 ? 'Dobar dan' : 'Dobra večer';
}
function initials(name) {
  return (String(name || '').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('') || 'ASC').toUpperCase();
}
function code4(code) { const m = String(code || '').match(/(\d{3,4})\s*$/); return m ? m[1] : (code || ''); }
function daysBadge(dateStr) {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 864e5);
  if (diff < 0) return 'Kasni';
  if (diff === 0) return 'Danas';
  if (diff === 1) return 'Sutra';
  return d.toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
}

// Set a number. Normally cancels the count-up so it doesn't fight our real
// value — but while the Prag splash still holds the reveal (html.splashing),
// the count-ups haven't run yet, so we feed the REAL value into data-count and
// let the held animation count up to it the moment the surface lifts.
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}

// The gate in app.js races this against a 1200ms cap before lifting the splash,
// so the dashboard usually reveals with live numbers already in place.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }  // the gate in app.js handles the redirect

  // ---- Hero greeting (the dashboard anchor) + profile card --------------------
  // Time-based Croatian greeting in the stage hero; the SMJENA card carries the
  // plain name (one greeting on screen — visual silence).
  const gw = q('#greetWord'), gn = q('#greetName'), gd = q('#greetDate'), gc = q('#greetClock');
  if (gw) gw.textContent = greeting();
  if (gd) { const d = new Date().toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long' }); gd.textContent = d.charAt(0).toUpperCase() + d.slice(1); }
  if (gc) { const tick = () => { gc.textContent = new Date().toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' }); }; tick(); setInterval(tick, 15000); }
  // delicate parallax: pointer position drives --px/--py on the stage (desktop, motion-safe)
  const stage = q('.stage');
  if (stage && matchMedia('(hover:hover) and (prefers-reduced-motion: no-preference)').matches) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      stage.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      stage.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    });
    stage.addEventListener('pointerleave', () => { stage.style.setProperty('--px', 0); stage.style.setProperty('--py', 0); });
  }
  loadMyProfile().then((p) => {
    const name = p && p.full_name ? String(p.full_name).trim() : '';
    const first = name.split(/\s+/)[0] || '';
    if (gn) gn.textContent = first || 'dobrodošli';
    const h1 = q('.profile .row1 h1');
    if (h1) h1.textContent = name || 'Smjena';
    const av = q('.profile .pavatar');
    if (av && name) av.textContent = initials(name);
  }).catch(() => { if (gn) gn.textContent = 'dobrodošli'; });
  const sub = q('.profile .row1 .sub');
  if (sub) {
    const d = new Date().toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long' });
    sub.textContent = d.charAt(0).toUpperCase() + d.slice(1).replace(/,?\s*$/, '');
  }

  let health, counts, sets;
  try {
    [health, counts, sets] = await Promise.all([healthStats(), countsByStatus(), listStorageSets()]);
  } catch (e) {
    console.warn('[live] dashboard data failed — keeping placeholder markup:', e);
    liveFirstDone();
    return;
  }

  // ---- Hero: real inventory + caption + activity spills ----
  setNum(q('.hero-num [data-count]'), health.inventory);
  const cap = q('.stage .cap');
  if (cap) cap.textContent = 'na čuvanju · ' + counts.reserved + ' rezervirano · ' + counts.checked_out + ' preuzeto';

  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 864e5);
  const upcoming = sets.filter((s) => s.status === 'in_storage' && s.expected_out_date && new Date(s.expected_out_date) <= in7);
  const spills = qa('.spills .spill b');
  setNum(spills[0], health.todayCheckIns);
  setNum(spills[1], health.todayPickups);
  setNum(spills[2], upcoming.length);

  // ---- Recent stream: newest sets fill the real slides (keep the tire photos as decoration) ----
  const recent = [...sets].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6);
  const realSlides = qa('.stream-track .slide:not([aria-hidden])');
  realSlides.forEach((slide, i) => {
    const s = recent[i];
    if (!s) { slide.style.display = 'none'; return; }
    slide.setAttribute('href', 'set-detail.html?code=' + encodeURIComponent(s.public_code));
    const tab = q('.tab-tl', slide); if (tab) tab.textContent = code4(s.public_code);
    const who = q('.meta .who', slide); if (who) who.textContent = s.vehicle?.customer?.name || 'Kupac';
    const chip = q('.meta .chip', slide);
    if (chip) { chip.textContent = SEASON_LABEL[s.season] || s.season || ''; chip.className = 'chip ' + (SEASON_CLASS[s.season] || ''); }
  });
  // Mirror the real slides into the duplicate track (marquee needs 2 identical halves).
  const dupSlides = qa('.stream-track .slide[aria-hidden]');
  dupSlides.forEach((slide, i) => {
    const src = realSlides[i];
    if (!src || src.style.display === 'none') { slide.style.display = 'none'; return; }
    slide.setAttribute('href', src.getAttribute('href'));
    const tab = q('.tab-tl', slide), stab = q('.tab-tl', src); if (tab && stab) tab.textContent = stab.textContent;
    const who = q('.meta .who', slide), swho = q('.meta .who', src); if (who && swho) who.textContent = swho.textContent;
    const chip = q('.meta .chip', slide), schip = q('.meta .chip', src); if (chip && schip) { chip.textContent = schip.textContent; chip.className = schip.className; }
  });
  // Empty warehouse: the marquee has nothing to show — one calm line instead.
  if (!recent.length) {
    const track = q('.stream-track');
    if (track && track.parentElement) {
      track.style.display = 'none';
      const empty = document.createElement('p');
      empty.textContent = 'Još nema kompleta — zaprimi prvi.';
      empty.style.cssText = 'margin:18px 4px;font:500 13px Inter;color:var(--muted)';
      track.parentElement.appendChild(empty);
    }
  }

  // ---- "Po sezoni" occupancy: real season split of everything in the house ----
  const active = sets.filter((s) => s.status !== 'checked_out');
  const bySeason = { winter: 0, summer: 0, all_season: 0 };
  active.forEach((s) => { if (s.season in bySeason) bySeason[s.season] += 1; });
  const seasonMax = Math.max(1, bySeason.winter, bySeason.summer, bySeason.all_season);
  qa('.obar').forEach((bar, i) => {
    const key = ['winter', 'summer', 'all_season'][i];
    if (!(key in bySeason)) return;
    setNum(q('.t b', bar), bySeason[key]);
    const fill = q('.bar i', bar);
    if (fill) {
      const w = String(Math.round(bySeason[key] / seasonMax * 100));
      fill.dataset.w = w;
      // Warm visits: animate() already applied the old mock width before we
      // got here — overwrite it directly (under the splash, data-w is enough).
      if (!document.documentElement.classList.contains('splashing')) fill.style.width = w + '%';
    }
  });

  // ---- Reminders: soonest upcoming pickups (overdue first) ----
  const dueSoon = sets
    .filter((s) => s.status !== 'checked_out' && s.expected_out_date)
    .sort((a, b) => new Date(a.expected_out_date) - new Date(b.expected_out_date))
    .slice(0, 3);
  const remCard = q('.card.dark');
  if (remCard) {
    const badge = q('.count-badge', remCard);
    if (badge) badge.textContent = String(upcoming.length || dueSoon.length);
    const minis = qa('.mini', remCard);
    minis.forEach((mini, i) => {
      const s = dueSoon[i];
      if (!s) { mini.style.display = 'none'; return; }
      const overdue = new Date(s.expected_out_date) < new Date(new Date().toDateString());
      mini.className = 'mini' + (overdue ? ' overdue' : '');
      mini.setAttribute('href', 'set-detail.html?code=' + encodeURIComponent(s.public_code));
      const t = q('time', mini); if (t) t.textContent = daysBadge(s.expected_out_date);
      const b = q('b', mini); if (b) b.textContent = s.vehicle?.customer?.name || 'Kupac';
      const pl = q('.pl', mini); if (pl) pl.textContent = s.vehicle?.plate || s.public_code;
    });
    // Nothing due: one calm line where the rows were.
    if (!dueSoon.length && minis.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nema podsjetnika.';
      empty.style.cssText = 'margin:10px 2px 2px;font:500 13px Inter;color:var(--muted)';
      minis[0].parentElement.appendChild(empty);
    }
  }

  liveFirstDone();   // real data is in the DOM — the splash may lift into live numbers
})();
