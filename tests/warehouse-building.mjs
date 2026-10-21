import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../app/warehouse-preview/vendor/three.module.js';
import { createBuilding, SPACE_MANIFEST, BUILDING_TOPOLOGY, DIMENSIONS_UNMEASURED, UPPER_SPACE_IDS, UPPER_ASSEMBLY_TRANSFORM, getSpace, hasBuildingFloor, mapAreaPoint, unmapAreaPoint } from '../app/warehouse-preview/building.js';
import { emptyState, AREAS } from '../app/warehouse-preview/model.js';

test('architectural context does not create operational areas or inventory',()=>{
  const before=JSON.stringify(emptyState()), areas=JSON.stringify(AREAS);
  const scene=createBuilding(THREE);
  assert.equal(JSON.stringify(emptyState()),before);assert.equal(JSON.stringify(AREAS),areas);
  assert.equal(DIMENSIONS_UNMEASURED,true);assert.equal(BUILDING_TOPOLOGY.inventorySeeded,false);
  assert.equal(SPACE_MANIFEST.filter(s=>s.inventory).length,6);assert.equal(getSpace('office').inventory,false);
  assert.equal(scene.rooms.size,10);assert.ok(scene.targets.length>=6);
  assert.ok(scene.targets.every(t=>t.userData.spaceId&&t.userData.inventory===false));
  scene.dispose();
});

test('recovered house floor openings and platform stay intact',()=>{
  assert.deepEqual(getSpace('house-platform').floorRects,[{x:0,z:2.93,w:5,d:5.42}]);
  assert.deepEqual(getSpace('house-attic').floorRects,[{x:0,z:-3.35,w:10,d:7.3},{x:.825,z:3.65,w:4.35,d:6.7}]);
  assert.equal(hasBuildingFloor('house-attic',-3.5,4),false);assert.equal(hasBuildingFloor('house-attic',4.5,4),false);
  assert.equal(hasBuildingFloor('house-attic',0,4),true);assert.equal(hasBuildingFloor('house-attic',-4,-4),true);
  assert.equal(hasBuildingFloor('house-platform',4,3),false);
});

test('L-shaped attic excludes the office and keeps both bordering arms',()=>{
  assert.equal(hasBuildingFloor('attic-parts',2,-9),false);
  assert.equal(hasBuildingFloor('attic-parts',-4,-9),true);
  assert.equal(hasBuildingFloor('attic-parts',2,7),true);
  assert.equal(BUILDING_TOPOLOGY.joins.length,4);
  assert.ok(BUILDING_TOPOLOGY.joins.every(j=>!j.a.startsWith('house-')&&!j.b.startsWith('house-')));
});

test('only three west gates and one shared house stair are constructed',()=>{
  const scene=createBuilding(THREE), stairs=[];
  scene.root.traverse(o=>{if(o.userData.stairId)stairs.push(o);});
  assert.equal(stairs.length,1);assert.equal(stairs[0].userData.stairId,'house-shared-stair');
  assert.equal(BUILDING_TOPOLOGY.gates.length,3);assert.ok(BUILDING_TOPOLOGY.gates.every(g=>g.wall==='west'&&g.x===-17));
  scene.dispose();
});

test('explicit mapping round-trips but refuses voids, office, invalid or unknown bindings',()=>{
  const area={width:10,depth:14};const p=mapAreaPoint('house-attic',area,1,-2);
  assert.deepEqual(unmapAreaPoint('house-attic',area,p.x,p.z),{x:1,z:-2});
  assert.equal(mapAreaPoint('house-attic',area,-4,4),null);
  assert.equal(mapAreaPoint('office',area,0,0),null);assert.equal(mapAreaPoint('unknown',area,0,0),null);
  assert.equal(mapAreaPoint('house-attic',{width:0,depth:1},0,0),null);
  const raised=mapAreaPoint('attic-racks',{width:10,depth:18},0,-3.5);
  assert.equal(raised.y,5.4);assert.equal(raised.unmeasured,true);
});

