// ============================================================================
// live-checkin.js — wires the check-in form (Zaprimi) to REAL Supabase data
// via ../js/db.js. The auth gate in app.js already guarantees a session before
// this runs. Every fetch is guarded: a failure keeps the page's markup (hero
// zeros, static skeleton) and warns instead of blanking.
//
// Two modes, decided by the prefill peeked in checkin.html (window.__ascPrefill,
// captured BEFORE the inline reader consumes sessionStorage 'asc.prefill'):
//   create (default) — createStorageSet(form) → toast 'Spremljeno <code>'
//   edit (edit:true + code) — loadStorageSet for ids, then updateCustomer /
//     updateVehicle / updateStorageSet / replaceTires → toast 'Ažurirano <code>'
// Both navigate to set-detail.html?code=<code> after ~900ms.
// ============================================================================
import {
  getSession, healthStats, createStorageSet, loadStorageSet,
  updateCustomer, updateVehicle, updateStorageSet, replaceTires,
} from '../js/db.js';
// db.js's createStorageSet persists the location via store.rememberLocation →
// localStorage 'asc.recentLocations'. Loading here (same module instance as
// db.js uses) hydrates the in-memory list so saving doesn't clobber history.
import { loadRecentLocations } from '../js/store.js';

const $ = (id) => document.getElementById(id);
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const showToast = (msg) => {
  if (typeof window.ascToast === 'function') window.ascToast(msg);
  else console.warn('[live] toast unavailable:', msg);
};

// Splash-aware number setter (same contract as live-dashboard.js): while the
// Prag splash holds the reveal, feed the real value into data-count so the
// held count-up lands on it; otherwise claim the element outright.
function setNum(el, val) {
  if (!el) return;
  if (document.documentElement.classList.contains('splashing') && Number.isFinite(+val)) {
    el.dataset.count = String(+val);
    return;
  }
  el.removeAttribute('data-count'); el.textContent = String(val);
}

// ---- Edit mode (module-level flag) ----------------------------------------
const pf = window.__ascPrefill || null;
const editMode = Boolean(pf && pf.edit && pf.code);
const editCode = editMode ? String(pf.code) : null;
let editCtx = null;   // { setId, customerId, vehicleId } once the set is loaded
let editSet = null;   // the full loaded row — tire merge + hydration gate need it
// The prefill bridge carries only a subset of fields. Saving before the real row
// has filled the form would write the gaps back as NULLs — so edit-mode submit is
// gated on this flag and re-attempts the load itself if the preload failed.
let editHydrated = !editMode;
let paidTouched = false;
let onRimsTouched = false;

async function ensureEditCtx() {
  if (editCtx && editCtx.setId) return editCtx;
  const data = await loadStorageSet(editCode);
  editCtx = {
    setId: data.id,
    customerId: data.vehicle?.customer?.id ?? null,
    vehicleId: data.vehicle?.id ?? null,
  };
  return editCtx;
}

// ---- Recent-location chips (localStorage 'asc.recentLocations') ------------
const PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';

function renderRecentChips() {
  const wrap = $('recentLoc');
  if (!wrap) return;
  let recent = [];
  try { recent = loadRecentLocations() || []; } catch (e) { recent = []; }
  recent = recent.filter((l) => l && (l.zone || l.rack || l.shelf || l.slot));
  if (!recent.length) { wrap.hidden = true; return; } // no real history yet — hide the mock chips (visual silence)
  wrap.hidden = false;
  wrap.textContent = '';
  recent.forEach((loc) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sugg';
    btn.innerHTML = PIN_SVG; // static trusted markup; the label below is a text node
    btn.appendChild(document.createTextNode([loc.zone, loc.rack, loc.shelf, loc.slot].filter(Boolean).join(' · ')));
    btn.addEventListener('click', () => {
      if ($('s_zone')) $('s_zone').value = loc.zone || '';
      if ($('s_rack')) $('s_rack').value = loc.rack || '';
      if ($('s_shelf')) $('s_shelf').value = loc.shelf || '';
      if ($('s_slot')) $('s_slot').value = loc.slot || '';
    });
    wrap.appendChild(btn);
  });
}

