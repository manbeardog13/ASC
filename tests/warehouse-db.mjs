// Exercise the real db.js map methods. Only the Supabase transport is synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/db.js',import.meta.url),'utf8');
async function client(replies=[]){
 const calls=[];
 const supabase={auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({})},from(table){
  const call={table,steps:[]};calls.push(call);
  const builder=new Proxy({}, {get(_target,method){
   if(method==='then')return(resolve,reject)=>{assert.ok(replies.length,'unexpected database request');return Promise.resolve(replies.shift()).then(resolve,reject);};
   return(...args)=>{call.steps.push([method,...args]);return builder;};
  }});return builder;
 }};
 const context=vm.createContext({console,window:{addEventListener(){}},URL,URLSearchParams,Date,Map,Set,Promise});
 const mod=new vm.SourceTextModule(source,{context});
 const dependencies={
  './supabaseClient.js':{supabase},'./config.js':{config:{}},'./images.js':{compressImage:()=>{}},
  './offline.js':{isOnline:()=>true,enqueue:()=>{},initOffline:()=>{},replay:async()=>{}},'./store.js':{rememberLocation:()=>{}}
 };
 await mod.link(spec=>{const values=dependencies[spec];assert.ok(values,'unexpected import '+spec);return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});
 await mod.evaluate();return{db:mod.namespace,calls};
}
const plain=x=>JSON.parse(JSON.stringify(x));
test('real map reader scopes areas to main and positions to those area ids',async()=>{
 const c=await client([{data:[{id:'a',warehouse:'main',zone:'SYN'}]},{data:[]},{data:[{id:'p',area_id:'a',rack:'01'}]},{data:[]}]);
 const result=await c.db.listWarehouseLayout();assert.equal(result.available,true);
 assert.deepEqual(c.calls.map(x=>x.table),['warehouse_areas','warehouse_areas','warehouse_rack_positions','warehouse_rack_positions']);
 assert.deepEqual(plain(c.calls[0].steps.find(step=>step[0]==='eq')),['eq','warehouse','main']);
 assert.deepEqual(plain(c.calls[2].steps.find(step=>step[0]==='in')),['in','area_id',['a']]);
});
test('missing migration is distinct from permission or transport failure',async()=>{
 const absent=await client([{error:{code:'42P01',message:'relation missing'}}]);assert.equal((await absent.db.listWarehouseLayout()).available,false);
 for(const error of [{code:'42501',message:'permission denied'},{message:'Failed to fetch'}]){
  const c=await client([{error}]);await assert.rejects(c.db.listWarehouseLayout());
 }
});
test('empty main warehouse never fetches positions from another warehouse',async()=>{
 const c=await client([{data:[]}]);assert.deepEqual(plain(await c.db.listWarehouseLayout()),{available:true,areas:[],positions:[]});assert.equal(c.calls.length,1);
});
test('zero-row move and delete must fail rather than acknowledge denied or stale edits',async()=>{
 for(const op of ['moveRackPosition','deleteWarehouseArea']){
  const c=await client([{error:{code:'PGRST116',message:'Expected one row, got zero'}}]);
  await assert.rejects(op==='deleteWarehouseArea'?c.db[op]('a'):c.db[op]({from_area_id:'a',to_area_id:'b',rack:'01',x:1,z:0}));
  assert.deepEqual(c.calls[0].steps.at(-1),['single']);
 }
});
test('rack movement returns the stable backend identity and only writes map data',async()=>{
 const c=await client([{data:{id:'p'}}]);const result=await c.db.moveRackPosition({from_area_id:'a',to_area_id:'b',rack:'01',x:1,z:0});
 assert.equal(result.id,'p');assert.equal(c.calls[0].table,'warehouse_rack_positions');
 assert.deepEqual(plain(c.calls[0].steps[0]),['update',{area_id:'b',x:1,z:0}]);
});
