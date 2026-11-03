import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../app/warehouse-preview/vendor/three.module.js';
import {createBuilding} from '../app/warehouse-preview/building.js';
import {resolvePresentation,environmentPixels,PRESENTATION_PRESETS,fitPerspectiveBounds,isHierarchyVisible,orbitDistance} from '../app/warehouse-preview/presentation.js';

test('all projected building corners fit narrow phones, tablets and desktop without clipping',()=>{
  const bounds={min:[-17,4,-14],max:[5,9,18]};
  for(const aspect of [.32,.6,1,1.6,3.2])for(const direction of [[-.7,.9,1],[0,1,.001],[1,.4,-2]]){
    const fit=fitPerspectiveBounds(bounds,{aspect,direction});
    const camera=new THREE.PerspectiveCamera(38,aspect,.08,1000);camera.position.fromArray(fit.position);camera.lookAt(...fit.target);camera.updateMatrixWorld(true);
    for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){
      const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<=.82&&Math.abs(p.y)<=.82);assert.ok(p.z>-1&&p.z<1);
    }
  }
  assert.throws(()=>fitPerspectiveBounds(bounds,{aspect:0}),RangeError);assert.throws(()=>fitPerspectiveBounds(bounds,{direction:[0,0,0]}),RangeError);
});

test('floor picking rejects meshes hidden by any ancestor, not only their direct parent',()=>{
  const root=new THREE.Group(),assembly=new THREE.Group(),room=new THREE.Group(),floor=new THREE.Object3D();root.add(assembly);assembly.add(room);room.add(floor);
  assert.equal(isHierarchyVisible(floor),true);
  for(const object of [root,assembly,room,floor]){object.visible=false;assert.equal(isHierarchyVisible(floor),false);object.visible=true;}
  assert.equal(isHierarchyVisible(null),false);
});

test('idle orbit stays framed throughout a full turn even in portrait',()=>{
  const bounds={min:[-17,4,-14],max:[5,9,18]},target=new THREE.Vector3(-6,6.5,2);
  for(const aspect of [.32,.6,1.8]){
    const distance=orbitDistance(bounds,aspect),camera=new THREE.PerspectiveCamera(38,aspect,.08,1000);
    for(let step=0;step<36;step++){
      const angle=step*Math.PI/18;camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle),.5,Math.cos(angle)).normalize().multiplyScalar(distance));camera.lookAt(target);camera.updateMatrixWorld(true);
      for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){
        const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<=.82&&Math.abs(p.y)<=.82);
      }
    }
  }
});

test('automatic dusk never darkens tire inspection or isolated room review',()=>{
  for(const view of [null,'all','building','exterior'])assert.equal(resolvePresentation('auto',{buildingEnabled:true,view}),'dusk');
  for(const view of ['upper-assembly','upper-review','office','attic-racks','house-ground'])assert.equal(resolvePresentation('auto',{buildingEnabled:true,view}),'studio');
  assert.equal(resolvePresentation('auto',{buildingEnabled:true,focused:true}),'studio');
  assert.equal(resolvePresentation('auto',{buildingEnabled:true,areaId:'bound-area'}),'studio');
  assert.equal(resolvePresentation('auto',{buildingEnabled:false}),'studio');
  assert.equal(resolvePresentation('dusk',{buildingEnabled:true,view:'office'}),'dusk');
  assert.equal(resolvePresentation('studio',{buildingEnabled:true}),'studio');
  assert.ok(PRESENTATION_PRESETS.dusk.sunIntensity<PRESENTATION_PRESETS.studio.sunIntensity);
});

test('local reflection environments are deterministic, bounded and free of hard source seams',()=>{
  for(const mode of ['studio','dusk']){
    const a=environmentPixels(mode),b=environmentPixels(mode);
    assert.deepEqual(a,b);assert.equal(a.pixels.length,256*128*4);
    for(let y=0;y<a.height;y++)for(let channel=0;channel<3;channel++)assert.ok(Math.abs(a.pixels[y*a.width*4+channel]-a.pixels[((y+1)*a.width-1)*4+channel])<=4);
    assert.ok(a.pixels.every((v,i)=>i%4!==3||v===255));
  }
  assert.notDeepEqual(environmentPixels('studio').pixels,environmentPixels('dusk').pixels);
  for(const dimensions of [[1,128],[1024,128],[256,Infinity]])assert.throws(()=>environmentPixels('studio',...dimensions),RangeError);
});