test('cutaway modes and selected room views change architecture only',()=>{
  const scene=createBuilding(THREE);scene.setCutaway('closed');assert.ok(scene.roofs.every(r=>r.visible&&r.material.opacity===1));
  assert.ok(scene.roofStructure.every(r=>r.visible));
  scene.setCutaway('open');assert.ok(scene.roofs.every(r=>!r.visible));assert.ok(scene.roofStructure.every(r=>!r.visible));
  scene.setView('office');assert.equal(scene.rooms.get('office').visible,true);assert.equal(scene.rooms.get('attic-racks').visible,false);
  scene.setView('all');assert.equal(scene.upperAssembly.visible,false);assert.equal(scene.rooms.get('house-attic').visible,true);scene.dispose();
});


test('west gate facade, ASC sign and attic A retain the same anchor',()=>{
  const a=getSpace('attic-parts');assert.equal(a.x-a.width/2,-17);
  assert.deepEqual(BUILDING_TOPOLOGY.gates.map(g=>g.id),['gate-3','gate-2','gate-1']);
  assert.deepEqual(BUILDING_TOPOLOGY.gates.map(g=>g.z),[-5.2,6.2,14.8]);
  assert.equal(BUILDING_TOPOLOGY.sign.gate,'gate-1');assert.equal(BUILDING_TOPOLOGY.sign.z,14.8);
  for(const gate of BUILDING_TOPOLOGY.gates)assert.ok(gate.z>=a.z-a.depth/2&&gate.z<=a.z+a.depth/2);
});

test('gate 3 route crosses the first room before table room and west triangle',()=>{
  const route=BUILDING_TOPOLOGY.entryRoute;assert.equal(route.interveningRoom,'workshop');assert.equal(route.secondRoom,'table-room');
  assert.ok(route.door[1]<route.enter[1]);assert.ok(route.table[1]<route.door[1]);assert.ok(route.triangleDoor[0]<route.table[0]);
  assert.equal(route.approximateWalkMetres,6);assert.equal(route.distanceNotSurveyed,true);
  assert.deepEqual(BUILDING_TOPOLOGY.trianglePolygon,[[-22,-10],[-17,-17],[-17,-10]]);
});

test('mapped tire footprints cannot float over house void edges or triangle diagonal',()=>{
  assert.equal(hasBuildingFloor('house-attic',-1.2,4,.3),false);
  assert.equal(hasBuildingFloor('house-attic',0,4,.3),true);
  assert.equal(mapAreaPoint('house-attic',{width:10,depth:14},-1.2,4,.3),null);
  assert.equal(hasBuildingFloor('triangular-store',-2,3,.4),false);
  assert.equal(hasBuildingFloor('triangular-store',1,1,.3),true);
  assert.equal(mapAreaPoint('triangular-store',{width:5,depth:7},-2,-2,.1),null);
});

test('tire footprints cannot straddle the raised platform boundary',()=>{
  const area={width:10,depth:18};
  assert.equal(mapAreaPoint('attic-racks',area,4.05,-3.5,.2),null);
  assert.equal(mapAreaPoint('attic-racks',area,4.15,-3.5,.2),null);
  assert.equal(mapAreaPoint('attic-racks',area,4.6,-3.5,.2).y,4.2);
});

