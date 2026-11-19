import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTireSizes, photoFollowUp } from '../app/intake-size.js';

const blank = () => ({ size: '', explicit: false, fromQuick: false });

test('a rejected submit does not keep the first quick size', () => {
  const first = nextTireSizes([blank(), blank(), blank(), blank()], '205/55R16');
  assert.equal(first.every((row) => row.size === '205/55R16' && row.fromQuick), true);
  const corrected = nextTireSizes(first, '225/45R17');
  assert.equal(corrected.every((row) => row.size === '225/45R17' && row.fromQuick), true);
});

test('an explicit tire size survives a later quick-size change', () => {
  const rows = [
    { size: '195/65R15', explicit: true, fromQuick: false },
    { size: '205/55R16', explicit: false, fromQuick: true },
  ];
  const next = nextTireSizes(rows, '225/45R17');
  assert.equal(next[0].size, '195/65R15');
  assert.equal(next[1].size, '225/45R17');
});

test('clearing quick size clears only the rows it filled', () => {
  const rows = [
    { size: '205/55R16', explicit: false, fromQuick: true },
    { size: '195/65R15', explicit: true, fromQuick: false },
    { size: '225/40R18', explicit: false, fromQuick: false },
  ];
  const next = nextTireSizes(rows, '');
  assert.equal(next[0].size, '');
  assert.equal(next[0].fromQuick, false);
  assert.equal(next[1].size, '195/65R15');
  assert.equal(next[2].size, '225/40R18');
});

test('a failed photo stays visible beside the saved confirmation', () => {
  assert.deepEqual(photoFollowUp({ hasFile: true, uploaded: false }), { confirm: true, notice: true, stay: true });
  assert.deepEqual(photoFollowUp({ hasFile: true, uploaded: true }), { confirm: true, notice: false, stay: false });
  assert.deepEqual(photoFollowUp({ hasFile: false, uploaded: false }), { confirm: true, notice: false, stay: false });
});
