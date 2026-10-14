import test from 'node:test';
import assert from 'node:assert/strict';
import { expandLocations } from '../js/locationGrid.js';

test('numeric ranges keep padding and stay under the cap', () => {
  const rows = expandLocations({ warehouse: 'main', zone: 'A', racks: '01-02', shelves: '1', slots: '01-03' });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { warehouse: 'main', zone: 'A', rack: '01', shelf: '1', slot: '01' });
  assert.equal(rows.at(-1).slot, '03');
  assert.throws(() => expandLocations({ racks: '1-30', shelves: '1-10', slots: '1-10' }, 40), { code: 'location_cap' });
});