test('rear racks stand on the lower floor and the middle deck agrees with placement and picking',()=>{
  const scene=createBuilding(THREE),space=getSpace('attic-racks'),area={width:space.width,depth:space.depth};
  scene.root.updateMatrixWorld(true);
  const racks=[],decks=[],picks=[];
  scene.rooms.get(space.id).traverse(o=>{
    if(o.userData.kind==='rack')racks.push(o);
    if(o.userData.kind==='raised-deck')decks.push(o);
    if(o.userData.kind==='platform-hit')picks.push(o);
  });
  assert.equal(decks.length,1);assert.equal(picks.length,1);
  const deck=new THREE.Box3().setFromObject(decks[0]),p=space.platform;
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} ≠ ${expected}`);
  near(deck.min.x,space.x+p.x-p.w/2);near(deck.max.x,space.x+p.x+p.w/2);
  near(deck.min.z,space.z+p.z-p.d/2);near(deck.max.z,space.z+p.z+p.d/2);
  near(deck.max.y,space.y+p.rise);
  const centre=deck.getCenter(new THREE.Vector3());
  const mapped=mapAreaPoint(space.id,area,centre.x-space.x,centre.z-space.z,.2);
  near(mapped.y,deck.max.y);
  const ray=new THREE.Raycaster(new THREE.Vector3(centre.x,deck.max.y+1,centre.z),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(picks[0],false)[0];assert.ok(hit);near(hit.point.y,mapped.y);
  assert.equal(racks.filter(r=>r.userData.bank==='rear').length,6);
  assert.equal(racks.filter(r=>r.userData.bank==='side').length,4);
  for(const rack of racks){
    const bounds=new THREE.Box3().setFromObject(rack),point=bounds.getCenter(new THREE.Vector3());
    const floor=mapAreaPoint(space.id,area,point.x-space.x,point.z-space.z);
    assert.ok(floor);near(bounds.min.y,floor.y);
    if(rack.userData.bank==='rear'){
      near(bounds.min.y,space.y);assert.ok(bounds.max.z<deck.min.z,'rear racks must be behind and below the middle deck');
    }else if(rack.userData.bank==='side'){
      near(bounds.min.y,deck.max.y);
      assert.ok(bounds.min.x>=deck.min.x&&bounds.max.x<=deck.max.x);
      assert.ok(bounds.min.z>=deck.min.z&&bounds.max.z<=deck.max.z);
    }else near(bounds.min.y,space.y);
  }
  scene.dispose();
});

test('tire footprints cannot cross the refined west or north deck edges from either level',()=>{
  const space=getSpace('attic-racks'),area={width:space.width,depth:space.depth},p=space.platform;
  const west=p.x-p.w/2,north=p.z-p.d/2,radius=.2;
  for(const edge of [
    {point:offset=>[west+offset,p.z]},
    {point:offset=>[p.x,north+offset]},
  ]){
    for(const offset of [-.1,.1])assert.equal(mapAreaPoint(space.id,area,...edge.point(offset),radius),null);
    assert.equal(mapAreaPoint(space.id,area,...edge.point(-.3),radius).y,space.y);
    assert.equal(mapAreaPoint(space.id,area,...edge.point(.3),radius).y,space.y+p.rise);
  }
});

test('the lower west strip holds a schematic full tire-set footprint beside a continuous walking envelope',()=>{
  const scene=createBuilding(THREE),space=getSpace('attic-racks'),area={width:space.width,depth:space.depth};
  scene.root.updateMatrixWorld(true);
  let deckMesh;const rackBounds=[];
  scene.rooms.get(space.id).traverse(o=>{
    if(o.userData.kind==='raised-deck')deckMesh=o;
    if(o.userData.kind==='rack')rackBounds.push(new THREE.Box3().setFromObject(o));
  });
  const deck=new THREE.Box3().setFromObject(deckMesh),west=space.x-space.width/2;
  // These are review envelopes in unmeasured drawing units, not surveyed
  // accessibility dimensions. A set stacked vertically retains one footprint.
  const tireRadius=.42,personRadius=.4,wallHalfThickness=.11,margin=.1;
  const tireX=west+wallHalfThickness+margin+tireRadius,personX=deck.min.x-margin-personRadius;
  assert.ok(personX-tireX>=tireRadius+personRadius+margin,'a person must pass beside the full tire-set footprint');
  for(let step=0;step<=20;step++){
    const z=deck.min.z+.5+(deck.max.z-deck.min.z-1)*step/20;
    for(const [x,radius]of [[tireX,tireRadius],[personX,personRadius]]){
      const floor=mapAreaPoint(space.id,area,x-space.x,z-space.z,radius);
      assert.ok(floor);assert.equal(floor.y,space.y);
      for(const rack of rackBounds){
        const dx=x-Math.max(rack.min.x,Math.min(x,rack.max.x));
        const dz=z-Math.max(rack.min.z,Math.min(z,rack.max.z));
        assert.ok(dx*dx+dz*dz>radius*radius,'the west clearance must not intersect a rack');
      }
    }
  }
  assert.equal(DIMENSIONS_UNMEASURED,true);scene.dispose();
});

test('declared building camera bounds contain actual mesh geometry',()=>{
  const scene=createBuilding(THREE);scene.root.updateMatrixWorld(true);
  const actual=new THREE.Box3().setFromObject(scene.root);
  for(let i=0;i<3;i++){
    assert.ok(actual.min.getComponent(i)>=scene.bounds.min[i]);
    assert.ok(actual.max.getComponent(i)<=scene.bounds.max[i]);
  }
  scene.dispose();
});

test('reference upper assembly has common attic front/rear edges and one rigid placement',()=>{
  const a=getSpace('attic-parts'),b=getSpace('attic-racks');
  assert.equal(a.z-a.depth/2,b.z-b.depth/2);assert.equal(a.z+a.depth/2,b.z+b.depth/2);
  assert.equal(a.z-a.depth/2,-14);assert.equal(a.z+a.depth/2,18);
  const scene=createBuilding(THREE);assert.deepEqual(scene.upperAssembly.position.toArray(),UPPER_ASSEMBLY_TRANSFORM.translation);
  assert.deepEqual(scene.upperAssembly.scale.toArray(),[1,1,1]);
  for(const id of UPPER_SPACE_IDS){assert.equal(scene.rooms.get(id).parent,scene.upperAssembly);assert.deepEqual(scene.rooms.get(id).scale.toArray(),[1,1,1]);}
  scene.dispose();
});

test('unresolved house connection stays out of integrated views',()=>{
  assert.equal(BUILDING_TOPOLOGY.integrationReady,false);assert.equal(BUILDING_TOPOLOGY.unresolvedJoins.length,2);
  const scene=createBuilding(THREE);assert.equal(scene.upperAssembly.visible,false);
  scene.setView('upper-assembly');assert.equal(scene.upperAssembly.visible,true);
  for(const [id,room]of scene.rooms)assert.equal(room.visible,UPPER_SPACE_IDS.includes(id));
  scene.setView('upper-review');assert.equal(scene.upperAssembly.visible,true);
  for(const [id,room]of scene.rooms)assert.equal(room.visible,UPPER_SPACE_IDS.includes(id));
  scene.setView('house-attic');assert.equal(scene.upperAssembly.visible,false);assert.equal(scene.rooms.get('house-attic').visible,true);
  scene.dispose();
});

test('reference corridor entrance has an actual opening and an open wooden leaf',()=>{
  const scene=createBuilding(THREE);scene.setView('upper-review');scene.setCutaway('closed');scene.root.updateMatrixWorld(true);
  const entrances=[];scene.rooms.get('attic-parts').traverse(o=>{if(o.userData.kind==='corridor-entrance')entrances.push(o);});
  assert.equal(entrances.length,1);const entrance=entrances[0];assert.equal(entrance.userData.unmeasured,true);
  const leaf=entrance.children.find(o=>o.userData.kind==='door');assert.equal(leaf.userData.open,true);assert.ok(leaf.rotation.y>.5);
  // A sightline through the west half of the opening must not hit an infilled
  // rear wall. The ray only reaches the wall plane, before the swung-open leaf.
  const point=entrance.localToWorld(new THREE.Vector3(-10.5,4.2,-14.5));
  const ray=new THREE.Raycaster(point,new THREE.Vector3(0,0,1),0,.8);
  assert.equal(ray.intersectObjects(scene.walls.filter(w=>w.parent===entrance),false).length,0);
  scene.dispose();
});

test('review cutaway lowers only front walls and restores full geometry in other modes',()=>{
  const scene=createBuilding(THREE);scene.setCutaway('closed');
  const full=scene.walls.map(w=>({wall:w,position:w.position.clone(),scale:w.scale.clone()}));
  scene.setCutaway('review');assert.equal(scene.reviewFrontWalls.length,2);
  assert.ok(scene.roofs.every(r=>!r.visible));assert.ok(scene.roofStructure.every(r=>!r.visible));assert.ok(scene.walls.every(w=>w.material.opacity===1&&!w.material.transparent));
  for(const prior of full){
    const cutaway=prior.wall.userData.reviewCutaway;
    if(cutaway){assert.equal(prior.wall.scale.y,.5);assert.equal(prior.wall.position.y,cutaway.baseY+.25);}
    else {assert.deepEqual(prior.wall.position.toArray(),prior.position.toArray());assert.deepEqual(prior.wall.scale.toArray(),prior.scale.toArray());}
  }
  assert.ok(scene.reviewFrontWalls.every(f=>!f.cap.visible));
  for(const mode of ['closed','open','shell']){
    scene.setCutaway('review');scene.setCutaway(mode);
    for(const prior of full){assert.deepEqual(prior.wall.position.toArray(),prior.position.toArray());assert.deepEqual(prior.wall.scale.toArray(),prior.scale.toArray());}
    assert.ok(scene.reviewFrontWalls.every(f=>f.cap.visible));
  }
  scene.dispose();
});
