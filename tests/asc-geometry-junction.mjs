import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../app/warehouse-preview/vendor/three.module.js';
import {getSpace,createBuilding,UPPER_SPACE_IDS,hasBuildingFloor} from '../app/warehouse-preview/building.js';
import {auditGeometry,worldPoint,worldFloorPolygons,floorPlanIntersection,polygonUnionArea} from '../scripts/audit-asc-geometry.mjs';

test('junction audit uses occupied floor unions, including rotated house openings and the triangle',()=>{
  assert.deepEqual(worldPoint(getSpace('house-attic'),[-5,-7]),[0,0]);
  assert.deepEqual(worldPoint(getSpace('house-attic'),[5,7]),[14,-10]);
  assert.equal(polygonUnionArea(worldFloorPolygons(getSpace('house-attic'))),102.145);
  assert.equal(polygonUnionArea(worldFloorPolygons(getSpace('triangular-store'))),17.5);
  assert.equal(polygonUnionArea(worldFloorPolygons(getSpace('attic-parts'))),272);
  const houseVoid={x:0,z:0,rotationY:0,floorRects:[{x:11,z:-1,w:2,d:1}]};
  assert.equal(floorPlanIntersection(getSpace('house-attic'),houseVoid).area,0,
    'a point inside the room envelope but outside its floor must not become a collision');
});

test('intersection does not double count overlapping rectangles and handles triangle clipping',()=>{
  const square={x:0,z:0,floorRects:[{x:0,z:0,w:2,d:2},{x:0,z:0,w:2,d:2}]};
  const triangle={x:0,z:0,floorPolygon:[[-1,-1],[1,-1],[1,1]],floorRects:[]};
  assert.equal(floorPlanIntersection(square,square).area,4);
  assert.equal(floorPlanIntersection(square,triangle).area,2);
  assert.equal(floorPlanIntersection(triangle,square).area,2);
});

test('current incompatible junction has a 50-unit plan overlap and a distinct 1-unit floor offset',()=>{
  const report=auditGeometry(), c=report.conflicts;
  assert.deepEqual(c.rackHouseFloorPlan.bounds,{x:[0,5],z:[-10,0]});
  assert.equal(c.rackHouseFloorPlan.area,50);
  assert.equal(c.upperMinusHouseAtticBaseElevation,1);
  assert.equal(c.baseFloorsCoincident,false);
  assert.match(c.rackHouseFloorPlan.interpretation,/Plan overlap only/);
  assert.deepEqual([c.officeEastToHouseWest.officePlane,c.officeEastToHouseWest.housePlane,c.officeEastToHouseWest.gap],[-5,0,5]);
  assert.deepEqual([c.rackNorthToHouseNorth.rackPlane,c.rackNorthToHouseNorth.housePlane,c.rackNorthToHouseNorth.offset],[-14,-10,4]);
});

test('all four owner-constrained shared walls have actual supported floor on both sides',()=>{
  const report=auditGeometry();
  assert.deepEqual(report.confirmedModelJoins.map(j=>j.endpoints),[
    [[-5,0],[-5,18]],[[-5,-14],[-5,0]],[[-13,-14],[-13,0]],[[-13,0],[-5,0]],
  ]);
  for(const join of report.confirmedModelJoins) {
    assert.deepEqual(join.baseElevations,[4.2,4.2]);
    const [a,b]=join.endpoints, mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    for(const [id,side] of [[join.a,join.sideA],[join.b,join.sideB]]) {
      const s=getSpace(id);
      assert.equal(hasBuildingFloor(id,mid[0]-s.x,mid[1]-s.z),true,id+' reaches its declared wall');
      const normal=side.endsWith('east')?[1,0]:side.endsWith('west')?[-1,0]:side.endsWith('north')?[0,-1]:[0,1];
      assert.equal(hasBuildingFloor(id,mid[0]-s.x-normal[0]*.01,mid[1]-s.z-normal[1]*.01),true,id+' has floor inside its shared wall');
      assert.equal(hasBuildingFloor(id,mid[0]-s.x+normal[0]*.01,mid[1]-s.z+normal[1]*.01),false,id+' has no floor across its shared wall');
    }
  }
  assert.deepEqual(report.commonUpperEdges,[
    {id:'attic-parts',north:-14,south:18},{id:'attic-racks',north:-14,south:18},
  ]);
});

test('audit leaves all geometry, one rigid assembly, inventory and integration block unchanged',()=>{
  const before=JSON.stringify(auditGeometry()), scene=createBuilding(THREE);
  try {
    assert.deepEqual(scene.upperAssembly.position.toArray(),[-5,1,0]);
    for(const id of UPPER_SPACE_IDS) {
      assert.equal(scene.rooms.get(id).parent,scene.upperAssembly);
      assert.deepEqual(scene.rooms.get(id).scale.toArray(),[1,1,1]);
    }
    const report=auditGeometry();
    assert.equal(report.dimensionsUnmeasured,true);
    assert.equal(report.integrationReady,false);
    assert.equal(report.inventorySeeded,false);
    assert.equal(report.spaces.filter(s=>s.inventory).length,6);
    assert.equal(report.spaces.find(s=>s.id==='office').inventory,false);
    assert.equal(report.unresolvedJoins.length,2);
    scene.setView('all');assert.equal(scene.upperAssembly.visible,false);
    scene.setView('upper-review');assert.equal(scene.upperAssembly.visible,true);
    assert.equal(scene.rooms.get('house-attic').visible,false);
    assert.equal(JSON.stringify(auditGeometry()),before);
  } finally {scene.dispose();}
});
