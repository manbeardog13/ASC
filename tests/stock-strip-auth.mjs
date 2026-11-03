import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../app/stock-strip.js',import.meta.url),'utf8');
async function mount(client){
  const events=new Map(), timers=new Map(), rows=[], hosts=[];
  let seq=0;
  const addEventListener=(event,handler)=>events.set(event,handler);
  const context=vm.createContext({
    document:{addEventListener,createElement:()=>({}),documentElement:{classList:{toggle(){}}},
      head:{append(){}},body:{append:el=>hosts.push(el)}},
    window:{addEventListener},URL,setInterval(){},
    setTimeout:fn=>{const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)
  });
  const mod=new vm.SourceTextModule(source,{context,initializeImportMeta:m=>{m.url='https://example.test/app/stock-strip.js';}});
  const deps={'../js/supabaseClient.js':{supabase:client},'./stock-strip-view.js':{createTyreStream:()=>({update:list=>rows.push(Array.from(list))})}};
  await mod.link(spec=>new vm.SyntheticModule(Object.keys(deps[spec]),function(){for(const [name,value] of Object.entries(deps[spec]))this.setExport(name,value);},{context}));
  await mod.evaluate();
  return {events,hosts,rows,async flush(){while(timers.size){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await new Promise(resolve=>setImmediate(resolve));}}};
}
test('a client without session lookup or revocation support never mounts or reads admissions',async()=>{
  const from=()=>assert.fail('unauthenticated inventory read');
  for(const client of [null,{from},{from,auth:{getSession(){}}},{from,auth:{onAuthStateChange(){}}}]){
    const {hosts,events}=await mount(client);
    assert.equal(hosts.length,0);assert.equal(events.size,0);
  }
});
test('on session failure and sign-out the strip drops private details, even if an earlier request finishes later',async()=>{
  let sessionLookup=()=>({data:{session:{user:{id:'employee'}}}}),onAuthChange, inventory=()=>({data:[{public_code:'A'}]});
  const chain=new Proxy({}, {get(_,p){return p==='limit'?()=>inventory():()=>chain;}});
  const h=await mount({from:()=>chain,auth:{getSession:()=>sessionLookup(),onAuthStateChange:fn=>{onAuthChange=fn;}}});
  const [host]=h.hosts;
  for(const failedLookup of [()=>{throw Error('expired');},()=>({error:Error('expired'),data:{session:{user:{id:'employee'}}}})]){
    onAuthChange('SIGNED_IN',{user:{id:'employee'}});await h.flush();assert.equal(host.hidden,false);
    sessionLookup=failedLookup;await h.events.get('pageshow')();assert.equal(host.hidden,true);assert.deepEqual(h.rows.at(-1),[]);
  }
  let finish;inventory=()=>new Promise(resolve=>{finish=resolve;});
  onAuthChange('SIGNED_IN',{user:{id:'employee'}});await h.flush();
  onAuthChange('SIGNED_OUT',null);
  finish({data:[{public_code:'OLD'}]});await h.flush();
  assert.equal(host.hidden,true);assert.deepEqual(h.rows.at(-1),[]);
});
