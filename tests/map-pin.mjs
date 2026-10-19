import test from 'node:test';
import assert from 'node:assert/strict';
import { pinForSet } from '../js/mapPin.js';

test('with no stacks or areas the pin is a graceful no-op', () => {
  const pin = pinForSet({ public_code: 'ASC-1', zone: '2.1', rack: 'A', shelf: '1', slot: '2' });
  assert.equal(pin.stackId, null);
  assert.equal(pin.areaId, null);
  assert.equal(pin.approx, true);
  assert.equal(pin.where, '2.1 · A · 1 · 2');
  assert.equal(pin.label, 'ASC-1 · 2.1 · A · 1 · 2');
  assert.equal(pinForSet(null).stackId, null);
});

test('a real area and rack selects that stack, still approximate', () => {
  const stacks = [{ id: 'P-S001', areaId: 'P' }, { id: 'K-S025', areaId: 'K' }];
  const pin = pinForSet({ public_code: 'ASC-2', zone: 'K', rack: 'S025' }, stacks, ['P', 'K']);
  assert.equal(pin.stackId, 'K-S025');
  assert.equal(pin.areaId, 'K');
  assert.equal(pin.approx, true);
});

test('an unknown zone or rack is never guessed onto a stack', () => {
  const stacks = [{ id: 'P-S001', areaId: 'P' }];
  assert.equal(pinForSet({ zone: 'X', rack: 'S001' }, stacks, ['P']).stackId, null);
  const pin = pinForSet({ zone: 'P', rack: 'S999' }, stacks, ['P']);
  assert.equal(pin.areaId, 'P');
  assert.equal(pin.stackId, null);
  assert.equal(pin.approx, true);
});