// ---- Edit chrome: same structures, edit wording ----------------------------
function enterEditChrome() {
  const codeEl = q('.ci-stats b.code');
  if (codeEl) codeEl.textContent = editCode;
  const codeLabel = codeEl && codeEl.nextElementSibling;
  if (codeLabel) codeLabel.textContent = 'KÔD SETA';
  const btn = q('#ci .btn-primary');
  if (btn && btn.lastChild && btn.lastChild.nodeType === 3) btn.lastChild.textContent = 'Spremi promjene';
}

// Fill the form from the loaded set WITHOUT overwriting anything the prefill
// bridge (or the employee) already typed — edit-submit writes the full form
// back, so every field must reflect current data before the first save.
function fillFromSet(data) {
  const fillIfEmpty = (id, v) => {
    const el = $(id);
    if (el && !String(el.value || '').trim() && v != null && v !== '') el.value = v;
  };
  const cust = data.vehicle?.customer || {};
  const veh = data.vehicle || {};
  fillIfEmpty('c_name', cust.name); fillIfEmpty('c_phone', cust.phone);
  fillIfEmpty('c_email', cust.email); fillIfEmpty('c_address', cust.address);
  fillIfEmpty('v_make', veh.make); fillIfEmpty('v_model', veh.model);
  fillIfEmpty('v_year', veh.year); fillIfEmpty('v_plate', veh.plate);
  fillIfEmpty('s_zone', data.zone); fillIfEmpty('s_rack', data.rack);
  fillIfEmpty('s_shelf', data.shelf); fillIfEmpty('s_slot', data.slot);
  fillIfEmpty('s_out', data.expected_out_date); fillIfEmpty('s_fee', data.fee);
  fillIfEmpty('s_notes', data.notes);
  // Segments and the paid switch honor the same fill-don't-overwrite contract:
  // a choice the employee already made while the preload was in flight stays.
  if (window.setSegOpt && data.bolts_location && !$('s_bolts').value) setSegOpt('s_bolts', data.bolts_location);

  const onr = $('s_onrims');
  // Don't overwrite an on-rims choice the employee already made while the
  // preload (or save-time hydration) was in flight.
  if (onr && !onRimsTouched && onr.checked !== Boolean(data.on_rims)) {
    onr.checked = Boolean(data.on_rims);
    onr.dispatchEvent(new Event('change')); // reveals/hides the rim-type field via the page's own listener
  }
  if (data.on_rims) fillIfEmpty('s_rimtype', data.rim_type);
  if ($('s_paid') && !paidTouched) $('s_paid').checked = Boolean(data.paid);
  if (window.setSegOpt && !$('s_hubcaps').value) setSegOpt('s_hubcaps', data.hubcaps_location || (data.hubcaps_stored ? 'stored' : ''));
  if (!(pf && pf.season) && data.season) {
    const sb = document.querySelector('[data-season="' + data.season + '"]');
    if (sb) sb.click();
  }

  // Tires: size the rows to the set (the page's own change-listener re-renders,
  // preserving whatever is already typed), then fill blanks from the saved tires.
  const qty = Math.max(1, Math.min(8, Number(data.quantity) || (data.tires?.length || 4)));
  const qtyEl = $('s_qty');
  if (qtyEl && Number(qtyEl.value) !== qty) {
    qtyEl.value = qty;
    qtyEl.dispatchEvent(new Event('change'));
  }
  const rows = qa('#tires .tire-edit-row');
  (data.tires || []).slice(0, rows.length).forEach((t, i) => {
    const r = rows[i];
    const pos = q('[data-t="position"]', r);
    if (pos && t.position) pos.value = t.position;
    const setIfEmpty = (sel, v) => {
      const el = q(sel, r);
      if (el && !String(el.value || '').trim() && v != null && v !== '') el.value = v;
    };
    setIfEmpty('[data-t="size"]', t.size);
    setIfEmpty('[data-t="tread_mm"]', t.tread_mm);
    setIfEmpty('[data-t="brand"]', t.brand);
    setIfEmpty('[data-t="dot_code"]', t.dot_code);
  });
}

