import test from 'node:test';
import assert from 'node:assert/strict';
import { pinForSet } from '../js/mapPin.js';

const stacks = [
  { id: '2.1-S001', areaId: '2.1' },
  { id: '2.3-S025', areaId: '2.3' },
];

test('a known floor and rack selects that stack', () => {
  const pin = pinForSet({ public_code: 'ASC-1', zone: '2.3', rack: 'S025', shelf: '1', slot: '2' }, stacks);
  assert.equal(pin.stackId, '2.3-S025');
  assert.equal(pin.areaId, '2.3');
  assert.equal(pin.approx, false);
});

test('an unknown zone is pinned approximately on the ground floor', () => {
  const pin = pinForSet({ public_code: 'ASC-2', zone: 'A', rack: '01', shelf: '1', slot: '1' }, stacks);
  assert.equal(pin.areaId, '2.1');
  assert.equal(pin.approx, true);
  assert.equal(pin.stackId, '2.1-S001');
});
