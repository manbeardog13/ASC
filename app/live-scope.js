// Owner scope: stock, today's movement, where sets sit, and a search.
// Fees are not shown. The composer is mounted by app.js and is not restyled here.
import { loadMyProfile, healthStats, countsByStatus, freeSlotsByZone, recentMovements, listStorageSets, locationLabel } from '../js/db.js';
import { t } from './flow-ui.js';

const OWNER_EMAIL = 'cryptonii13@gmail.com';
const root = document.getElementById('flow-root');

function canSee(profile) {
  if (!profile) return false;
  if (profile.role === 'admin' || profile.role === 'manager') return true;
  return String(profile.email || '').trim().toLowerCase() === OWNER_EMAIL;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '—';
}

function whereOf(row) {
  const place = locationLabel(row);
  return place || t('scope.unplaced');
}

function stat(kicker, value) {
  const box = document.createElement('article');
  box.className = 'scope-stat';
  const label = document.createElement('span');
  label.textContent = kicker;
  const strong = document.createElement('b');
  strong.textContent = value;
  box.append(label, strong);
  return box;
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

function paint(data) {
  root.replaceChildren();
  const stats = document.createElement('div');
  stats.className = 'scope-stats';
  const counts = data.counts && typeof data.counts === 'object' ? data.counts : {};
  const health = data.health && typeof data.health === 'object' ? data.health : {};
  stats.append(
    stat(t('scope.stock'), num(counts.in_storage != null ? counts.in_storage : health.inventory)),
    stat(t('scope.todayIn'), num(health.todayCheckIns)),
    stat(t('scope.todayOut'), num(health.todayPickups)),
    stat(t('scope.reserved'), num(counts.reserved)),
  );
  root.append(stats);

  const where = block(t('scope.where'));
  const zones = Array.isArray(data.zones) ? data.zones : [];
  if (!zones.length) where.append(lead(t('scope.empty')));
  zones.forEach((zone) => {
    const row = document.createElement('p');
    row.className = 'scope-zone';
    row.textContent = t('scope.zoneLine', { zone: zone.zone || '—', free: String(zone.free || 0), total: String(zone.total || 0) });
    where.append(row);
  });
  root.append(where);

  const find = block(t('scope.find'));
  const input = document.createElement('input');
  input.id = 'scope-search';
  input.type = 'search';
  input.autocomplete = 'off';
  input.enterKeyHint = 'search';
  input.placeholder = t('scope.search');
  input.setAttribute('aria-label', t('scope.search'));
  const hits = document.createElement('div');
  hits.className = 'scope-hits';
  hits.setAttribute('role', 'list');
  const sets = Array.isArray(data.sets) ? data.sets : [];
  const renderHits = () => {
    const query = input.value.trim().toLowerCase();
    hits.replaceChildren();
    if (query.length < 2) return;
    const matched = sets.filter((row) => {
      const customer = row.vehicle && row.vehicle.customer;
      const blob = [row.public_code, row.zone, row.rack, row.shelf, row.slot, row.vehicle && row.vehicle.plate, customer && customer.name]
        .filter(Boolean).join(' ').toLowerCase();
      return blob.includes(query);
    }).slice(0, 8);
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
      place.textContent = whereOf(row);
      link.append(title, place);
      hits.append(link);
    });
  };
  input.addEventListener('input', renderHits);
  find.append(input, hits);
  root.append(find);

  const activity = block(t('scope.activity'));
  const today = new Date().toISOString().slice(0, 10);
  const moves = (Array.isArray(data.moves) ? data.moves : []).filter((row) => String(row.created_at || '').slice(0, 10) === today);
  if (!moves.length) activity.append(lead(t('scope.empty')));
  moves.forEach((row) => {
    const line = document.createElement('p');
    line.className = 'scope-move';
    const code = row.storage_sets && row.storage_sets.public_code;
    line.textContent = [code, row.action].filter(Boolean).join(' · ');
    activity.append(line);
  });
  root.append(activity);
}

async function boot() {
  const profile = await loadMyProfile().catch(() => null);
  if (!canSee(profile)) {
    root.append(lead(t('scope.closed')));
    return;
  }
  const [health, counts, zones, moves, sets] = await Promise.all([
    healthStats().catch(() => null),
    countsByStatus().catch(() => null),
    freeSlotsByZone().catch(() => []),
    recentMovements(12).catch(() => []),
    listStorageSets().catch(() => []),
  ]);
  paint({ health, counts, zones, moves, sets });
}

boot();
