import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as THREE from '../app/warehouse-preview/vendor/three.module.js';
import {createBuilding} from '../app/warehouse-preview/building.js';

// Geometry only: materials, lights, metadata, batching order and UUIDs are not
// part of this reference. A layout edit requires an explicit owner correction.
export function geometryFingerprint(room){
 const entries=[],instance=new THREE.Matrix4(),world=new THREE.Matrix4();
 const rounded=array=>Array.from(array,value=>Math.round(value*1e6)/1e6);
 room.traverse(object=>{
  if(!object.isMesh)return;
  const vertices=rounded(object.geometry.getAttribute('position').array);
  const indices=object.geometry.index?Array.from(object.geometry.index.array):null;
  const record=matrix=>entries.push(JSON.stringify({vertices,indices,matrix:rounded(matrix.elements)}));
  if(object.isInstancedMesh){for(let i=0;i<object.count;i++){object.getMatrixAt(i,instance);world.multiplyMatrices(object.matrixWorld,instance);record(world);}}
  else record(object.matrixWorld);
 });
 return {meshes:entries.length,sha256:createHash('sha256').update(entries.sort().join('\n')).digest('hex')};
}
test('the refined upper assembly cannot drift while its materials and interface evolve',()=>{
 const reference=JSON.parse(readFileSync(new URL('./fixtures/upper-geometry-reference.json',import.meta.url)));
 const building=createBuilding(THREE);building.setView('upper-assembly');building.setCutaway('closed');building.root.updateMatrixWorld(true);
 assert.deepEqual(geometryFingerprint(building.upperAssembly),reference.assembly,'Upper assembly geometry changed from the owner-corrected layout; review this drift explicitly');
 building.dispose();
});
