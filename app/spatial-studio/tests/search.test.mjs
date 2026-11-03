import test from 'node:test';import assert from 'node:assert/strict';
import {scanValue,makeIndex,matches,occupancy} from '../src/search.ts';
test('legacy and current deep links, real slot links, and corrupted checksums',()=>{
assert.equal(scanValue('https://example.com/#/set/ASC-2026-1234?v=2'),'ASC-2026-1234');
assert.equal(scanValue('https://example.com/app/place.html#/slot/LOC-ABCDEF123456'),'LOC-ABCDEF123456');
assert.equal(scanValue('https://example.com/?code=ASC-2026-1234&k=ZZZZ'),'');
assert.equal(scanValue('javascript:alert(1)'),'');});
test('Croatian text, separators and small misspellings are searchable; capacity boundaries are inclusive',()=>{
const idx=makeIndex(['Jurašević','DU 123 AB','POLICE']);assert.ok(matches(idx,'jurasevič du123'));assert.ok(matches(idx,'polixe'));assert.ok(!matches(idx,'audi'));
assert.deepEqual([null,39,40,85,86].map(n=>occupancy(n,100)),['unknown','low','mid','mid','high']);});
