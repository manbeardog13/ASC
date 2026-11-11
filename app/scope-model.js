// Decisions for the owner scope. No DOM, so the smoke test can import it.
import { searchSets } from './agent-search.js';

export const SHOP_TZ = 'Europe/Zagreb';

export function shopDayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function isShopToday(iso, now = new Date()) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return false;
  return shopDayKey(when) === shopDayKey(now);
}

export function scopeSearch(rows, query) {
  return searchSets(rows, query);
}

export function scopePlace(row) {
  const where = [row && row.zone, row && row.rack, row && row.shelf, row && row.slot]
    .filter((part) => part != null && part !== '').join(' · ');
  if (row && row.status === 'checked_out') {
    return where ? { key: 'scope.releasedAt', vars: { where } } : { key: 'scope.released' };
  }
  if (!where) return { key: 'scope.unplaced' };
  return { text: where };
}

// A thrown read is unavailable. A successful empty list is empty.
export function sectionState(result) {
  if (!result || result.ok === false) return { kind: 'unavailable' };
  const value = result.value;
  const list = Array.isArray(value) ? value : [];
  return list.length ? { kind: 'ready', list } : { kind: 'empty', list };
}