// ---- Read the whole form into the shape db.js expects -----------------------
function readForm() {
  const val = (id) => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const num = (id) => {
    const raw = val(id);
    if (raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const seasonBtn = document.querySelector('[data-season][aria-pressed="true"]');
  const onRims = Boolean($('s_onrims') && $('s_onrims').checked);
  const tires = qa('#tires .tire-edit-row').map((r) => {
    const g = (sel) => { const el = q(sel, r); return el ? String(el.value || '').trim() : ''; };
    const tread = g('[data-t="tread_mm"]');
    const treadNum = tread === '' ? null : Number(tread);
    return {
      position: g('[data-t="position"]'),
      size: g('[data-t="size"]'),
      brand: g('[data-t="brand"]'),
      tread_mm: Number.isFinite(treadNum) ? treadNum : null,
      dot_code: g('[data-t="dot_code"]'),
    };
  });
  // The form is novalidate, so the inputs' declared bounds are enforced here:
  // an impossible year or a negative fee becomes "not recorded" rather than
  // garbage on a signed document.
  let year = num('v_year');
  if (year != null && (year < 1950 || year > 2100)) year = null;
  let fee = num('s_fee');
  if (fee != null && fee < 0) fee = null;
  return {
    customer: { name: val('c_name'), phone: val('c_phone'), email: val('c_email'), address: val('c_address') },
    vehicle: {
      make: val('v_make'), model: val('v_model'), year,
      plate: val('v_plate').toUpperCase(), vin: null,
    },
    set: {
      season: seasonBtn ? seasonBtn.dataset.season : 'winter',
      on_rims: onRims,
      rim_type: onRims ? val('s_rimtype') : '',
      quantity: Math.max(1, Math.min(8, Number(val('s_qty')) || 4)),
      zone: val('s_zone'), rack: val('s_rack'), shelf: val('s_shelf'), slot: val('s_slot'),
      check_in_date: new Date().toISOString().slice(0, 10),
      expected_out_date: val('s_out'),
      fee,
      paid: Boolean($('s_paid') && $('s_paid').checked),
      notes: val('s_notes'),
      bolts_location: val('s_bolts') || null,
      hubcaps_location: val('s_hubcaps') || null,
      hubcaps_stored: val('s_hubcaps') === 'stored',
    },
    tires,
  };
}

// ---- Submit: the one write path ---------------------------------------------
const form = $('ci');
const submitBtn = form ? form.querySelector('.btn-primary') : null;
let inFlight = false;

function goToSet(code) {
  setTimeout(() => { location.href = 'set-detail.html?code=' + encodeURIComponent(code); }, 900);
}

if (form) form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (inFlight) return;
  inFlight = true;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.setAttribute('aria-busy', 'true'); }
  const unlock = () => {
    inFlight = false;
    if (submitBtn) { submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); }
  };
  try {
    if (editMode && !editHydrated) {
      // The row never landed (flaky preload, or a save faster than the fetch).
      // Writing the form now would null every field the prefill didn't carry —
      // load and fill first; a failure here aborts the save, form untouched.
      const data = await loadStorageSet(editCode);
      editCtx = {
        setId: data.id,
        customerId: data.vehicle?.customer?.id ?? null,
        vehicleId: data.vehicle?.id ?? null,
      };
      editSet = data;
      fillFromSet(data);
      editHydrated = true;
    }
    const f = readForm();
    if (!f.customer.name) {
      if ($('c_name')) $('c_name').focus();
      showToast('Ime kupca je obavezno.');
      unlock();
      return;
    }
    if (editMode) {
      const ctx = await ensureEditCtx();
      const c = f.customer, v = f.vehicle, s = f.set;
      if (ctx.customerId) {
        await updateCustomer(ctx.customerId, {
          name: c.name, phone: c.phone || null, email: c.email || null, address: c.address || null,
        });
      } else console.warn('[live] no customer id on', editCode, '— customer fields not saved');
      if (ctx.vehicleId) {
        // vin intentionally absent from the patch: the form has no VIN field,
        // and writing null would wipe a VIN recorded outside this form.
        await updateVehicle(ctx.vehicleId, {
          make: v.make || null, model: v.model || null, year: v.year, plate: v.plate || null,
        });
      } else console.warn('[live] no vehicle id on', editCode, '— vehicle fields not saved');
      await updateStorageSet(ctx.setId, {
        season: s.season, on_rims: s.on_rims,
        rim_type: s.on_rims ? s.rim_type || null : null,
        quantity: s.quantity,
        zone: s.zone || null, rack: s.rack || null, shelf: s.shelf || null, slot: s.slot || null,
        expected_out_date: s.expected_out_date || null,
        fee: s.fee, paid: s.paid, notes: s.notes || null,
        bolts_location: s.bolts_location || null, hubcaps_location: s.hubcaps_location || null, hubcaps_stored: s.hubcaps_stored,
        // check_in_date intentionally untouched: editing must not re-date the intake
      });
      // The form collects position/size/brand/tread/DOT — carry the still-unshown
      // columns (model, studded, condition notes) over from the loaded rows so an
      // edit-save can't silently erase them. Match by POSITION only: an index
      // fallback would graft one tire's data onto a physically different tire if
      // positions moved. Rows the employee blanked out keep no carry — they drop.
      const existing = (editSet && editSet.tires) || [];
      const taken = new Set();
      const carried = f.tires.map((t) => {
        const kept = t.size || t.brand || (t.tread_mm != null) || t.dot_code;
        if (!kept) return t;   // fully cleared row — let it be filtered out
        const j = existing.findIndex((o, k) => !taken.has(k) && t.position && o.position === t.position);
        if (j < 0) return t;
        taken.add(j);
        const o = existing[j];
        // Keep the form's DOT (it's now editable); only carry what the form omits.
        return { ...t, model: o.model, studded: o.studded, condition_notes: o.condition_notes };
      });
      await replaceTires(ctx.setId, carried);
      showToast('Ažurirano ' + editCode);
      goToSet(editCode);
    } else {
      const code = await createStorageSet(f);
      renderRecentChips(); // createStorageSet just persisted this location
      showToast('Spremljeno ' + code);
      goToSet(code);
    }
    // stay disabled — navigation is in flight; re-enabling would invite doubles
  } catch (err) {
    console.warn('[live] save failed — keeping the form:', err);
    showToast(err && err.message ? err.message : 'Spremanje nije uspjelo. Pokušajte ponovno.');
    unlock();
  }
});

