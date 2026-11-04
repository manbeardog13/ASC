import assert from 'node:assert/strict';
import test from 'node:test';
import {rooms} from './rooms.ts';
import {geometry} from './canvas-geometry.ts';
import {geometryProvenance} from './geometry-provenance.ts';

test('all six public room extents match the rendered geometry without adding the office to inventory',()=>{
 assert.deepEqual(rooms.map(r=>r.id),[
  'house-ground','house-platform','house-attic','attic-parts','attic-racks','triangular-store',
 ]);
 for(const room of rooms){
  const space=geometry.getSpace(room.id);
  assert.ok(space,room.id);
  assert.equal(room.width,space.width,room.id);
  assert.equal(room.depth,space.depth,room.id);
 }
});

test('metre-based operational dimensions cannot promote any public architecture to a measured plan',()=>{
 for(const room of rooms){
  assert.ok(geometry.getSpace(room.id));
  for(const unit of [undefined,'grid','m']){
   const evidence=geometryProvenance(true,unit);
   assert.equal(evidence.kind,'schematic',room.id);
   assert.equal(evidence.label,'Shematski prikaz');
   assert.match(evidence.detail,/spojevi nisu potvrđeni/);
   assert.doesNotMatch(evidence.label,/Mjereni/);
  }
 }
});

test('unbound operator plans describe recorded dimensions without claiming a surveyed building',()=>{
 const metres=geometryProvenance(false,'m');
 assert.equal(metres.kind,'recorded-layout');
 assert.equal(metres.label,'Tlocrt prema evidenciji');
 assert.equal(metres.detail,'dimenzije rasporeda u metrima');
 const grid=geometryProvenance(false,'grid');
 assert.equal(grid.detail,'dimenzije rasporeda u poljima mreže');
});
