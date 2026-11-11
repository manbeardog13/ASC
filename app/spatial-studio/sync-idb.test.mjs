import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { createLayoutSync } from './sync.js';
test('IndexedDB survives a reload, isolates operators, replays on reconnect and refuses a conflicting create',async()=>{
 const url='https://asc-local-test.supabase.co', A=crypto.randomUUID(),B=crypto.randomUUID(),area_id=crypto.randomUUID();
 let online=false,current=A,count=0;const stored=[],events=[],clients=new Set();
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;
 const previous=Object.getOwnPropertyDescriptors(globalThis);
 const globals={window:win, document:doc, indexedDB,navigator:{get onLine(){return online;}},fetch:async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer scoped-'+current);assert.equal(options.redirect,'error');
   const p=new URL(url).searchParams,rack=p.get('rack')?.slice(3);
   if(options.method==='GET')return Response.json(stored.filter(r=>r.rack===rack));
   assert.equal(options.method,'POST');count++;const v=JSON.parse(options.body);
   stored.push({...v,updated_at:new Date().toISOString()});return Response.json([stored.at(-1)]);
 }};
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
 const callbackSet=new Set();const channel={on(){return channel;},subscribe(){}};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:current},access_token:'scoped-'+current}}}),onAuthStateChange:cb=>{callbackSet.add(cb);return {data:{subscription:{unsubscribe:()=>callbackSet.delete(cb)}}};}},channel:()=>channel,removeChannel:()=>{}};
 const open=async()=>{const h=await createLayoutSync({userId:current,client,url,publishableKey:'test-only',onState:s=>events.push(s)});clients.add(h);return h;};
 const draft={area_id,rack:'01',x:1,z:1,capacity:8};
 try{
   const alice=await open();await alice.enqueue(draft);await alice.flush();
   assert.equal(events.at(-1).pending,1);assert.equal(events.at(-1).mode,'offline');
   await assert.rejects(alice.enqueue(draft),/lokalna promjena/);
   await alice.cacheLayout({areas:[{id:area_id,name:'Zona A',customer:'should not persist'}],positions:[],bindings:[]});
   alice.dispose();current=B;const bob=await open();await bob.flush();
   assert.equal(await bob.readLayout(),null);assert.equal(events.at(-1).pending,0);bob.dispose();
   current=A;const returned=await open();assert.deepEqual((await returned.readLayout()).areas,[{id:area_id,name:'Zona A'}]);
   online=true;win.dispatchEvent(new Event('online'));await returned.flush();assert.equal(count,1);assert.equal(events.at(-1).pending,0);
   await returned.enqueue({...draft,x:3});await returned.flush();assert.equal(count,1);assert.equal(events.at(-1).conflicts,1);
   await returned.discard(events.at(-1).issues[0].id);assert.equal(events.at(-1).conflicts,0);
   current=B;for(const cb of callbackSet)cb('SIGNED_IN',{user:{id:B}});
   await assert.rejects(returned.enqueue(draft),/zatvoren/);
 }finally{
   for(const c of clients)c.dispose();
   for(const key of Object.keys(globals)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];}
 }
});