// ---- First paint: hero numbers + chips + (in edit mode) the current set ----
// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; } // the gate in app.js handles the redirect

  try { renderRecentChips(); } catch (e) { console.warn('[live] recent locations failed:', e); }
  if (editMode) enterEditChrome();

  try {
    const h = await healthStats();
    const nums = qa('.ci-stats b[data-count]');
    setNum(nums[0], h.inventory);        // NA ČUVANJU
    setNum(nums[1], h.todayCheckIns);    // DANAS ZAPRIMLJENO
  } catch (e) {
    console.warn('[live] hero stats failed — keeping zeros:', e);
  }
  liveFirstDone();

  if (editMode) {
    try {
      const data = await loadStorageSet(editCode);
      editCtx = {
        setId: data.id,
        customerId: data.vehicle?.customer?.id ?? null,
        vehicleId: data.vehicle?.id ?? null,
      };
      editSet = data;
      fillFromSet(data);
      editHydrated = true;
    } catch (e) {
      console.warn('[live] could not preload', editCode, '(the save gate retries it):', e);
    }
  }
})();

// A deliberate Plaćeno / Na naplacima choice made while the preload is in flight
// must survive the late fill — fillFromSet checks these flags before touching
// either control.
if ($('s_paid')) $('s_paid').addEventListener('change', () => { paidTouched = true; });
if ($('s_onrims')) $('s_onrims').addEventListener('change', () => { onRimsTouched = true; });

// ============================================================================
// Sluh v1.1 — hold-to-talk check-in (Brain-1)
// Wires #sluhBtn → voice.js listenHold → sluh.js extractSlots → form fill.
// ============================================================================

