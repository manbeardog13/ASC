import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const moduleFrom=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(path,import.meta.url),'utf8')).toString('base64'));
const layout=await moduleFrom('../app/warehouse-preview/building-layout.js');
const inventory=await moduleFrom('../app/warehouse-preview/model.js');
test('original warehouse IDs, stack positions and inventory remain valid',()=>{
 const state=inventory.seedState();assert.equal(inventory.validateState(state).valid,true);
 assert.deepEqual(inventory.AREAS.map(a=>a.id),['2.1','2.2','2.3']);
 assert.deepEqual(inventory.AREAS.map(a=>state.stacks.filter(s=>s.areaId===a.id).length),[87,15,31]);
});
test('warehouse entrance and local coordinates are attached without remapping inventory',()=>{
 assert.deepEqual(layout.planPoint(7,5),{x:0,y:0,z:0});
 assert.deepEqual(layout.planPoint(0,0),{x:5,y:0,z:-7});
 assert.ok(layout.STORAGE_LEVELS['2.2']<layout.STORAGE_LEVELS['2.3']);
 assert.ok(layout.STORAGE_LEVELS['2.3']<layout.ATTIC_LEVEL);
});
test('corrected cars face right; tyre service has only a portable jack',()=>{
 for(const id of ['tyre-service','gate-3'])assert.equal(layout.CAR_POSITIONS.find(c=>c.id===id).heading,0);
 assert.equal(layout.CAR_POSITIONS.find(c=>c.id==='tyre-service').lift,'air-jack');
 assert.equal(layout.CAR_POSITIONS.filter(c=>c.id.startsWith('mechanic')).length,2);
});
test('lunch table hugs the south wall; the new extension is ground-floor only',()=>{
 assert.ok(Math.abs(layout.LUNCH_TABLE.v+layout.LUNCH_TABLE.depth/2)<.11);
 for(const id of ['parts-attic','tyres-attic','office'])assert.equal(layout.buildingView(id),undefined);
 assert.equal(layout.isBuildingView('not-a-room'),false);
});