test('facade glow animates only when visible and respects reduced motion without moving geometry',()=>{
  const texture=new THREE.Texture(),building=createBuilding(THREE,{logoTexture:texture});
  const transforms=[];building.root.traverse(o=>transforms.push([o,o.position.toArray(),o.rotation.toArray(),o.scale.toArray()]));
  const glow=building.root.getObjectByName('ASC · crveno pozadinsko svjetlo');assert.ok(glow);
  building.setView('all');building.setPresentation('dusk');assert.equal(building.update(0),true);
  const initial=glow.material.opacity;building.update(1.6);assert.ok(glow.material.opacity>initial);
  assert.equal(building.update(10,true),false);const still=glow.material.opacity;building.update(20,true);assert.equal(glow.material.opacity,still);
  building.setView('upper-review');assert.equal(building.update(0),false);
  building.setView('all');building.root.visible=false;assert.equal(building.update(0),false);
  for(const [object,position,rotation,scale]of transforms){assert.deepEqual(object.position.toArray(),position);assert.deepEqual(object.rotation.toArray(),rotation);assert.deepEqual(object.scale.toArray(),scale);}
  building.dispose();texture.dispose();
});

test('the triangle shared wall and pedestrian door appear once from either adjoining room',()=>{
  const building=createBuilding(THREE),boundaries=[];
  building.root.traverse(o=>{if(o.userData.kind==='shared-room-boundary')boundaries.push(o);});
  assert.equal(boundaries.length,1);const boundary=boundaries[0];
  const walls=boundary.children.filter(o=>o.userData.kind==='wall');assert.equal(walls.length,2);
  const visibleDoor=()=>{const doors=[];building.root.traverseVisible(o=>{if(o.userData.route==='table-room-triangle')doors.push(o);});return doors;};
  const instances=[];
  for(const view of ['all','table-room','triangular-store']){
    building.setView(view);assert.equal(boundary.visible,true);const doors=visibleDoor();assert.equal(doors.length,1);instances.push(doors[0]);
    assert.deepEqual(walls.map(w=>w.position.toArray()),[[-17,1.4,-14.725],[-17,1.4,-10.675]]);
    assert.deepEqual(doors[0].position.toArray(),[-17.45,1.05,-12.4]);
  }
  assert.equal(instances[0],instances[1]);assert.equal(instances[1],instances[2]);
  building.setView('upper-assembly');assert.equal(boundary.visible,false);assert.equal(visibleDoor().length,0);
  assert.equal(building.rooms.size,10);building.dispose();
});

test('individual upper rooms retain every shared boundary without revealing adjacent furniture',()=>{
  const building=createBuilding(THREE),boundaries=[];
  building.upperAssembly.traverse(o=>{if(o.userData.kind==='upper-shared-boundary')boundaries.push(o);});
  assert.equal(boundaries.length,4);
  const original=boundaries.flatMap(b=>b.children.filter(c=>c.userData.kind==='wall'));
  assert.equal(original.length,4);building.root.updateMatrixWorld(true);
  const transforms=original.map(w=>w.matrixWorld.toArray());
  for(const [view,expected]of [['attic-parts',3],['attic-racks',2],['office',3]]){
    building.setView(view);building.root.updateMatrixWorld(true);
    const visible=boundaries.filter(isHierarchyVisible);assert.equal(visible.length,expected);
    assert.ok(visible.every(b=>b.userData.spaces.includes(view)));
    for(const [id,room]of building.rooms)assert.equal(isHierarchyVisible(room),id===view);
    assert.deepEqual(original.map(w=>w.matrixWorld.toArray()),transforms);
  }
  building.setView('upper-assembly');assert.ok(boundaries.every(isHierarchyVisible));
  building.setView('all');assert.ok(boundaries.every(b=>!isHierarchyVisible(b)));
  building.dispose();
});
