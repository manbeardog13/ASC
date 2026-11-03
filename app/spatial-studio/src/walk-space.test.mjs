import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rooms } from './rooms.ts';
import { geometry } from './canvas-geometry.ts';
import {walkGeometry,startWalk,advance} from './walk-space.ts';

test('every walkthrough starts inside its real footprint, respects obstacles and stays on supported floor',()=>{
  const building=geometry.createBuilding(THREE);
  try {
    for(const {id} of rooms){
      const room=geometry.getSpace(id);
      building.setView(id); building.setCutaway('closed');
      const floor=walkGeometry(building.root,room);
      const pose=startWalk(room,floor,[]);
      assert.ok(pose,id);
      assert.equal(floor(pose.x,pose.z,[{x:pose.x,z:pose.z}]),null,'registered rack is solid');
      assert.equal(floor(room.width,room.depth,[]),null,'exterior has no walking surface');
      let total=0;
      for(let i=0;i<170;i++){
        const from={...pose};pose.yaw+=(i%26===0?Math.PI*.63:0);
        advance(pose,.21,0,floor,[]);
        assert.equal(floor(pose.x,pose.z,[]),pose.y,id);
        total+=Math.hypot(pose.x-from.x,pose.z-from.z);
      }
      assert.ok(total>1,id+' can walk through the schematic');
      if(id==='attic-parts'){
        assert.equal(floor(2,-9,[]),null,'L-shaped notch');
        assert.equal(floor(-5.2,-14,[]),null,'white shelf footprint');
      }
      if(id==='triangular-store')assert.equal(floor(-2,-2,[]),null,'triangle cut-off corner');
    }
  } finally {building.dispose();}
});