// Fill form fields from slotsToPreifll output (overwrites — this is intentional user speech).
function fillFromSluh(pf) {
  const fi = (id, v) => { const el = $(id); if (el && v != null && v !== '') el.value = String(v); };
  fi('c_name',  pf.customer_name);
  fi('c_phone', pf.phone);
  fi('c_email', pf.email);
  fi('v_plate', pf.plate);
  fi('v_make',  pf.make);
  fi('v_model', pf.model);
  if (pf.year)  fi('v_year', pf.year);
  fi('s_zone',  pf.zone);
  fi('s_rack',  pf.rack);
  fi('s_shelf', pf.shelf);
  fi('s_slot',  pf.slot);
  if (pf.season) {
    const sb = document.querySelector('[data-season="' + pf.season + '"]');
    if (sb) sb.click();
  }
  if (pf.quantity != null) {
    const qtyEl = $('s_qty');
    if (qtyEl) { qtyEl.value = pf.quantity; qtyEl.dispatchEvent(new Event('change')); }
  }
  if (pf.on_rims != null) {
    const onr = $('s_onrims');
    if (onr && onr.checked !== pf.on_rims) {
      onr.checked = pf.on_rims;
      onr.dispatchEvent(new Event('change'));
    }
  }
  if (pf.bolts_location    && window.setSegOpt) window.setSegOpt('s_bolts',   pf.bolts_location);
  if (pf.hubcaps_location  && window.setSegOpt) window.setSegOpt('s_hubcaps', pf.hubcaps_location);
  const rows = qa('#tires .tire-edit-row');
  rows.forEach((r) => {
    const setE = (sel, v) => { const el = q(sel, r); if (el && v && !el.value) el.value = v; };
    if (pf.tire_size) setE('[data-t="size"]',  pf.tire_size);
    if (pf.brand)     setE('[data-t="brand"]', pf.brand);
  });
}

// Sluh init — runs once; skips silently if #sluhBtn absent or voice unsupported.
(async () => {
  const btn = document.getElementById('sluhBtn');
  if (!btn) return;

  // Dynamic imports keep this wiring lazy — no cost if the button is never touched.
  const { voiceSupported, listenHold, abortListening } = await import('../js/voice.js');
  const { extractSlots, groundCustomer, confidence, slotsToPreifll } = await import('./sluh.js');
  const { listCustomers } = await import('../js/db.js');

  if (!voiceSupported()) { btn.hidden = true; return; }

  const label = btn.querySelector('.sluh-label');
  let holdHandle = null;

  function setListening(on) {
    btn.classList.toggle('listening', on);
    if (label) label.textContent = on ? 'Slušam…' : 'Drži i govori';
  }

  async function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    // Capture btn before any await — e.currentTarget nulls out after async yields
    setListening(true);

    // Warm the customer cache in parallel with starting the listen
    const [customersResult, handle] = await Promise.all([
      listCustomers().catch(() => []),
      Promise.resolve(listenHold({ onInterim: () => {} })),
    ]);
    holdHandle = handle;
    const transcript = await holdHandle.done;

    setListening(false);
    holdHandle = null;

    if (!transcript?.trim()) return;

    const slots    = extractSlots(transcript);
    const score    = confidence(slots);

    if (score >= 0.6) {
      const { customer } = groundCustomer(slots, customersResult);
      fillFromSluh(slotsToPreifll(slots, customer));
      showToast('Forma ispunjena (' + Math.round(score * 100) + '%)');
    } else if (navigator.onLine) {
      // Brain-2 fallback: write transcript for the Gemini agent to pick up
      sessionStorage.setItem('asc.sluh_transcript', transcript);
      document.dispatchEvent(new CustomEvent('asc:sluh-fallback', { detail: { transcript, slots } }));
      // Also do a partial fill so at least the high-conf slots land
      const { customer } = groundCustomer(slots, customersResult);
      fillFromSluh(slotsToPreifll(slots, customer));
      showToast('Šaljem agentu…');
    } else {
      // Offline: partial fill with what we have
      const { customer } = groundCustomer(slots, customersResult);
      fillFromSluh(slotsToPreifll(slots, customer));
      showToast('Djelomično ispunjeno (offline)');
    }
  }

  function releaseHold() {
    if (holdHandle) { holdHandle.release(); holdHandle = null; }
    setListening(false);
  }

  btn.addEventListener('pointerdown', onPointerDown);
  btn.addEventListener('pointerup',     releaseHold);
  btn.addEventListener('pointerleave',  releaseHold);
  btn.addEventListener('pointercancel', releaseHold);

  // Tear down mic if the page is leaving or the SPA route changes
  document.addEventListener('asc:teardown', () => { abortListening(); holdHandle = null; setListening(false); });
  window.addEventListener('hashchange',     () => { abortListening(); holdHandle = null; setListening(false); });
})();
