// ============================================================================
// live-users.js — fills the team/access screen with REAL accounts from
// Supabase (via ../js/db.js). Pattern follows live-dashboard.js: the gate in
// app.js already guarantees a session; every fetch is guarded so a failure
// keeps the page calm (console.warn) instead of blanking, and no mock person
// ever renders. Admin-gated: non-admins get the "Samo administratori" state.
// ============================================================================
import {
  getSession, loadMyProfile, listUsers, listPendingUsers,
  inviteUser, setUserRole, removeUser, updateUserName,
  isAdminRole, isOwnerEmail,
} from '../js/db.js';

const ROLES = ['admin', 'manager', 'employee', 'reception', 'readonly'];
const ROLE_LABEL = {
  admin: 'Administrator', manager: 'Voditelj', employee: 'Korisnik',
  reception: 'Recepcija', readonly: 'Samo pregled',
};
const ROLE_WEIGHT = { admin: 1, manager: 2, employee: 3, reception: 4, readonly: 5 };

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>';
const EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5l4 4M4 20l1-4L16 5l3 3L8 19l-4 1z"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0111 4h2a1.5 1.5 0 011.5 1.5V7M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4L18 7"/></svg>';

// Toast reuses the page's .toast styles (textContent only — safe for any input).
let toastNode;
function toast(msg) {
  if (toastNode) toastNode.remove();
  toastNode = document.createElement('div');
  toastNode.className = 'toast';
  toastNode.textContent = msg;
  document.body.appendChild(toastNode);
  requestAnimationFrame(() => toastNode.classList.add('show'));
  const mine = toastNode;
  setTimeout(() => { mine.classList.remove('show'); setTimeout(() => mine.remove(), 320); }, 2400);
}

// Same splash interplay as live-dashboard: while html.splashing holds the
// reveal, feed the real value into data-count so the held count-up animates
// to it; otherwise write the number directly.
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}
function setBadge(sel, val) { const el = q(sel); if (el) el.textContent = String(val); }

function initials(s) {
  const str = String(s || '').trim();
  if (!str) return 'NN';
  if (str.includes('@')) return str.slice(0, 2).toUpperCase();
  return (str.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('') || 'NN').toUpperCase();
}
const displayName = (row) => row.full_name || row.email || row.email_masked || 'Bez imena';
const displayEmail = (row) => row.email || row.email_masked || '';
const isOwnerRow = (row) => row.is_owner === true || isOwnerEmail(row.email);

// ---- Row templates ---------------------------------------------------------
function chipHtml(role) {
  const admin = isAdminRole(role);
  return `<span class="chip ${admin ? '' : 'win'}">${admin ? CHECK_SVG : ''}${esc(ROLE_LABEL[role] || role || '')}</span>`;
}

