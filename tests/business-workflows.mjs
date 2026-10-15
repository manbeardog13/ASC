import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = process.env.ASC_TEST_ROOT || fileURLToPath(new URL('../', import.meta.url));
const file = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let online = true;
let session = null;
const queries = [];
const storage = new Map();
const localStorage = {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
let resolveQuery = q => ({data: q.op==='update'?[{id:q.id}]: q.op==='delete'?[{id:q.id}]:[],error:null});
function from(table) {
 const q={table}; const chain={};
 for(const op of ['select','update','insert','delete','eq','is','ilike','limit','neq','maybeSingle','single','order','not','in','upsert']) chain[op]=(...args)=>{ if(['update','insert','delete','upsert'].includes(op)){q.op=op;q.payload=args[0];} if(op==='select'&&!q.op)q.op='select';if(op==='eq'&&args[0]==='id')q.id=args[1]; (q.steps??=[]).push([op,...args]);return chain;};
 chain.then=(a,b)=>{queries.push(q);return Promise.resolve(resolveQuery(q)).then(a,b);};return chain;
}
const supabase={from,auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({})},rpc:async(...args)=>{queries.push({rpc:args});return {data:{ok:true},error:null};}};
const context=vm.createContext({console,localStorage,window:{addEventListener(){},dispatchEvent(){}},Date,CustomEvent:class{},setTimeout,clearTimeout});
const m=new vm.SourceTextModule(file('js/db.js')+'\nexport {replayPendingUnwinds};',{context});
const deps={'./supabaseClient.js':{supabase},'./config.js':{config:{}},'./images.js':{compressImage:()=>{}},'./offline.js':{isOnline:()=>online,enqueue:()=>{},initOffline:()=>{},replay:async()=>{}},'./store.js':{rememberLocation:()=>{}}};
await m.link(s=>new vm.SyntheticModule(Object.keys(deps[s]),function(){for(const [k,v] of Object.entries(deps[s]))this.setExport(k,v)},{context}));await m.evaluate();
const db=m.namespace;

