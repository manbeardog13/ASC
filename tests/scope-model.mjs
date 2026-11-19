import test from 'node:test';
import assert from 'node:assert/strict';
import { isShopToday, scopePlace, scopeSearch, sectionState } from '../app/scope-model.js';

const stored = {
  public_code: 'ASC-001234', status: 'in_storage', zone: 'A', rack: 'R2', shelf: '3', slot: '04',
  vehicle: { plate: 'DU-1234-AB', customer: { name: 'Ivan Šimić' } },
};
const released = { ...stored, public_code: 'ASC-009000', status: 'checked_out' };

test('a failed read is unavailable and an empty read is empty', () => {
  assert.equal(sectionState({ ok: false }).kind, 'unavailable');
  assert.equal(sectionState(null).kind, 'unavailable');
  assert.equal(sectionState({ ok: true, value: [] }).kind, 'empty');
  assert.equal(sectionState({ ok: true, value: null }).kind, 'empty');
  assert.equal(sectionState({ ok: true, value: [stored] }).kind, 'ready');
});

test('scope search keeps plate spacing and Croatian names', () => {
  assert.equal(scopeSearch([stored, released], 'DU 1234 AB')[0], stored);
  assert.equal(scopeSearch([stored], 'Ivan Simic')[0], stored);
});

test('a checked-out set is released, not still at its last rack', () => {
  assert.deepEqual(scopePlace(released), { key: 'scope.releasedAt', vars: { where: 'A · R2 · 3 · 04' } });
  assert.deepEqual(scopePlace({ status: 'checked_out' }), { key: 'scope.released' });
  assert.equal(scopePlace(stored).text, 'A · R2 · 3 · 04');
});

test('today follows the Dubrovnik day, not UTC', () => {
  const justAfterLocalMidnight = new Date('2026-01-15T23:30:00.000Z');
  assert.equal(isShopToday('2026-01-15T23:30:00.000Z', justAfterLocalMidnight), true);
  assert.equal(isShopToday('2026-01-15T10:00:00.000Z', justAfterLocalMidnight), false);
});
