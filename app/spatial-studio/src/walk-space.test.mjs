import assert from "node:assert/strict";
import test from "node:test";
import * as T from "three";
import { rooms } from "./rooms.ts";
import { geometry } from "./canvas-geometry.ts";
import { startWalk, walkGeometry, advance } from "./walk-space.ts";

function setup(id) {
  const building = geometry.createBuilding(T);
  building.setView(id);
  building.setCutaway("closed");
  const room = geometry.getSpace(id);
  return {building, room, floor:walkGeometry(building.root,room)};
}
test("each of the six real room schematics has a free, traversable eye-level starting point", () => {
  for (const {id} of rooms) {
    const {building,room,floor} = setup(id);
    try {
      const pose = startWalk(room,floor,[]);
      assert.ok(pose,id);
      const start = {...pose};
      advance(pose,.5,0,floor,[]);
      assert.ok(Math.hypot(pose.x-start.x,pose.z-start.z)>.4,id);
      // A long move cannot cross a void, diagonal wall or edge of a gallery.
      for (let direction = 0; direction < 8; direction++) {
        const trial = {...pose,yaw:direction*Math.PI/4};
        advance(trial,40,0,floor,[]);
        assert.notEqual(floor(trial.x,trial.z,[]),null,id);
        assert.ok(geometry.hasBuildingFloor(id,trial.x,trial.z,.25),id);
      }
    } finally { building.dispose(); }
  }
});
test("walking stops at a live rack, the model shelves and unsupported gaps", () => {
  const {building,room,floor} = setup("attic-parts");
  try {
    assert.equal(floor(-5.2,0,[]),null); // west shelf row
    assert.equal(floor(2,-9,[]),null);  // office notch
    const pose = startWalk(room,floor,[]);
    const rack = {x:pose.x,z:pose.z-1};
    advance(pose,2,0,floor,[rack]);
    assert.ok(pose.z>rack.z+.49);
  } finally { building.dispose(); }
});
test("the raised deck can be reached by its modelled steps, not through its vertical side", () => {
  const {building,room,floor} = setup("attic-racks");
  try {
    const stepsStart = {x:0,z:6,y:room.y,yaw:0,pitch:0};
    advance(stepsStart,7,0,floor,[]);
    assert.ok(Math.abs(stepsStart.y-room.y-room.platform.rise)<.01);
    const side = {x:-3.8,z:-4,y:room.y,yaw:Math.PI/2,pitch:0};
    advance(side,3,0,floor,[]);
    assert.equal(side.y,room.y);
  } finally { building.dispose(); }
});

test('every walkthrough starts inside its real footprint, respects obstacles and stays on supported floor',()=>{
  const building=geometry.createBuilding(T);
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
