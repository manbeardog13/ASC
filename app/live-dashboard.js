import { getSession, loadMyProfile, healthStats, countsByStatus, listStorageSets, freeSlotsByZone, recentMovements, subscribeToChanges, unsubscribe } from '../js/db.js';
import { decodePlan, daysUntil } from '../js/seasonPlan.js';
import { bootOnboarding } from './onboarding.js';
import { setWorkflowContext } from './workflow.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let resolved, loading = false, refreshed = false, channel, refreshTimer;
window.ascLiveFirst = new Promise(resolve => { resolved = resolve; });
const number = (key, value) => { const node = document.querySelector('[data-glance="' + key + '"]'); if (node) node.textContent = String(value); };
const active = set => set.status !== 'checked_out' && !set.deleted_at;
const unplaced = set => active(set) && !set.location_id && !set.slot;
const recordHref = code => 'set-detail.html?code=' + encodeURIComponent(code);

function dateLabel(value) {
  const days = daysUntil(new Date(value), new Date());
  if (days < 0) return 'Kasni';
  if (days === 0) return 'Danas';
  if (days === 1) return 'Sutra';
  return new Date(value).toLocaleDateString('hr-HR', { day:'numeric', month:'short' });
}
function row(set, due = false) {
  const name = set.vehicle?.customer?.name || set.public_code;
  const detail = [set.vehicle?.plate, set.public_code].filter(Boolean).join(' · ');
  const label = due ? dateLabel(set.expected_out_date) : unplaced(set) ? 'Smjesti' : set.status === 'checked_out' ? 'Preuzeto' : 'Otvori';
  return '<a class="board-row" href="' + esc(recordHref(set.public_code)) + '"><span class="board-row-copy"><b>' + esc(name) + '</b><small>' + esc(detail) + '</small></span><span class="board-row-end"><em>' + esc(label) + '</em><span aria-hidden="true">↗</span></span></a>';
}
function render(health, counts, sets, zones, moves) {
  const in7 = new Date(); in7.setDate(in7.getDate() + 7); in7.setHours(23,59,59,999);
  const due = sets.filter(s => active(s) && s.expected_out_date && new Date(s.expected_out_date) <= in7).sort((a,b) => new Date(a.expected_out_date) - new Date(b.expected_out_date));
  const waiting = sets.filter(unplaced);
  number('stored', counts.in_storage ?? 0); number('due', due.length); number('unplaced', waiting.length);
  number('in', health.todayCheckIns ?? 0); number('out', health.todayPickups ?? 0);
  number('swaps', sets.filter(s => { const plan = decodePlan(s.notes); const days = plan?.at ? daysUntil(plan.at, new Date()) : -1; return active(s) && days >= 0 && days <= 14; }).length);
  $('board-pickups').innerHTML = due.length ? due.slice(0,4).map(s => row(s,true)).join('') : '<p class="board-empty">Nema najavljenih preuzimanja u sljedećih 7 dana.<br><a href="checkout.html">Kupac je stigao? Pripremi preuzimanje ↗</a></p>';
  const recent = sets.filter(s => !s.deleted_at).sort((a,b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0,4);
  $('board-recent').innerHTML = recent.length ? recent.map(s => row(s)).join('') : '<p class="board-empty">Još nema kompleta.<br><a href="checkin.html">Zaprimi prvi komplet ↗</a></p>';
  $('gZones').innerHTML = zones == null ? 'Podaci o mjestima nisu dostupni.' : !zones.length ? '<a href="locations.html">Uvedi mjesta ↗</a>' : zones.map(z => '<a href="locations.html"><b>' + esc(z.free) + '</b> slobodno · ' + esc(z.zone || '—') + ' ↗</a>').join('');
  $('board-seasons').innerHTML = [['winter','Zimske'],['summer','Ljetne'],['all_season','Cjelogodišnje']].map(([key,label]) => '<p class="board-shift">' + label + ' · <b>' + sets.filter(s => active(s) && s.season === key).length + '</b></p>').join('');
  const action = { in:'Ulaz', move:'Premještaj', out:'Izlaz' };
  $('gMovesList').innerHTML = moves == null ? '<li class="board-empty">Evidencija kretanja nije dostupna.</li>' : !moves.length ? '<li class="board-empty">Nema zabilježenih kretanja.</li>' : moves.map(m => {
    const code = m.storage_sets?.public_code;
    const when = m.created_at ? new Date(m.created_at).toLocaleString('hr-HR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    const body = '<b>' + esc(code || 'Komplet') + '</b><span>' + esc(action[m.action] || m.action) + '</span><time>' + esc(when) + '</time>';
    return '<li>' + (code ? '<a href="' + esc(recordHref(code)) + '">' + body + '</a>' : body) + '</li>';
  }).join('');
  $('glance').dataset.live = '1';
  const partial = zones == null || moves == null;
  $('board-status').textContent = 'Osvježeno u ' + new Date().toLocaleTimeString('hr-HR', { hour:'2-digit', minute:'2-digit' }) + (partial ? ' · Dio podataka o skladištu nije dostupan.' : '');
  $('board-retry').hidden = !partial;
  setWorkflowContext({ due:due.length, unplacedCode:waiting[0]?.public_code || null, dataState:partial ? 'partial' : 'ready' });
}
async function refresh() {
  if (loading) return;
  loading = true; $('board-retry').disabled = true;
  try {
    const data = await Promise.all([healthStats(), countsByStatus(), listStorageSets(), freeSlotsByZone().catch(() => null), recentMovements(5).catch(() => null)]);
    render(...data); refreshed = true;
  } catch (error) {
    console.warn('[live] dashboard refresh failed:', error);
    $('board-status').textContent = refreshed ? 'Osvježavanje nije uspjelo. Prikazani su prethodno učitani podaci.' : 'Podaci nisu učitani. Pokušajte ponovno.';
    if (!refreshed) for (const id of ['board-pickups','board-recent']) $(id).innerHTML = '<p class="board-empty">Podaci trenutačno nisu dostupni.</p>';
    $('board-retry').hidden = false;
    setWorkflowContext({ dataState:'error', due:null, unplacedCode:null });
  } finally { loading = false; $('board-retry').disabled = false; resolved(); }
}
$('board-retry').addEventListener('click', refresh);
addEventListener('offline', () => { $('board-status').textContent = 'Bez veze. Podaci se trenutačno ne osvježavaju.'; setWorkflowContext({ dataState:'error', due:null, unplacedCode:null }); });
addEventListener('online', refresh);
(async () => {
  const session = await getSession().catch(() => null);
  if (!session) { resolved(); return; }
  const hour = new Date().getHours();
  $('greetWord').textContent = hour < 6 ? 'Dobra noć' : hour < 12 ? 'Dobro jutro' : hour < 18 ? 'Dobar dan' : 'Dobra večer';
  $('greetDate').textContent = new Date().toLocaleDateString('hr-HR', { weekday:'long', day:'numeric', month:'long' });
  loadMyProfile().then(profile => { const first = profile?.full_name?.trim().split(/\s+/)[0]; $('greetName').textContent = first ? ', ' + first : ''; }).catch(() => {});
  bootOnboarding();
  await refresh();
  channel = subscribeToChanges(payload => {
    if (payload?.table && !['storage_sets','locations','set_movements','customers','vehicles'].includes(payload.table)) return;
    clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 500);
  });
  addEventListener('pagehide', () => { clearTimeout(refreshTimer); unsubscribe(channel); }, {once:true});
})();
