// Actual database adapter with a synthetic transport. No production access.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/db.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
async function client(replies = []) {
  const calls = [];
  const supabase = { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({}) }, from(table) {
    const call = { table, steps: [] }; calls.push(call);
    const builder = new Proxy({}, { get(_target, method) {
      if (method === 'then') return (resolve, reject) => {
        const queue = Array.isArray(replies) ? replies : replies[table];
        assert.ok(queue?.length, 'unexpected database request for ' + table);
        return Promise.resolve(queue.shift()).then(resolve, reject);
      };
      return (...args) => { call.steps.push([method, ...args]); return builder; };
    } }); return builder;
  } };
  const context = vm.createContext({ console, window: { addEventListener() {} }, URL, URLSearchParams, Date, Map, Set, Promise });
  const mod = new vm.SourceTextModule(source, { context });
  const dependencies = { './supabaseClient.js': { supabase }, './config.js': { config: {} }, './images.js': { compressImage() {} },
    './offline.js': { isOnline: () => true, enqueue() {}, initOffline() {}, replay: async () => {} }, './store.js': { rememberLocation() {} } };
  await mod.link(spec => {
    const values = dependencies[spec]; assert.ok(values, 'unexpected import ' + spec);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await mod.evaluate(); return { db: mod.namespace, calls };
}
const binding = { warehouse: 'main', space_id: 'attic-parts', area_id: 'synthetic-area' };

test('binding reader scopes every request to an explicit warehouse', async () => {
  const c = await client([{ data: [binding] }, { data: [] }, { data: [] }]);
  assert.deepEqual(plain(await c.db.listWarehouseSpaceBindings()), { available: true, bindings: [binding] });
  assert.deepEqual(plain(await c.db.listWarehouseSpaceBindings('other')), { available: true, bindings: [] });
  assert.deepEqual(c.calls.map(call => call.table), ['warehouse_space_bindings', 'warehouse_space_bindings', 'warehouse_space_bindings']);
  assert.deepEqual(plain(c.calls.map(call => call.steps.find(step=>step[0]==='eq'))), [['eq', 'warehouse', 'main'], ['eq', 'warehouse', 'main'], ['eq', 'warehouse', 'other']]);
});

test('missing binding migration is distinct from denied access or transport failure', async () => {
  for (const code of ['42P01', 'PGRST205']) {
    const c = await client([{ error: { code, message: 'table missing' } }]);
    assert.deepEqual(plain(await c.db.listWarehouseSpaceBindings()), { available: false, bindings: [] });
  }
  for (const error of [{ code: '42501', message: 'permission denied' }, { message: 'Failed to fetch' }]) {
    const c = await client([{ error }]); await assert.rejects(c.db.listWarehouseSpaceBindings());
  }
});

test('binding save uses compound unique identity and only writes binding data', async () => {
  const c = await client([{ data: binding }]);
  assert.deepEqual(plain(await c.db.saveWarehouseSpaceBinding({ ...binding, customer: 'must not be sent', created_by: 'spoof' })), binding);
  assert.equal(c.calls[0].table, 'warehouse_space_bindings');
  assert.deepEqual(plain(c.calls[0].steps[0]), ['upsert', binding, { onConflict: 'warehouse,space_id' }]);
  assert.deepEqual(c.calls[0].steps.at(-1), ['single'], 'A returned row confirms the shared write');
});

test('binding delete requires both warehouse and space and confirms a returned row', async () => {
  const row = { ...binding, warehouse: 'other' }, c = await client([{ data: row }]);
  assert.deepEqual(plain(await c.db.deleteWarehouseSpaceBinding(row)), row);
  assert.deepEqual(plain(c.calls[0].steps.slice(0, 3)), [['delete'], ['eq', 'warehouse', 'other'], ['eq', 'space_id', 'attic-parts']]);
  assert.deepEqual(c.calls[0].steps.at(-1), ['single']);
});

test('missing, denied, stale, or empty write results cannot be acknowledged as saved', async () => {
  for (const operation of ['saveWarehouseSpaceBinding', 'deleteWarehouseSpaceBinding']) {
    const absent = await client([{ error: { code: '42P01', message: 'relation missing' } }]);
    await assert.rejects(absent.db[operation](binding), error => error.code === 'warehouse_space_bindings_unavailable' && /approval/.test(error.message));
    for (const response of [{ error: { code: '42501', message: 'permission denied' } },
      { error: { code: 'PGRST116', message: 'Expected one row, got zero' } }, { data: null }]) {
      const c = await client([response]); await assert.rejects(c.db[operation](binding));
    }
  }
});

test('office, arbitrary spaces, empty areas and empty warehouses cannot trigger writes', async () => {
  const c = await client();
  for (const bad of [{ ...binding, space_id: 'office' }, { ...binding, space_id: 'unknown' },
    { ...binding, space_id: undefined }, { ...binding, area_id: '' }, { ...binding, warehouse: '' }]) {
    await assert.rejects(c.db.saveWarehouseSpaceBinding(bad));
  }
  await assert.rejects(c.db.deleteWarehouseSpaceBinding({ space_id: 'office' }));
  assert.equal(c.calls.length, 0);
  for (const space_id of ['house-ground', 'house-platform', 'house-attic', 'attic-parts', 'attic-racks', 'triangular-store']) {
    const row = { ...binding, space_id }, valid = await client([{ data: row }]);
    assert.equal((await valid.db.saveWarehouseSpaceBinding(row)).space_id, space_id);
  }
});

test('location seat reader includes canonical IDs so live sets cannot fall into a different warehouse', async () => {
  const row = { id: 'location-id', warehouse: 'other', zone: 'A', rack: '01', shelf: '1', slot: '01', status: 'occupied' };
  const c = await client([{ data: [row] }]);
  assert.deepEqual(plain(await c.db.listLocationSeats()), [row]);
  assert.equal(c.calls[0].table, 'locations');
  assert.match(c.calls[0].steps[0][1], /^id,/);
  assert.equal(c.calls[0].steps.length, 1, 'All warehouses remain available for exact location_id resolution');
});

const inventoryRow = n => ({ id: String(n).padStart(8, '0'), quantity: 4, status: n % 2 ? 'in_storage' : 'checked_out' });
test('complete warehouse source loads more than 1000 sets and locations without dropping real quantities', async () => {
  const sets = Array.from({ length: 1501 }, (_, n) => inventoryRow(n));
  const locations = Array.from({ length: 1203 }, (_, n) => ({ id: String(n).padStart(8, '0'), warehouse: n % 2 ? 'main' : 'other' }));
  const c = await client({ storage_sets: [{ data: sets.slice(0, 1000) }, { data: sets.slice(1000) }, { data: [] }],
    locations: [{ data: locations.slice(0, 1000) }, { data: locations.slice(1000) }, { data: [] }] });
  const result = await c.db.listWarehouseInventory();
  assert.deepEqual(plain(result.sets), sets);
  assert.deepEqual(plain(result.locations), locations);
  assert.equal(result.sets.reduce((n, row) => n + row.quantity, 0), 6004);
  assert.equal(new Set(result.sets.map(row => row.id)).size, 1501);
  assert.ok(result.readStartedAt <= result.readCompletedAt);
  const setCalls = c.calls.filter(call => call.table === 'storage_sets');
  assert.match(setCalls[0].steps[0][1], /tires \( id, size/);
  assert.ok(setCalls.every(call => call.steps.some(step => step[0] === 'is' && step[1] === 'deleted_at' && step[2] === null)));
  assert.ok(setCalls.every(call => !call.steps.some(step => step[0] === 'in' && step[1] === 'status')), 'Inactive real sets stay searchable');
  assert.deepEqual(plain(setCalls[1].steps.at(-1)), ['gt', 'id', '00000999']);
  assert.deepEqual(plain(setCalls[2].steps.at(-1)), ['gt', 'id', '00001500']);
  assert.ok(c.calls.filter(call => call.table === 'locations').every(call => !call.steps.some(step => step[0] === 'eq' && step[1] === 'warehouse')),
    'Keep every warehouse for canonical location-ID resolution');
});

test('short server-limited pages never signal premature completion', async () => {
  const c = await client({ storage_sets: [{ data: [inventoryRow(1), inventoryRow(2)] }, { data: [inventoryRow(3)] }, { data: [] }],
    locations: [{ data: [{ id: 'loc-1' }] }, { data: [{ id: 'loc-2' }] }, { data: [] }] });
  const result = await c.db.listWarehouseInventory();
  assert.equal(result.sets.length, 3);
  assert.equal(result.locations.length, 2);
  assert.equal(c.calls.length, 6);
  assert.ok(c.calls.every(call => call.steps.some(step => step[0] === 'limit' && step[1] === 1000)));
});

test('a failed or malformed later inventory page rejects the complete refresh', async () => {
  for (const next of [{ error: { message: 'Failed to fetch' } }, { data: null },
    { data: [inventoryRow(1)] }, { data: [inventoryRow(0)] }, { data: [{ quantity: 4 }] }]) {
    const c = await client({ storage_sets: [{ data: [inventoryRow(1)] }, next], locations: [{ data: [] }] });
    await assert.rejects(c.db.listWarehouseInventory());
  }
  const missingLocations = await client({ storage_sets: [{ data: [] }], locations: [{ error: { code: '42P01', message: 'relation missing' } }] });
  await assert.rejects(missingLocations.db.listWarehouseInventory(), 'Missing locations is not an empty complete inventory');
});

test('old schemas retry each requested set page without location_id and keep the same cursor', async () => {
  const absent = { error: { code: '42703', message: 'column location_id does not exist' } };
  const c = await client({ storage_sets: [absent, { data: [inventoryRow(1)] }, absent, { data: [] }], locations: [{ data: [] }] });
  assert.equal((await c.db.listWarehouseInventory()).sets.length, 1);
  const calls = c.calls.filter(call => call.table === 'storage_sets');
  assert.match(calls[0].steps[0][1], /location_id/);
  assert.doesNotMatch(calls[1].steps[0][1], /location_id/);
  assert.deepEqual(plain(calls[2].steps.at(-1)), ['gt', 'id', '00000001']);
  assert.deepEqual(plain(calls[3].steps.at(-1)), ['gt', 'id', '00000001']);
});

test('shared layouts read every rack beyond 1000 instead of leaving a fresh device incomplete', async () => {
  const positions = Array.from({ length: 1501 }, (_, n) => ({ id: String(n).padStart(8, '0'), area_id: 'area-main', rack: String(n) }));
  const c = await client({ warehouse_areas: [{ data: [{ id: 'area-main', warehouse: 'main' }] }, { data: [] }],
    warehouse_rack_positions: [{ data: positions.slice(0, 1000) }, { data: positions.slice(1000) }, { data: [] }] });
  const result = await c.db.listWarehouseLayout();
  assert.equal(result.available, true);
  assert.deepEqual(plain(result.positions), positions);
  const calls = c.calls.filter(call => call.table === 'warehouse_rack_positions');
  assert.deepEqual(plain(calls[1].steps.at(-1)), ['gt', 'id', '00000999']);
  assert.deepEqual(plain(calls[2].steps.at(-1)), ['gt', 'id', '00001500']);
  assert.ok(calls.every(call => call.steps.some(step => step[0] === 'in' && step[1] === 'area_id' && step[2].join() === 'area-main')));
});

test('all shared areas are read and rack query URLs stay bounded independently of page limits', async () => {
  const areas = Array.from({ length: 1001 }, (_, n) => ({ id: String(n).padStart(8, '0'), warehouse: 'main' }));
  const c = await client({ warehouse_areas: [{ data: areas.slice(0, 1000) }, { data: areas.slice(1000) }, { data: [] }],
    warehouse_rack_positions: Array.from({ length: 11 }, () => ({ data: [] })) });
  const result = await c.db.listWarehouseLayout();
  assert.deepEqual(plain(result.areas), areas);
  const requested = c.calls.filter(call => call.table === 'warehouse_rack_positions').map(call => call.steps.find(step => step[0] === 'in')[2]);
  assert.ok(requested.every(ids => ids.length <= 100));
  assert.deepEqual(plain(requested.flat()), areas.map(area => area.id));
});

test('short pages of areas, racks and space bindings continue until an empty page', async () => {
  const c = await client({ warehouse_areas: [{ data: [{ id: 'a', warehouse: 'main' }] }, { data: [{ id: 'b', warehouse: 'main' }] }, { data: [] }],
    warehouse_rack_positions: [{ data: [{ id: 'one', area_id: 'a' }] }, { data: [{ id: 'two', area_id: 'b' }] }, { data: [] }] });
  const result = await c.db.listWarehouseLayout();
  assert.equal(result.areas.length, 2); assert.equal(result.positions.length, 2);
  const rows = ['attic-parts', 'house-ground', 'triangular-store'].map((space_id, n) => ({ warehouse: 'main', space_id, area_id: 'area-' + n }));
  const bindings = await client([...rows.map(row => ({ data: [row] })), { data: [] }]);
  assert.deepEqual(plain((await bindings.db.listWarehouseSpaceBindings()).bindings), rows);
  assert.deepEqual(plain(bindings.calls[1].steps.at(-1)), ['gt', 'space_id', 'attic-parts']);
  assert.deepEqual(plain(bindings.calls.at(-1).steps.at(-1)), ['gt', 'space_id', 'triangular-store']);
});

test('later shared-layout failures cannot return earlier pages as a successful complete layout', async () => {
  for (const next of [{ error: { message: 'Failed to fetch' } }, { data: null }, { data: [{ id: 'p', area_id: 'a' }] }]) {
    const c = await client({ warehouse_areas: [{ data: [{ id: 'a', warehouse: 'main' }] }, { data: [] }],
      warehouse_rack_positions: [{ data: [{ id: 'p', area_id: 'a' }] }, next] });
    await assert.rejects(c.db.listWarehouseLayout());
  }
  const missing = await client({ warehouse_areas: [{ data: [{ id: 'a', warehouse: 'main' }] }, { data: [] }],
    warehouse_rack_positions: [{ data: [{ id: 'p', area_id: 'a' }] }, { error: { code: '42P01', message: 'relation missing' } }] });
  assert.deepEqual(plain(await missing.db.listWarehouseLayout()), { available: false, areas: [], positions: [] });
  const wrongScope = await client({ warehouse_areas: [{ data: [{ id: 'a', warehouse: 'main' }] }, { data: [] }],
    warehouse_rack_positions: [{ data: [{ id: 'p', area_id: 'other-warehouse-area' }] }, { data: [] }] });
  await assert.rejects(wrongScope.db.listWarehouseLayout());
  const badBindings = await client([{ data: [binding] }, { error: { message: 'Failed to fetch' } }]);
  await assert.rejects(badBindings.db.listWarehouseSpaceBindings());
  const missingBindings = await client([{ data: [binding] }, { error: { code: 'PGRST205', message: 'relation missing' } }]);
  assert.deepEqual(plain(await missingBindings.db.listWarehouseSpaceBindings()), { available: false, bindings: [] });
});
