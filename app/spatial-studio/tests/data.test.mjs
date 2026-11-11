import test from 'node:test';
import assert from 'node:assert/strict';
import {convertInventory,validateDraft,startStudio,initialSnapshot} from '../src/data.ts';
import {projectLiveInventory} from '../../warehouse-preview/live-inventory.js';
import {mapAreaPoint} from '../../warehouse-preview/building.js';

const geometry={areas:[{id:'uuid-area',warehouse:'main',zone:'Z',name:'Trokut',width:5,depth:7,unit:'grid'}],
 positions:[{id:'uuid-rack',area_id:'uuid-area',rack:'R',x:1,z:2,capacity:8}],bindings:[{warehouse:'main',area_id:'uuid-area',space_id:'triangular-store'}]};
const rows={locations:[{id:'loc',warehouse:'main',zone:'Z',rack:'R',shelf:'1',slot:'1',status:'occupied',qr_code:'LOC-X'},
 {id:'loc2',warehouse:'main',zone:'Z',rack:'N',shelf:'1',slot:'2',status:'free'}],
 sets:[{id:'s1',status:'in_storage',location_id:'loc',quantity:4,public_code:'ASC-X',vehicle:{plate:'HR',customer:{name:'Fixture'}},tires:[{size:'295/35 R20 105Y'}]},
 {id:'s2',status:'reserved',public_code:'ASC-2',quantity:2},{id:'s3',status:'checked_out',public_code:'old',quantity:4}]};
test('canonical projection maps exact seats, keeps unassigned, excludes inactive and never invents SKU',()=>{
 const v=convertInventory(projectLiveInventory,geometry,rows,mapAreaPoint);
 assert.deepEqual(v.sets.map(s=>[s.id,s.columnId,s.loadIndex,s.sku]),[['s1','uuid-rack','105',''],['s2',null,'','']]);
 assert.equal(v.columns[0].occupancy,4);assert.equal(v.locations[0].qr,'LOC-X');
});
test('cannot create phantom racks, collide with existing column or cross triangular footprint',()=>{
 const s={...initialSnapshot(),...convertInventory(projectLiveInventory,geometry,rows,mapAreaPoint),canEdit:true,layoutAvailable:true};
 const draft={areaId:'uuid-area',x:1.1,z:1,capacity:4,rack:'n'};
 assert.equal(validateDraft(draft,s,mapAreaPoint).rack,'N');
 for(const changes of [{rack:'no'},{rack:'r'},{x:1.1,z:2},{x:-2,z:-3},{capacity:0}]){
  assert.throws(()=>validateDraft({...draft,...changes},s,mapAreaPoint));
 }
});
test('racks outside a bound room remain unassigned so Find in space cannot open a marker-less map',()=>{
 const outside={areas:[{id:'uuid-area',warehouse:'main',zone:'Z',name:'Platforma',width:8,depth:8,unit:'m'}],
  positions:[{id:'uuid-rack',area_id:'uuid-area',rack:'R',x:0,z:0,capacity:8}],
  bindings:[{warehouse:'main',area_id:'uuid-area',space_id:'house-platform'}]};
 const parked={locations:[{id:'loc',warehouse:'main',zone:'Z',rack:'R',shelf:'1',slot:'1',status:'occupied',qr_code:'LOC-X'}],
  sets:[{id:'s1',status:'in_storage',location_id:'loc',quantity:4,public_code:'ASC-X',vehicle:{plate:'HR',customer:{name:'Fixture'}},tires:[{size:'295/35 R20 105Y'}]}]};
 const v=convertInventory(projectLiveInventory,outside,parked,mapAreaPoint);
 assert.equal(v.areas[0].spaceId,'house-platform');
 assert.equal(mapAreaPoint('house-platform',v.areas[0],0,0,.27),null);
 assert.equal(v.sets[0].columnId,null);
 assert.deepEqual(v.sets.filter(s=>!s.columnId).map(s=>s.id),['s1']);
});
test('sign out during inventory read cannot restore another staff member’s data',async()=>{
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();
 Object.defineProperty(globalThis.navigator,'onLine',{value:true,configurable:true});
 let resolveQuery,auth;let session={user:{id:'staff'}};let snapshot,closed=0;
 const db={getSession:async()=>session,loadMyProfile:async()=>({id:'staff',role:'employee'}),canEditWarehouse:()=>true,
  listWarehouseLayout:async()=>({...geometry,available:true}),listWarehouseSpaceBindings:async()=>({bindings:geometry.bindings,available:true}),
  listWarehouseInventory:()=>new Promise(resolve=>{resolveQuery=resolve;}),
  onAuthChange:fn=>{auth=fn;return {data:{subscription:{unsubscribe(){}}}};}};
 const sync=async()=>({dispose(){closed++;},cacheLayout:async()=>{},readLayout:async()=>null});
 const controller=startStudio(s=>snapshot=s,async()=>({db,sync,map:mapAreaPoint,project:projectLiveInventory}));
 try{
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(typeof resolveQuery,'function');
  session=null;auth('SIGNED_OUT',null);resolveQuery({...rows,readCompletedAt:new Date().toISOString()});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(snapshot.status,'signed-out');assert.deepEqual(snapshot.sets,[]);assert.deepEqual(snapshot.locations,[]);assert.ok(closed>0);
 }finally{controller.dispose();}
});