function roleSelectHtml(row, disabled) {
  const current = ROLES.includes(row.role) ? row.role : 'employee';
  const opts = ROLES.map((r) =>
    `<option value="${r}"${r === current ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('');
  const dis = disabled ? ' disabled title="Vlastitu ulogu ne možete mijenjati."' : '';
  return `<select class="role-select" data-id="${esc(String(row.id))}" aria-label="Uloga"${dis}>${opts}</select>`;
}

function memberRowHtml(row, meId) {
  const owner = isOwnerRow(row);
  const self = meId != null && String(row.id) === String(meId);
  const admin = isAdminRole(row.role);
  const id = esc(String(row.id));
  const tags =
    (owner ? '<span class="tag tag-owner">Vlasnik</span>' : '') +
    (self ? '<span class="tag tag-you">Vi</span>' : '') +
    (row.pending ? '<span class="tag tag-pending">Pozivnica — čeka prijavu</span>' : '');
  // The owner account is protected server-side — surface that immutability by
  // replacing its controls with the locked note (same treatment as the mock).
  const body = owner
    ? `<div class="u-locked">${CHECK_SVG}Vlasnički račun ne može se ukloniti ni mijenjati.</div>`
    : '';
  const actions = owner ? '' : `
    <div class="u-actions">
      ${roleSelectHtml(row, self)}
      <span class="spacer"></span>
      <button class="btn btn-sm" data-edit data-id="${id}">${EDIT_SVG} Uredi</button>
      ${self ? '' : `<button class="btn btn-danger btn-sm" data-remove data-id="${id}">${TRASH_SVG} Ukloni</button>`}
    </div>`;
  return `<div class="u-row${self || owner ? ' self' : ''}" data-user>
    <span class="uav${admin || owner ? '' : ' user'}">${esc(initials(row.full_name || displayEmail(row)))}</span>
    <div class="u-body">
      <div class="u-toprow">
        <span class="u-name">${esc(displayName(row))}</span>
        ${chipHtml(owner ? 'admin' : row.role)}
        ${tags}
      </div>
      <div class="u-mail">${esc(displayEmail(row))}</div>
      ${body}
    </div>
    ${actions}
  </div>`;
}

function apprRowHtml(row) {
  const id = esc(String(row.id));
  return `<div class="appr-row" data-appr>
    <span class="uav user">${esc(initials(row.full_name || displayEmail(row)))}</span>
    <div class="u-body">
      <div class="u-name">${esc(displayName(row))}</div>
      <div class="u-mail">${esc(displayEmail(row))}</div>
    </div>
    <div class="appr-actions">
      <button class="btn btn-primary btn-sm" data-approve="employee" data-id="${id}">Odobri kao korisnika</button>
      <button class="btn btn-sm" data-approve="admin" data-id="${id}">Odobri kao administratora</button>
      <button class="btn btn-ghost btn-sm" data-reject data-id="${id}">Odbij</button>
    </div>
  </div>`;
}

const stateRowHtml = (title, sub) =>
  `<div class="u-row"><div class="u-body"><div class="u-name">${esc(title)}</div>${sub ? `<div class="u-mail">${esc(sub)}</div>` : ''}</div></div>`;

// ---- Render ----------------------------------------------------------------
const state = { me: null, rows: new Map() };

function hideCard(el) { if (el) el.style.display = 'none'; }
function showCard(el) { if (el) el.style.display = ''; }

function renderAdminOnly() {
  hideCard(q('#addForm') && q('#addForm').closest('.card'));
  hideCard(q('#awaitCard'));
  const list = q('.ulist');
  if (list) list.innerHTML = stateRowHtml('Samo administratori', 'Upravljanje korisnicima dostupno je administratorima.');
}

function renderError() {
  const list = q('.ulist');
  if (list) list.innerHTML = stateRowHtml('Nije moguće učitati', 'Provjerite vezu i pokušajte ponovno.');
}

function render(users, pending) {
  const meId = state.me && state.me.id;
  const withOwner = users.map((u) => ({ ...u, is_owner: isOwnerRow(u) }));
  const approvals = withOwner.filter((u) => u.role === 'readonly' && !u.is_owner);
  const members = withOwner.filter((u) => !(u.role === 'readonly' && !u.is_owner));

  const byName = (a, b) => displayName(a).localeCompare(displayName(b), 'hr');
  members.sort((a, b) =>
    (a.is_owner ? 0 : ROLE_WEIGHT[a.role] || 9) - (b.is_owner ? 0 : ROLE_WEIGHT[b.role] || 9) || byName(a, b));
  pending.sort(byName);
  approvals.sort(byName);

  state.rows.clear();
  [...members, ...pending, ...approvals].forEach((r) => state.rows.set(String(r.id), r));

  // Members of the team (accounts first, invited-but-not-signed-up after).
  const list = q('.ulist');
  if (list) {
    const rows = [...members, ...pending];
    list.innerHTML = rows.length
      ? rows.map((r) => memberRowHtml(r, meId)).join('')
      : stateRowHtml('Još nema članova', 'Dodajte prvog korisnika obrascem.');
    setBadge('#teamCount', rows.length);
  }

  // Awaiting approval (signed up, still role=readonly). Hidden when empty —
  // no "Čeka odobrenje 0" hanging over an empty body.
  const awaitCard = q('#awaitCard');
  if (awaitCard) {
    const box = q('.appr', awaitCard);
    if (approvals.length && box) {
      box.innerHTML = approvals.map(apprRowHtml).join('');
      setBadge('#awaitCount', approvals.length);
      showCard(awaitCard);
    } else {
      hideCard(awaitCard);
    }
  }

  // Team overview card: totals + spills.
  const darkBadge = q('.card.dark .count-badge');
  if (darkBadge) darkBadge.textContent = String(withOwner.length + pending.length);
  const spills = qa('.card.dark .spills .spill b');
  setNum(spills[0], withOwner.length);
  setNum(spills[1], withOwner.filter((u) => isAdminRole(u.role)).length);
  setNum(spills[2], pending.length + approvals.length);
}

async function refresh() {
  const admin = !!(state.me && isAdminRole(state.me.role));
  if (!admin) { renderAdminOnly(); return; }
  let users;
  try {
    users = await listUsers();
  } catch (e) {
    console.warn('[live] users load failed — keeping calm state:', e);
    renderError();
    return;
  }
  const pending = await listPendingUsers().catch(() => []);
  render(users, pending);
}

// ---- Actions (delegated — rows are re-rendered on every refresh) -------------
function busyRow(el) {
  const row = el.closest('.u-row, .appr-row');
  if (row) qa('button, select', row).forEach((b) => { b.disabled = true; });
}

function wireEvents() {
  document.addEventListener('change', async (e) => {
    const sel = e.target.closest('.role-select');
    if (!sel) return;
    const row = state.rows.get(sel.dataset.id);
    if (!row) return;
    const prev = ROLES.includes(row.role) ? row.role : 'employee';
    const next = sel.value;
    if (prev === next) return;
    sel.disabled = true;
    try {
      await setUserRole(row, next);
      toast('Uloga ažurirana.');
      await refresh();
    } catch (err) {
      console.warn('[live] role change failed:', err);
      sel.value = prev; sel.disabled = false;
      toast('Promjena uloge nije uspjela.');
    }
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-approve], [data-reject], [data-remove], [data-edit]');
    if (!btn || btn.disabled) return;
    const row = state.rows.get(btn.dataset.id);
    if (!row) return;
    const label = displayName(row);

    if (btn.hasAttribute('data-approve')) {
      busyRow(btn);
      try {
        await setUserRole(row, btn.getAttribute('data-approve'));
        toast(label + ' — pristup odobren.');
      } catch (err) {
        console.warn('[live] approve failed:', err);
        toast('Odobrenje nije uspjelo.');
      }
      await refresh();
      return;
    }

    if (btn.hasAttribute('data-reject')) {
      if (!confirm('Odbiti i ukloniti račun ' + label + '?')) return;
      busyRow(btn);
      try {
        await removeUser(row);
        toast('Zahtjev odbijen.');
      } catch (err) {
        console.warn('[live] reject failed:', err);
        toast('Odbijanje nije uspjelo.');
      }
      await refresh();
      return;
    }

    if (btn.hasAttribute('data-remove')) {
      const msg = row.pending
        ? 'Povući pozivnicu za ' + label + '?'
        : 'Ukloniti korisnika ' + label + '? Pristup se odmah gasi.';
      if (!confirm(msg)) return;
      busyRow(btn);
      try {
        await removeUser(row);
        toast(row.pending ? 'Pozivnica povučena.' : label + ' uklonjen/a.');
      } catch (err) {
        console.warn('[live] remove failed:', err);
        toast(/owner/i.test(err && err.message || '') ? 'Vlasnički račun ne može se ukloniti.' : 'Uklanjanje nije uspjelo.');
      }
      await refresh();
      return;
    }

    if (btn.hasAttribute('data-edit')) {
      const name = prompt('Ime i prezime', row.full_name || '');
      if (name == null) return;
      if (!name.trim()) { toast('Ime ne može biti prazno.'); return; }
      try {
        await updateUserName(row, name);
        toast('Ime spremljeno.');
        await refresh();
      } catch (err) {
        console.warn('[live] rename failed:', err);
        toast('Spremanje nije uspjelo.');
      }
    }
  });

  // Invite form → real invite (Edge Function) or allowlist fallback.
  const form = q('#addForm');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameEl = q('#uName'), mailEl = q('#uEmail');
    const name = nameEl ? nameEl.value.trim() : '';
    const email = mailEl ? mailEl.value.trim() : '';
    if (!name) { toast('Ime i prezime je obavezno.'); if (nameEl) nameEl.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Unesite ispravnu e-poštu.'); if (mailEl) mailEl.focus(); return; }
    const roleBtn = q('#addRole button[aria-pressed="true"]');
    const role = (roleBtn && roleBtn.dataset.set) || 'employee';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const res = await inviteUser({ full_name: name, email, role });
      toast(res.mode === 'invited' ? 'Pozivnica poslana na ' + email + '.'
        : res.mode === 'exists' ? 'Račun s tom e-poštom već postoji.'
        : email + ' je dodan/a — registracija ovom e-poštom.');
      form.reset();
      qa('#addRole button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.set === 'employee')));
      await refresh();
    } catch (err) {
      console.warn('[live] invite failed:', err);
      const m = (err && err.message) || '';
      toast(/owner account/i.test(m) ? 'To je vlasnički račun — već ima puni pristup.'
        : /already exists/i.test(m) ? 'Taj korisnik već postoji.'
        : 'Dodavanje nije uspjelo.');
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

// ---- Boot --------------------------------------------------------------------
// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }   // the gate handles the redirect
  state.me = await loadMyProfile().catch(() => null);
  wireEvents();
  await refresh();
  liveFirstDone();
})();
