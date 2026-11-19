// Owner scope: stock, today's movement, where sets sit, and a search.
// Fees are not shown. The composer is mounted by app.js and is not restyled here.
import { loadMyProfile, healthStats, countsByStatus, freeSlotsByZone, recentMovements, listStorageSets, subscribeToChanges, unsubscribe } from '../js/db.js';
import { t } from './flow-ui.js';
import { isShopToday, scopePlace, scopeSearch, sectionState } from './scope-model.js';

const OWNER_EMAIL = 'cryptonii13@gmail.com';
const root = document.getElementById('flow-root');
let searchQuery = '';
let refreshTimer = 0;
let loading = false;
let pending = false;

function canSee(profile) {
  if (!profile) return false;
  if (profile.role === 'admin' || profile.role === 'manager') return true;
  return String(profile.email || '').trim().toLowerCase() === OWNER_EMAIL;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '—';
}

function lead(text) {
  const node = document.createElement('p');
  node.className = 'lead';
  node.textContent = text;
  return node;
}

function block(title) {
  const box = document.createElement('section');
  box.className = 'scope-block';
  const heading = document.createElement('h2');
  heading.textContent = title;
  box.append(heading);
  return box;
}

function retryButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary';
  button.textContent = t('scope.retry');
  button.addEventListener('click', () => { refresh(); });
  return button;
}

function unavailable() {
  const box = document.createElement('div');
  box.className = 'scope-unavailable';
  box.append(lead(t('scope.unavailable')), retryButton());
  return box;
}

function placeText(row) {
  const place = scopePlace(row);
  return place.text || t(place.key, place.vars);
}

function fillSection(box, result, renderRow) {
  const state = sectionState(result);
  if (state.kind === 'unavailable') { box.append(unavailable()); return; }
  if (state.kind === 'empty') { box.append(lead(t('scope.empty'))); return; }
  state.list.forEach((row) => box.append(renderRow(row)));
}

function paint(data) {
  const query = searchQuery;
  root.replaceChildren();
  const stats = document.createElement('div');
  stats.className = 'scope-stats';
  const counts = data.counts && data.counts.ok && data.counts.value && typeof data.counts.value === 'object' ? data.counts.value : null;
  const health = data.health && data.health.ok && data.health.value && typeof data.health.value === 'object' ? data.health.value : null;
  const stat = (kicker, value) => {
    const box = document.createElement('article');
    box.className = 'scope-stat';
    const label = document.createElement('span');
    label.textContent = kicker;
    const strong = document.createElement('b');
    strong.textContent = value;
    box.append(label, strong);
    return box;
  };
  if (data.counts && data.counts.ok === false && data.health && data.health.ok === false) {
    stats.append(unavailable());
  } else {
    stats.append(
      stat(t('scope.stock'), counts ? num(counts.in_storage) : '—'),
      stat(t('scope.todayIn'), health ? num(health.todayCheckIns) : '—'),
      stat(t('scope.todayOut'), health ? num(health.todayPickups) : '—'),
      stat(t('scope.reserved'), counts ? num(counts.reserved) : '—'),
    );
  }
  root.append(stats);

  const where = block(t('scope.where'));
  fillSection(where, data.zones, (zone) => {
    const row = document.createElement('p');
    row.className = 'scope-zone';
    row.textContent = t('scope.zoneLine', { zone: zone.zone || '—', free: String(zone.free || 0), total: String(zone.total || 0) });
    return row;
  });
  root.append(where);

  const find = block(t('scope.find'));
  if (data.sets && data.sets.ok === false) find.append(unavailable());
  else {
    const input = document.createElement('input');
    input.id = 'scope-search';
    input.type = 'search';
    input.autocomplete = 'off';
    input.enterKeyHint = 'search';
    input.placeholder = t('scope.search');
    input.setAttribute('aria-label', t('scope.search'));
    input.value = query;
    const hits = document.createElement('div');
    hits.className = 'scope-hits';
    hits.setAttribute('role', 'list');
    const sets = sectionState(data.sets).list || [];
    const renderHits = () => {
      searchQuery = input.value;
      hits.replaceChildren();
      if (input.value.trim().length < 2) return;
      const matched = scopeSearch(sets, input.value).slice(0, 8);
      if (!matched.length) { hits.append(lead(t('scope.miss'))); return; }
      matched.forEach((row) => {
        const link = document.createElement('a');
        link.className = 'scope-hit';
        link.href = 'set-detail.html?code=' + encodeURIComponent(row.public_code || '');
        link.setAttribute('role', 'listitem');
        const title = document.createElement('b');
        const customer = row.vehicle && row.vehicle.customer;
        title.textContent = [customer && customer.name, row.vehicle && row.vehicle.plate, row.public_code].filter(Boolean).join(' · ');
        const place = document.createElement('small');
        place.textContent = placeText(row);
        link.append(title, place);
        hits.append(link);
      });
    };
    input.addEventListener('input', renderHits);
    find.append(input, hits);
    renderHits();
  }
  root.append(find);

  const activity = block(t('scope.activity'));
  const todayMoves = {
    ok: data.moves ? data.moves.ok : false,
    value: (sectionState(data.moves).list || []).filter((row) => isShopToday(row.created_at)),
  };
  fillSection(activity, data.moves && data.moves.ok === false ? data.moves : todayMoves, (row) => {
    const line = document.createElement('p');
    line.className = 'scope-move';
    const code = row.storage_sets && row.storage_sets.public_code;
    line.textContent = [code, row.action].filter(Boolean).join(' · ');
    return line;
  });
  root.append(activity);
}

async function read(fn) {
  try { return { ok: true, value: await fn() }; }
  catch (error) { return { ok: false, error }; }
}

async function load() {
  const [health, counts, zones, moves, sets] = await Promise.all([
    read(healthStats),
    read(countsByStatus),
    read(freeSlotsByZone),
    read(() => recentMovements(40)),
    read(listStorageSets),
  ]);
  return { health, counts, zones, moves, sets };
}

async function refresh() {
  if (!root) return;
  if (loading) { pending = true; return; }
  const field = document.getElementById('scope-search');
  if (field) searchQuery = field.value;
  loading = true;
  try { paint(await load()); }
  finally {
    loading = false;
    if (pending) { pending = false; refresh(); }
  }
}

async function boot() {
  const profile = await loadMyProfile().catch(() => null);
  if (!canSee(profile)) {
    root.append(lead(t('scope.closed')));
    return;
  }
  await refresh();
  const channel = subscribeToChanges((payload) => {
    const table = payload && payload.table;
    if (table && !['storage_sets', 'locations', 'set_movements', 'tires', 'vehicles', 'customers'].includes(table)) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refresh(); }, 400);
  });
  document.addEventListener('asc:detail-closed', () => { refresh(); });
  window.addEventListener('pagehide', () => unsubscribe(channel), { once: true });
}

boot();
