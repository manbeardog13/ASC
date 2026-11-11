// Synthetic read-only projection. No database, network, session or real customers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectLiveInventory } from '../app/warehouse-preview/live-inventory.js';

const layout = () => ({ version: 1, revision: 7, history: [{ kind: 'preserve' }],
  areas: [{ id: 'Č1', name: 'Synthetic area', width: 8, depth: 6, unit: 'grid',
    floorRects: [{ x: 0, z: 0, w: 8, d: 6 }], voidRects: [], stair: null }],
  stacks: [{ id: 'position-1', areaId: 'Č1', rack: '01', x: 1, z: -1, radius: .27, capacity: 8, tireIds: ['local-old'] }],
  tires: [{ id: 'local-old', setId: 'local-record', customer: 'Local record retained in source' }] });
const location = (extra = {}) => ({ id: 'loc-1', warehouse: 'main', zone: 'Č1', rack: '01', shelf: '1', slot: '01', status: 'occupied', ...extra });
const set = (extra = {}) => ({ id: 'set-1', public_code: 'SYNTHETIC-001', quantity: 4, status: 'in_storage',
  location_id: 'loc-1', zone: 'Č1', rack: '01', shelf: '1', slot: '01', deleted_at: null, picked_up_at: null,
  vehicle: { id: 'vehicle-1', plate: 'SY-001-NT', customer: { id: 'customer-1', name: 'Synthetic customer' } },
  tires: [{ id: 'tire-1', position: 'FL', brand: 'Synthetic brand', size: '205/55 R16', model: 'Fixture', dot_code: '0126', tread_mm: 7 }], ...extra });
const run = (extra = {}) => projectLiveInventory({ layout: layout(), sets: [set()], locations: [location()], ...extra });
const conserved = result => {
  assert.equal(result.coverage.activeQuantity, result.coverage.mappedQuantity + result.coverage.unplacedQuantity);
  assert.equal(result.coverage.activeSets, result.coverage.mappedSets + result.coverage.unplacedSets);
  assert.equal(result.state.tires.length, result.coverage.mappedQuantity);
  assert.equal(result.state.stacks.reduce((n, s) => n + s.tireIds.length, 0), result.coverage.mappedQuantity);
};
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('projects actual quantity and metadata without writing or retaining fictional local inventory', () => {
  const input = freeze({ layout: layout(), sets: [set()], locations: [location()] });
  const before = structuredClone(input), result = projectLiveInventory(input);
  assert.deepEqual(input, before);
  assert.equal(result.state.readOnly, true);
  assert.equal(result.state.inventorySource, 'storage_sets');
  assert.deepEqual(result.state.areas, before.layout.areas);
  assert.deepEqual(result.state.history, before.layout.history);
  assert.equal(result.state.revision, 7);
  assert.equal(result.state.tires.length, 4);
  assert.equal(result.state.tires.some(t => t.id === 'local-old'), false);
  const actual = result.state.tires.find(t => t.sourceTireId === 'tire-1');
  assert.deepEqual([actual.setId, actual.publicCode, actual.customerId, actual.customer, actual.plate, actual.brand, actual.size],
    ['set-1', 'SYNTHETIC-001', 'customer-1', 'Synthetic customer', 'SY-001-NT', 'Synthetic brand', '205/55 R16']);
  assert.equal(actual.presentationId, true);
  assert.equal(actual.identityKind, 'tire-id');
  assert.deepEqual(result.setPlacements[0].source, before.sets[0]);
  const quantityOnly = result.state.tires.filter(t => t.quantityOnly);
  assert.equal(quantityOnly.length, 3);
  assert.ok(quantityOnly.every(t => t.brand === null && t.size === null && t.sourceTireId === null && t.presentationId));
  result.state.areas[0].name = 'Changed view';
  result.setPlacements[0].source.vehicle.customer.name = 'Changed view';
  assert.deepEqual(input, before, 'Editing returned view does not alter source customer or layout records');
  conserved(result);
});

test('zone normalization is shared with real bindings, but rack numbers are never guessed', () => {
  const result = run({ sets: [set({ zone: ' c\u030c1 ', rack: ' 01 ' }), set({ id: 'different-rack', location_id: 'loc-2', rack: '1', slot: '02' })],
    locations: [location(), location({ id: 'loc-2', rack: '1', slot: '02' })] });
  assert.equal(result.coverage.mappedSets, 1);
  assert.equal(result.unplaced[0].setId, 'different-rack');
  assert.equal(result.unplaced[0].reason, 'unmapped-rack');
  const unbound = layout(); delete unbound.stacks[0].rack; unbound.stacks[0].id = 'Č1-01';
  assert.equal(run({ layout: unbound }).unplaced[0].reason, 'unmapped-rack', 'Legacy stack ID is not a live binding');
  conserved(result);
});

