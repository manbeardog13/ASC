// Synthetic only: operator-created warehouse areas, rack binding and navigation.
// No live database, no session, no real customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, syncAreas, emptyState, validateState, createArea, removeArea, createStack, moveStack, addTire, canPlace, stats } from '../app/warehouse-preview/model.js';
import { pinForSet } from '../js/mapPin.js';
import { expandLocations } from '../js/locationGrid.js';

const area = (s, extra = {}) => createArea(s, { id: 'A', name: 'Hala', width: 6, depth: 4, unit: 'grid', ...extra });

test('empty warehouse: starts with no areas, stacks, tyres; placement impossible', () => {
  const s = emptyState();
  assert.deepEqual(s.areas, []);
  assert.equal(validateState(s).valid, true);
  assert.equal(syncAreas(s).length, 0);
  assert.equal(canPlace(s, 'A', 0, 0).valid, false);
  assert.throws(() => createStack(s, { areaId: 'A', x: 0, z: 0 }));
  // A state saved before areas existed (no `areas` key) stays valid.
  const legacy = { version: 1, revision: 0, stacks: [], tires: [], history: [] };
  assert.equal(validateState(legacy).valid, true);
  assert.equal(validateState(area(legacy)).valid, true);
});

test('area creation uses only operator-entered dimensions; nothing is defaulted', () => {
  const s = emptyState();
  for (const bad of [{ width: undefined }, { depth: '' }, { width: 0 }, { width: -2 }, { depth: 500 }, { width: NaN }, { unit: undefined }, { unit: 'ft' }, { id: '' }, { id: '<b>' }, { id: 'x'.repeat(30) }]) {
    assert.throws(() => area(s, bad), undefined, JSON.stringify(bad));
  }
  const next = area(s);
  assert.equal(next.revision, 1);
  assert.deepEqual(next.areas[0], { id: 'A', name: 'Hala', width: 6, depth: 4, unit: 'grid', measurementStatus: 'operator-grid',
    floorRects: [{ x: 0, z: 0, w: 6, d: 4 }], voidRects: [], stair: null });
  const measured = createArea(next, { id: 'B', width: 12.5, depth: 8, unit: 'm' });
  assert.equal(measured.areas[1].measurementStatus, 'operator-measured');
  assert.equal(measured.areas[1].name, 'Zona B');
  assert.throws(() => area(measured), /već postoji/);
  assert.equal(validateState(measured).valid, true);
  // Tampered geometry (floor not matching entered size) is rejected.
  const tampered = structuredClone(measured); tampered.areas[0].floorRects[0].w = 99;
  assert.equal(validateState(tampered).valid, false);
});

test('zone codes with Croatian letters and dots bind like the location labels', () => {
  let s = createArea(emptyState(), { id: 'Č2.1', width: 3, depth: 3, unit: 'grid' });
  s = createStack(s, { areaId: 'Č2.1', x: 0, z: 0, rack: 'š1' });
  assert.equal(s.stacks[0].rack, 'Š1');
  assert.equal(pinForSet({ zone: 'Č2.1', rack: 'š1' }, s.stacks, ['Č2.1']).stackId, s.stacks[0].id);
  assert.throws(() => createArea(s, { id: 'A B', width: 3, depth: 3, unit: 'grid' }));
});

test('placement respects the entered bounds', () => {
  const s = area(emptyState());
  assert.equal(canPlace(s, 'A', 0, 0).valid, true);
  assert.equal(canPlace(s, 'A', 2.9, 0).valid, false, 'tyre footprint must stay inside 6-wide area');
  assert.equal(canPlace(s, 'A', 0, 1.9).valid, false);
});

test('location binding: a stack bound to a real rack is pinned exactly', () => {
  let s = area(emptyState());
  const rows = expandLocations({ warehouse: 'main', zone: 'A', racks: '01-02', shelves: '1', slots: '01-02' });
  s = createStack(s, { areaId: 'A', x: -1, z: 0, rack: rows[0].rack });
  s = createStack(s, { areaId: 'A', x: 1, z: 0 });
  assert.equal(s.stacks[0].id, 'A-01'); assert.equal(s.stacks[0].rack, '01');
  assert.equal(s.stacks[1].rack, undefined);
  assert.throws(() => createStack(s, { areaId: 'A', x: 2, z: 1, rack: ' 01 ' }), /već na karti/);
  assert.throws(() => createStack(s, { areaId: 'A', x: 2, z: 1, rack: 'a/b' }));
  assert.equal(validateState(s).valid, true);
  const pin = pinForSet({ zone: 'A', rack: '01', shelf: '1', slot: '02' }, s.stacks, s.areas.map(a => a.id));
  assert.deepEqual([pin.areaId, pin.stackId, pin.approx], ['A', 'A-01', false]);
  const unbound = pinForSet({ zone: 'A', rack: '02' }, s.stacks, s.areas.map(a => a.id));
  assert.deepEqual([unbound.areaId, unbound.stackId], ['A', null]);
  assert.equal(pinForSet({ zone: 'Z', rack: '01' }, s.stacks, s.areas.map(a => a.id)).areaId, null);
});

test('binding follows rack, not id, after a stack moves between areas', () => {
  let s = createArea(area(emptyState()), { id: 'B', width: 5, depth: 5, unit: 'm' });
  s = createStack(s, { areaId: 'A', x: 0, z: 0, rack: '07' });
  s = moveStack(s, 'A-07', { areaId: 'B', x: 0, z: 0 });
  const pin = pinForSet({ zone: 'B', rack: '07' }, s.stacks, ['A', 'B']);
  assert.equal(pin.stackId, 'A-07');
  assert.equal(pinForSet({ zone: 'A', rack: '07' }, s.stacks, ['A', 'B']).stackId, null);
});

test('navigation mirror: AREAS reflects state for scene, voice and tour', () => {
  const s = createArea(area(emptyState()), { id: 'B', width: 3, depth: 3, unit: 'grid' });
  syncAreas(s);
  assert.deepEqual(AREAS.map(a => a.id), ['A', 'B']);
  syncAreas(emptyState());
  assert.equal(AREAS.length, 0);
});

test('existing operational data is preserved: area operations never touch tyres or other stacks', () => {
  let s = area(emptyState());
  s = createStack(s, { areaId: 'A', x: 0, z: 0, rack: '01' });
  s = addTire(s, 'A-01', { setId: 'SYN-1', customer: 'Sintetički kupac', plate: 'SY-000-NT', brand: 'Test', size: '205/55 R16', color: 'crna' });
  const tyres = structuredClone(s.tires), stacks = structuredClone(s.stacks);
  const withB = createArea(s, { id: 'B', width: 4, depth: 4, unit: 'm' });
  assert.deepEqual(withB.tires, tyres); assert.deepEqual(withB.stacks, stacks);
  assert.throws(() => removeArea(withB, 'A'), /Najprije/);
  const removed = removeArea(withB, 'B');
  assert.deepEqual(removed.tires, tyres); assert.deepEqual(removed.stacks, stacks);
  assert.equal(stats(removed).occupied, 1);
  assert.equal(validateState(removed).valid, true);
});

test('area module has no hardcoded areas or measurements and no DB writes', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../app/warehouse-preview/model.js', import.meta.url), 'utf8');
  assert.match(src, /export const AREAS = \[\];/);
  const app = fs.readFileSync(new URL('../app/warehouse-preview/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /createLocations|\.insert\(|\.upsert\(|\.delete\(/, 'map must not write location/customer rows');
});
