// ============================================================================
// live-assistant.js — fills the assistant page's database-context strip with
// REAL shop numbers from Supabase (via ../js/db.js). The auth gate in app.js
// already guarantees a session before this runs. Guarded: a failed fetch keeps
// the honest zero markup instead of blanking. Pattern: live-dashboard.js.
// ============================================================================
import { getSession, listStorageSets } from '../js/db.js';

const qa = (s, r = document) => [...r.querySelectorAll(s)];

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

// The gate in app.js races this against a 1200ms cap before lifting the splash.
let liveFirstDone;
window.ascLiveFirst = new Promise((r) => { liveFirstDone = r; });

(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { liveFirstDone(); return; }  // the gate in app.js handles the redirect

  let sets;
  try {
    sets = await listStorageSets();
  } catch (e) {
    console.warn('[live] assistant context failed — keeping zeros:', e);
    liveFirstDone();
    return;
  }

  const in7 = new Date(Date.now() + 7 * 864e5);
  const winter = sets.filter((s) => s.season === 'winter' && s.status !== 'checked_out').length;
  const due = sets.filter((s) => s.status !== 'checked_out' && s.expected_out_date && new Date(s.expected_out_date) <= in7).length;
  const stored = sets.filter((s) => s.status !== 'checked_out').length;

  const bs = qa('.ag-ctx b');
  setNum(bs[0], stored);
  setNum(bs[1], winter);
  setNum(bs[2], due);

  liveFirstDone();
})();