test('exact warehouse isolation follows location IDs and rejects case differences or conflicting text', () => {
  const result = run({ sets: [set(), set({ id: 'other', location_id: 'loc-other' }), set({ id: 'case', location_id: 'loc-case' }),
    set({ id: 'conflict', warehouse: 'other' })], locations: [location(), location({ id: 'loc-other', warehouse: 'other' }), location({ id: 'loc-case', warehouse: 'MAIN' })] });
  assert.equal(result.coverage.mappedQuantity, 4);
  assert.deepEqual(Object.fromEntries(result.unplaced.map(p => [p.setId, p.reason])),
    { case: 'outside-warehouse', conflict: 'location-mismatch', other: 'outside-warehouse' });
  assert.equal(run({ sets: [set({ location_id: 'unknown-id' })] }).unplaced[0].reason, 'location-id-not-found');
  assert.equal(run({ sets: [set({ rack: 'WRONG' })] }).unplaced[0].reason, 'location-mismatch');
  conserved(result);
});

test('legacy rows resolve only a unique full seat across warehouses; no implicit main warehouse', () => {
  assert.equal(run({ sets: [set({ location_id: null })] }).coverage.mappedSets, 1);
  const locations = [location(), location({ id: 'other-seat', warehouse: 'other' })];
  const result = run({ sets: [set({ location_id: null })], locations });
  assert.equal(result.unplaced[0].reason, 'ambiguous-location');
  assert.equal(run({ sets: [set({ location_id: null, warehouse: 'main' })], locations }).coverage.mappedSets, 1);
  assert.equal(run({ sets: [set({ location_id: null, slot: '02' })] }).unplaced[0].reason, 'location-not-found');
  assert.equal(run({ sets: [set({ location_id: null })], locations: [location({ warehouse: 'other' })] }).unplaced[0].reason, 'outside-warehouse');
  conserved(result);
});

test('deleted, checked out, missing, unknown-status and picked-up sets are explicit exclusions', () => {
  const sets = [set(), set({ id: 'reserved', status: 'reserved' }), set({ id: 'deleted', deleted_at: '2026-01-01' }),
    set({ id: 'out', status: 'checked_out' }), set({ id: 'missing', status: 'missing' }),
    set({ id: 'unknown', status: 'future-status' }), set({ id: 'picked', picked_up_at: '2026-01-01' })];
  const result = run({ sets });
  assert.equal(result.coverage.activeSets, 2);
  assert.equal(result.coverage.excludedSets, 5);
  assert.deepEqual(result.state.stacks[0].setIds, ['reserved', 'set-1']);
  assert.equal(result.excluded.find(s => s.setId === 'deleted').reason, 'deleted');
  assert.equal(result.excluded.find(s => s.setId === 'picked').reason, 'picked-up');
  conserved(result);
});

test('mixed-owner rack retains both complete sets, selected subset, and all tires above capacity', () => {
  const result = run({ selectedSetId: 'second', sets: [set(), set({ id: 'second', public_code: 'SYNTHETIC-002', quantity: 7,
    location_id: 'loc-2', slot: '02', tires: [], vehicle: { plate: 'SY-002-NT', customer: { name: 'Second synthetic customer' } } })],
    locations: [location(), location({ id: 'loc-2', slot: '02' })] });
  const stack = result.state.stacks[0];
  assert.equal(stack.capacity, 8, 'Configured capacity is preserved');
  assert.equal(stack.tireIds.length, 11, 'Capacity never slices actual inventory');
  assert.equal(stack.occupiedQuantity, 11);
  assert.equal(stack.overflowQuantity, 3);
  assert.equal(result.coverage.overflowQuantity, 3);
  assert.equal(result.coverage.overflowStacks, 1);
  assert.equal(result.selectedTireIds.length, 7);
  assert.deepEqual(stack.selectedTireIds, result.selectedTireIds);
  assert.ok(result.state.tires.filter(t => result.selectedTireIds.includes(t.id)).every(t => t.setId === 'second'));
  assert.equal(new Set(stack.tireIds).size, 11);
  assert.ok(result.issues.some(i => i.reason === 'capacity-overflow' && i.quantity === 11));
  conserved(result);
});

test('missing areas, rack mappings and invalid locations remain visible in coverage', () => {
  const sets = [set({ id: 'area', location_id: 'area-loc', zone: 'B' }),
    set({ id: 'rack', location_id: 'rack-loc', rack: '02' }),
    set({ id: 'bad', location_id: null, zone: '<bad>' }), set({ id: 'blocked', location_id: 'blocked-loc', slot: '03' })];
  const result = run({ sets, locations: [location({ id: 'area-loc', zone: 'B' }), location({ id: 'rack-loc', rack: '02' }),
    location({ id: 'blocked-loc', slot: '03', status: 'blocked' }), location({ id: 'invalid-record', zone: '<bad>' })] });
  assert.deepEqual(Object.fromEntries(result.unplaced.map(p => [p.setId, p.reason])),
    { area: 'unmapped-area', bad: 'invalid-location', blocked: 'blocked-location', rack: 'unmapped-rack' });
  assert.equal(result.coverage.unplacedQuantity, 16);
  assert.equal(result.coverage.invalidLocationRecords, 1);
  assert.equal(result.state.tires.length, 0);
  conserved(result);
});