// The registered slot RPC is the only movement write; a failed/unregistered lookup cannot fall back.
queries.length=0;
resolveQuery=q=>q.table==='locations'?{data:[{id:'slot-new',zone:'B',rack:'1',shelf:'1',slot:'9'}],error:null}:{data:[],error:null};
await db.moveStorageSet({id:'set-1',public_code:'ASC-SYNTH',location_id:'slot-old'},{zone:'B',rack:'1',shelf:'1',slot:'9'});
assert.equal(queries.filter(q=>q.rpc).length,1);assert.equal(queries.find(q=>q.rpc).rpc[0],'move_set');assert.equal(queries.find(q=>q.rpc).rpc[1].location_id,'slot-new');assert(!queries.some(q=>q.op==='update'));
queries.length=0;
await db.moveStorageSet({id:'set-2',public_code:'ASC-SYNTH2',location_id:null},{zone:'B',rack:'1',shelf:'1',slot:'9'});
assert.equal(queries.find(q=>q.rpc).rpc[0],'place_set');
for(const result of [{data:[],error:null},{data:[{id:'a'},{id:'b'}],error:null},{data:null,error:{message:'network disconnected'}}]) {
 queries.length=0;resolveQuery=()=>result;
 await assert.rejects(db.moveStorageSet({id:'set-1',location_id:'old'},{zone:'B'}));assert(!queries.some(q=>q.rpc||q.op==='update'));
}
online=false;queries.length=0;await assert.rejects(db.moveStorageSet({id:'set-1'},{zone:'B'}));assert.equal(queries.length,0);online=true;
console.log('PASS registered slot move/place, unknown/ambiguous/network/offline rejection');
// Completed owned cleanup disappears; legacy/other-user work remains untouched.
const job={ownerId:'staff-A',setId:'failed-set',customerId:'new-customer',vehicleId:null,at:'2026-10-15T12:00:00.000Z'};
const other={...job,ownerId:'staff-B',setId:'other-set'};
const legacy={setId:'legacy-set',customerId:'legacy-customer',at:'2026-10-15T12:00:00.000Z'};
storage.set('asc.unwind.pending',JSON.stringify([job,other,legacy]));session={user:{id:'staff-A'}};queries.length=0;
resolveQuery=q=>({data:q.op==='update'||q.op==='delete'?[{id:q.id}]:null,error:null});
await db.replayPendingUnwinds();
assert.deepEqual(JSON.parse(storage.get('asc.unwind.pending')),[other,legacy]);assert(!queries.some(q=>q.id==='other-set'||q.id==='legacy-set'));
console.log('PASS owned cleanup drains; legacy/unrelated jobs stay parked');
// Newly queued cleanup while replay is awaiting survives.
storage.set('asc.unwind.pending',JSON.stringify([job]));let injected=false;const added={...job,setId:'new-failure',at:'2026-10-15T12:01:00.000Z'};
resolveQuery=q=>{if(!injected){injected=true;const latest=JSON.parse(storage.get('asc.unwind.pending'));latest.push(added);storage.set('asc.unwind.pending',JSON.stringify(latest));}return {data:q.op==='update'||q.op==='delete'?[{id:q.id}]:null,error:null};};
await db.replayPendingUnwinds();assert.deepEqual(JSON.parse(storage.get('asc.unwind.pending')),[added]);
console.log('PASS concurrently parked cleanup survives');
// A session switch while cleanup awaits must stop further destructive actions.
storage.set('asc.unwind.pending',JSON.stringify([job]));session={user:{id:'staff-A'}};queries.length=0;
resolveQuery=q=>{if(q.table==='storage_sets'&&q.op==='update')session={user:{id:'staff-B'}};return {data:[{id:q.id}],error:null};};
await db.replayPendingUnwinds();assert(!queries.some(q=>q.op==='delete'));assert.deepEqual(JSON.parse(storage.get('asc.unwind.pending')),[job]);session={user:{id:'staff-A'}};
console.log('PASS account switch pauses cleanup before further destructive actions');
// Choose customer A then B lacking contact/vehicle: B gets no values from A.
const nodes=Object.fromEntries(['c_id','v_id','c_name','c_phone','c_email','c_address','v_make','v_model','v_year','v_plate'].map(id=>[id,{value:'',dataset:{}}]));
const who=file('app/live-checkin.js').match(/function rememberWho\(customer, vehicle\) \{[\s\S]*?\n\}/)[0];
const whoContext=vm.createContext({hiddenId:id=>nodes[id],$:id=>nodes[id]});const canonical=file('app/live-checkin.js').match(/function canonicalVehiclePlate\(value\) \{[\s\S]*?\n\}/)?.[0];if(canonical)vm.runInContext(canonical,whoContext);vm.runInContext(who,whoContext);
whoContext.rememberWho({id:'A',name:'Synthetic A',phone:'111',email:'a@example.invalid',address:'A street'},{id:'vA',make:'Make A',model:'Model A',year:2000,plate:'A'});
whoContext.rememberWho({id:'B',name:'Synthetic B',phone:null,email:null,address:null},null);
assert.equal(nodes.c_id.value,'B');for(const key of ['c_phone','c_email','c_address','v_make','v_model','v_year','v_plate','v_id']) assert.equal(nodes[key].value,'',key);
console.log('PASS changing intake identity clears absent contact/vehicle values');
// Reused-customer failed cleanup remains durable and bound to the initiating account.
queries.length=0;storage.delete('asc.unwind.pending');
resolveQuery=q=>{
 if(['customers','vehicles'].includes(q.table)&&q.op==='update')return {data:[{id:q.id}],error:null};
 if(q.table==='storage_sets'&&q.op==='insert')return {data:{id:'failed-set2',public_code:'ASC-SYNTH'},error:null};
 if(q.table==='tires'&&q.op==='insert')return {data:null,error:{message:'network disconnected'}};
 if(q.table==='storage_sets'&&['update','delete','select'].includes(q.op))return {data:null,error:{message:'network disconnected'}};
 return {data:[],error:null};
};
await assert.rejects(db.createStorageSet({customer:{id:'reused-customer',name:'Synthetic'},vehicle:{id:'reused-vehicle'},set:{season:'winter',quantity:4},tires:[{size:'205/55R16'}]}));
const pending=JSON.parse(storage.get('asc.unwind.pending'));assert.equal(pending.length,1);assert.equal(pending[0].ownerId,'staff-A');assert.equal(pending[0].setId,'failed-set2');assert.equal(pending[0].customerId,null);
assert(!queries.some(q=>q.op==='delete'&&q.table==='customers'));
console.log('PASS failed reused-customer unwind parks set without deleting customer');
session=null;queries.length=0;await assert.rejects(db.createStorageSet({customer:{name:'Synthetic'},vehicle:{},set:{},tires:[]}));assert.equal(queries.length,0);
console.log('PASS unauthenticated creation never mutates');

// Tire depth zero and metadata are meaningful; position-only empty rows are not.
session={user:{id:'staff-A'}};queries.length=0;
resolveQuery=q=>({data:q.op==='select'&&q.table==='tires'?[]:q.op==='update'?[{id:q.id}]:[],error:null});
await db.replaceTires('set-zero',[{position:'FL',tread_mm:0},{position:'FR',model:'Synthetic model'},{position:'RL',condition_notes:'Synthetic condition'},{position:'RR'}]);
const tireInsert=queries.find(q=>q.table==='tires'&&q.op==='insert');
assert(tireInsert);assert.equal(tireInsert.payload.length,3);assert.equal(tireInsert.payload[0].tread_mm,0);assert.equal(tireInsert.payload[1].model,'Synthetic model');assert.equal(tireInsert.payload[2].condition_notes,'Synthetic condition');
console.log('PASS zero tread and meaningful tire metadata survive; blank rows excluded');
for(const [table,fn] of [['customers',db.updateCustomer],['vehicles',db.updateVehicle]]) {
 for(const rows of [[],null]) {resolveQuery=()=>({data:rows,error:null});await assert.rejects(fn('synthetic-id',{name:'Synthetic'}));}
 resolveQuery=()=>({data:[{id:'synthetic-id'}],error:null});await fn('synthetic-id',{name:'Synthetic'});
 resolveQuery=()=>({data:null,error:{message:'network disconnected'}});await assert.rejects(fn('synthetic-id',{name:'Synthetic'}));
}
console.log('PASS customer/vehicle update requires an affected record and propagates database failure');
