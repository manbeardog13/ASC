// Synthetic only: operator-created warehouse areas, rack binding and navigation.
// No live database, no session, no real customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, syncAreas, emptyState, validateState, createArea, removeArea, createStack, moveStack, addTire, canPlace, stats, mergeRemoteLayout } from '../app/warehouse-preview/model.js';
import { pinForSet, locationKey } from '../js/mapPin.js';
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
  for (const bad of [{ width: undefined }, { depth: '' }, { width: 0 }, { width: -2 }, { depth: 500 }, { width: NaN }, { unit: undefined }, { unit: 'ft' }, { id: '' }, { id: '<b>' }, { id: 'x'.repeat(41) }, { id: 'A"B' }]) {
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
  const spaced = createArea(s, { id: '  hala   2/a ', width: 3, depth: 3, unit: 'grid' });
  assert.equal(spaced.areas[1].id, 'HALA 2/A', 'spaces collapsed, slash kept, upper case');
  assert.equal(pinForSet({ zone: 'Hala 2/A' }, [], ['HALA 2/A']).areaId, 'HALA 2/A');
  assert.throws(() => createArea(s, { id: 'Z'.repeat(41), width: 3, depth: 3, unit: 'grid' }), /predugačka/);
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
  assert.throws(() => createStack(s, { areaId: 'A', x: 2, z: 1, rack: 'a<b' }), /smije/);
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

test('NFC and case: decomposed Č and a1/A1 match the same area and rack', () => {
  const decomposed = 'C\u030C1';
  assert.notEqual(decomposed, 'Č1');
  assert.equal(locationKey(decomposed), 'Č1');
  let s = createArea(emptyState(), { id: decomposed, width: 4, depth: 4, unit: 'grid' });
  assert.equal(s.areas[0].id, 'Č1');
  assert.throws(() => createArea(s, { id: 'č1', width: 4, depth: 4, unit: 'grid' }), /već postoji/);
  s = createStack(s, { areaId: 'Č1', x: 0, z: 0, rack: 'a1' });
  assert.equal(s.stacks[0].rack, 'A1');
  assert.throws(() => createStack(s, { areaId: 'Č1', x: 1.2, z: 1.2, rack: 'A1' }), /već na karti/);
  assert.equal(pinForSet({ zone: 'č1', rack: 'A1' }, s.stacks, ['Č1']).stackId, s.stacks[0].id);
  assert.equal(pinForSet({ zone: decomposed.toLowerCase(), rack: 'a1' }, s.stacks, ['Č1']).stackId, s.stacks[0].id);
});

test('mapPin never guesses: rack 1 does not resolve to unbound A-S001', () => {
  const pin = pinForSet({ zone: 'A', rack: '1' }, [{ id: 'A-S001', areaId: 'A' }], ['A']);
  assert.equal(pin.stackId, null);
  assert.equal(pin.approx, true);
});

test('mapPin never guesses: a stack bound to rack X is not returned for rack 2 by its id', () => {
  const stacks = [{ id: 'A-S002', areaId: 'A', rack: 'X' }, { id: 'A-2', areaId: 'A' }];
  assert.equal(pinForSet({ zone: 'A', rack: '2' }, stacks, ['A']).stackId, null, 'no id fallback once bindings exist');
  assert.equal(pinForSet({ zone: 'A', rack: 'S002' }, stacks, ['A']).stackId, null);
  assert.equal(pinForSet({ zone: 'A', rack: 'x' }, stacks, ['A']).stackId, 'A-S002');
  // Legacy exact id still works in an area with no bindings at all.
  assert.equal(pinForSet({ zone: 'K', rack: 's025' }, [{ id: 'K-S025', areaId: 'K' }], ['K']).stackId, 'K-S025');
});

test('legacy pre-area v2 state loads, and corrupt areas are reported, not dropped', () => {
  const legacy = { version: 1, revision: 3, stacks: [], tires: [], history: [] };
  assert.equal(validateState(legacy).valid, true);
  assert.equal(syncAreas(legacy).length, 0);
  const corrupt = { ...emptyState(), areas: [{ id: 'A', name: 'x', width: -1, depth: 2, unit: 'm' }] };
  const result = validateState(corrupt);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.equal(validateState({ ...emptyState(), areas: 'nope' }).valid, false);
});

test('no DB writes from map files; shared-map writes only hit dedicated warehouse tables', async () => {
  const fs = await import('node:fs');
  for (const rel of ['../app/warehouse-preview/app.js', '../app/warehouse-preview/model.js', '../app/warehouse-preview/scene.js', '../app/warehouse-preview/live-inventory.js', '../app/warehouse-preview/inventory-ui.js', '../app/warehouse-preview/building.js', '../js/mapPin.js', '../app/live-locations.js']) {
    const src = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
    // Array.from()/controls.update() are fine; table access and write calls are not.
    assert.doesNotMatch(src, /supabase|\.from\(\s*["'`]|\.insert\(|\.upsert\(|\.delete\(|\.update\(\s*\{|\.rpc\(/, rel);
  }
  const live = fs.readFileSync(new URL('../app/live-locations.js', import.meta.url), 'utf8');
  assert.equal((live.match(/createLocations\(/g) || []).length, 1, 'locations page keeps only its pre-existing write');
  const db = fs.readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');
  const section = db.slice(db.indexOf('// ---- Shared warehouse map'));
  assert.ok(section.length > 100);
  const tables = [...section.matchAll(/\.from\("([^"]+)"\)/g)].map(m => m[1]);
  assert.ok(tables.length >= 5);
  assert.deepEqual([...new Set(tables)].sort(), ['warehouse_areas', 'warehouse_rack_positions', 'warehouse_space_bindings']);
  assert.doesNotMatch(section, /\.rpc\(/);
});

test('edit gate: only staff/admin roles may change the shared map', async () => {
  const fs = await import('node:fs');
  const db = fs.readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');
  assert.match(db, /WAREHOUSE_EDIT_ROLES = \["admin", "manager", "employee", "reception"\]/);
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261017030000_warehouse_areas.sql', import.meta.url), 'utf8');
  assert.match(sql, /NEEDS TONI'S APPROVAL TO APPLY/);
  assert.equal((sql.match(/asc_role\(\) in \('admin', 'manager', 'employee', 'reception'\)/g) || []).length, 10);
  assert.doesNotMatch(sql, /asc_role\(\) <> 'readonly'/);
  assert.doesNotMatch(sql, /references public\.(locations|customers|storage_sets|tires)|on delete cascade/i);
});

test('merge: remote areas/positions appear locally; local-only areas kept for upload; tyres kept', () => {
  let s = createArea(emptyState(), { id: 'LOC', width: 4, depth: 4, unit: 'grid' });
  s = createArea(s, { id: 'A', width: 6, depth: 4, unit: 'grid' });
  s = createStack(s, { areaId: 'A', x: 0, z: 0, rack: '01' });
  s = addTire(s, 'A-01', { setId: 'SYN-1', customer: 'Sintetički', plate: 'SY-1', brand: 'T', size: '205/55 R16', color: 'crna' });
  const remote = { areas: [{ id: 'r-a', zone: 'a', name: 'Hala', width: '6', depth: '4', unit: 'grid' }, { id: 'r-b', zone: 'B', name: 'B', width: 5, depth: 5, unit: 'm' },
    { id: 'bad', zone: 'X', name: 'x', width: -1, depth: 1, unit: 'm' }],
    positions: [{ id: 'p-a', area_id: 'r-a', rack: '01', x: 1, z: 0, capacity: 8 }, { id: 'p-b', area_id: 'r-b', rack: 'k2', x: 0, z: 0, capacity: 4 }, { area_id: 'nope', rack: '9', x: 0, z: 0 }] };
  const r = mergeRemoteLayout(s, remote);
  assert.equal(r.changed, true);
  assert.deepEqual(r.state.areas.map(a => [a.id, a.remoteId || null]), [['A', 'r-a'], ['B', 'r-b'], ['LOC', null]]);
  assert.deepEqual(r.localOnly, ['LOC']);
  const a01 = r.state.stacks.find(x => x.id === 'A-01');
  assert.deepEqual([a01.x, a01.tireIds.length], [1, 1], 'position synced, tyre kept');
  assert.ok(r.state.stacks.some(x => x.id === 'B-K2' && x.rack === 'K2'));
  assert.deepEqual(r.state.tires, s.tires);
  assert.equal(validateState(r.state).valid, true);
  const again = mergeRemoteLayout(r.state, remote);
  assert.equal(again.changed, false);
  assert.equal(mergeRemoteLayout(s, { areas: [], positions: [] }).changed, false, 'unavailable/empty remote drops nothing local');
});


test('remote position identity follows a moved rack without leaving a duplicate', () => {
  const remote = {areas:[{id:'r-a',zone:'A',name:'A',width:6,depth:6,unit:'grid'}, {id:'r-b',zone:'B',name:'B',width:6,depth:6,unit:'grid'}], positions:[{id:'p-1',area_id:'r-a',rack:'01',x:0,z:0,capacity:8}]};
  let s = mergeRemoteLayout(emptyState(),remote).state;
  s = addTire(s,'A-01',{customer:'Synthetic',plate:'SYN',size:'205/55 R16'});
  const tires=structuredClone(s.tires);
  remote.positions[0].area_id='r-b';
  const result=mergeRemoteLayout(s,remote);
  assert.equal(result.rejected,undefined);
  assert.equal(result.state.stacks.length,1);
  assert.equal(result.state.stacks[0].areaId,'B');
  assert.equal(result.state.stacks[0].remotePositionId,'p-1');
  assert.deepEqual(result.state.tires,tires);
  assert.equal(pinForSet({zone:'A',rack:'01'},result.state.stacks,['A','B']).stackId,null);
});

test('a partial upload remains retryable after its area has been created', () => {
  let s=area(emptyState());s=createStack(s,{areaId:'A',rack:'01',x:0,z:0});
  const result=mergeRemoteLayout(s,{areas:[{id:'r-a',zone:'A',name:'Hala',width:6,depth:4,unit:'grid'}],positions:[]});
  assert.deepEqual(result.localOnly,['A']);
  assert.equal(result.state.stacks.length,1);
  assert.equal(result.state.areas[0].remoteId,'r-a');
});

test('moving a rack onto an existing binding is refused before persistence', () => {
  let s=createArea(area(emptyState()),{id:'B',width:6,depth:4,unit:'grid'});
  for(const areaId of ['A','B'])s=createStack(s,{areaId,rack:'01',x:0,z:0});
  assert.throws(()=>moveStack(s,'A-01',{areaId:'B',x:2,z:0}),/već na karti/);
  assert.equal(validateState(s).valid,true);
});