test('ambiguous normalized locations, duplicate areas and duplicate rack bindings never choose the first match', () => {
  assert.equal(run({ locations: [location(), location({ id: 'duplicate', zone: 'č1' })] }).unplaced[0].reason, 'ambiguous-location');
  const duplicateArea = layout(); duplicateArea.areas.push({ ...duplicateArea.areas[0], id: 'č1' });
  assert.equal(run({ layout: duplicateArea }).unplaced[0].reason, 'ambiguous-area');
  const duplicateRack = layout(); duplicateRack.stacks.push({ ...duplicateRack.stacks[0], id: 'second-position' });
  assert.equal(run({ layout: duplicateRack }).unplaced[0].reason, 'ambiguous-rack');
  const invalidStack = layout(); invalidStack.stacks[0].x = NaN;
  assert.equal(run({ layout: invalidStack }).unplaced[0].reason, 'invalid-stack');
});

test('stable identities survive query ordering and retain real individual IDs or explicit presentation keys', () => {
  const details = [{ position: 'FR', brand: 'B', size: 'S' }, { position: 'FL', brand: 'A', size: 'S' }, { id: 'real-id', position: 'RL', brand: 'C' }];
  const source = set({ tires: details });
  const first = run({ sets: [source] });
  const second = run({ sets: [{ ...source, tires: [...details].reverse() }] });
  assert.deepEqual(first.state.tires, second.state.tires);
  assert.equal(first.state.tires.find(t => t.position === 'FL').identityKind, 'set-position');
  assert.equal(first.state.tires.find(t => t.sourceTireId === 'real-id').identityKind, 'tire-id');
  const quantityOnly = run({ sets: [set({ tires: [] })] });
  assert.deepEqual(quantityOnly.state.tires.map(t => t.id), run({ sets: [set({ tires: [] })] }).state.tires.map(t => t.id));
  assert.ok(quantityOnly.state.tires.every(t => t.identityKind === 'set-quantity-ordinal' && t.presentationId));
  conserved(first);
});

test('invalid quantity, duplicate source IDs and conflicting tire counts do not get silently repaired', () => {
  for (const quantity of [null, undefined, '4', 0, -1, 1.5, NaN]) {
    const result = run({ sets: [set({ quantity })] });
    assert.equal(result.unplaced[0].reason, 'invalid-quantity');
    assert.equal(result.coverage.unknownQuantitySets, 1);
    conserved(result);
  }
  const extraDetails = run({ sets: [set({ quantity: 1, tires: [{ id: 'one' }, { id: 'two' }] })] });
  assert.equal(extraDetails.unplaced[0].reason, 'tire-count-exceeds-quantity');
  assert.equal(extraDetails.unplaced[0].source.tires.length, 2, 'All contradictory source detail is still reviewable');
  assert.equal(run({ sets: [set({ tires: [{ id: 'duplicate' }, { id: 'duplicate' }] })] }).unplaced[0].reason, 'duplicate-tire-id');
  assert.equal(run({ sets: [set({ tires: { id: 'not-a-list' } })] }).unplaced[0].reason, 'invalid-tire-details');
  const duplicated = run({ sets: [set(), set()] });
  assert.ok(duplicated.unplaced.every(p => p.reason === 'duplicate-set-id'));
  conserved(duplicated);
});

test('conflicting live occupancy is reported without discarding either real set', () => {
  const result = run({ sets: [set(), set({ id: 'second-set', tires: [] })] });
  assert.equal(result.coverage.conflictingLocations, 1);
  assert.equal(result.coverage.mappedQuantity, 8);
  const conflict = result.issues.find(issue => issue.reason === 'multiple-active-sets-at-location');
  assert.deepEqual(conflict.setIds, ['second-set', 'set-1']);
  conserved(result);
});

test('render budget reports a whole unplaced set and never trims a large quantity', () => {
  const result = run({ maxTires: 3 });
  assert.equal(result.state.tires.length, 0);
  assert.equal(result.unplaced[0].reason, 'scene-budget-exceeded');
  assert.equal(result.unplaced[0].quantity, 4);
  assert.equal(result.coverage.unplacedQuantity, 4);
  conserved(result);
});

test('loading failures cannot be represented as empty successful inventory', () => {
  assert.throws(() => run({ sets: null }), TypeError);
  assert.throws(() => run({ locations: null }), TypeError);
  assert.throws(() => run({ maxTires: Infinity }), TypeError);
  const empty = run({ sets: [], locations: [] });
  assert.equal(empty.coverage.activeSets, 0);
  assert.deepEqual(empty.state.stacks[0].tireIds, []);
});
