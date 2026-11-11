// Offline structural edits only. No session token, customer, plate, inventory or photo is stored.
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const FIELDS = 'id,area_id,rack,x,z,capacity,updated_at';
const layoutFields = {
  areas:['id','warehouse','zone','name','width','depth','unit','updated_at'],
  positions:['id','area_id','rack','x','z','capacity','updated_at'],
  bindings:['warehouse','space_id','area_id','updated_at']
};
export function cleanLayout(layout, now=Date.now()) {
  const out={cachedAt:now};
  for(const [key, fields] of Object.entries(layoutFields)){
    if(!Array.isArray(layout?.[key])) throw Error('Raspored nije cjelovit.');
    out[key]=layout[key].map(row=>Object.fromEntries(fields.filter(f=>['string','number'].includes(typeof row?.[f])).map(f=>[f,row[f]])));
  }
  return out;
}
export function makeOperation(input, id=crypto.randomUUID()){
  const {area_id,x,z,capacity,base}=input||{};
  const rack=typeof input?.rack==='string'?input.rack.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleUpperCase('hr'):'';
  if(!UUID.test(id)||!UUID.test(area_id)||!rack||rack.length>40||!/^[\p{L}\p{N}]/u.test(rack)||!/^[\p{L}\p{N} ._/-]+$/u.test(rack)||
    !Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>100||Math.abs(z)>100||!Number.isInteger(capacity)||capacity<1||capacity>16)
    throw Error('Provjerite oznaku, položaj i kapacitet regala.');
  if(base&&(!UUID.test(base.id)||typeof base.updated_at!=='string'||!Number.isFinite(Date.parse(base.updated_at))))throw Error('Nedostaje potvrđena verzija regala.');
  return {id,key:JSON.stringify([area_id,rack]),status:'pending',at:Date.now(),payload:{id:base?.id||id,area_id,rack,x,z,capacity},base:base?{id:base.id,updated_at:base.updated_at}:null};
}
const same=(a,b)=>a&&a.id===b.id&&a.area_id===b.area_id&&a.rack===b.rack&&+a.x===b.x&&+a.z===b.z&&+a.capacity===b.capacity;
const conflict=reason=>({kind:'conflict',reason});
// Replaying a lost response converges by value. A different edit never overwrites an unseen revision.
export async function applyOperation(op,transport){
  const {payload:p,base}=op;
  const row=await transport.read(p);
  if(same(row,p))return {kind:'done'};
  if(base&&(!row||row.id!==base.id||row.updated_at!==base.updated_at))return conflict('Regal je u međuvremenu promijenjen. Osvježite ga prije ponovnog unosa.');
  if(!base&&row)return conflict('Regal s ovom oznakom već postoji.');
  try{
    const result=await transport.write(p,base);
    if(same(result,p))return {kind:'done'};
  }catch(e){
    if(!['23505','409'].includes(e.code)){
      if(['23503','23514','23P01','22001','22P02','22003'].includes(e.code))
        return conflict('Baza nije prihvatila položaj. Provjerite stvarnu lokaciju, slobodan pod i kapacitet.');
      throw e;
    }
  }
  return same(await transport.read(p),p)?{kind:'done'}:conflict('Drugi operater promijenio je isti regal. Pregledajte novi raspored.');
}
export function openLayoutStore(indexed,userScope){
  return new Promise((resolve,reject)=>{
    if(!indexed){reject(Error('Trajna pohrana nije dostupna.'));return;}
    const req=indexed.open('asc.spatial.layout.v1:'+userScope,1);
    req.onupgradeneeded=()=>{const db=req.result;const ops=db.createObjectStore('operations',{keyPath:'id'});ops.createIndex('rack','key',{unique:true});db.createObjectStore('snapshot');};
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result;db.onversionchange=()=>db.close();
      const run=(name,mode,fn)=>new Promise((res,rej)=>{
        const tx=db.transaction(name,mode);const store=tx.objectStore(name);let result;
        tx.oncomplete=()=>res(result); tx.onabort=()=>rej(tx.error||Error('Pohrana nije uspjela.'));
        const req=fn(store);req.onsuccess=()=>{result=req.result;};
      });
      resolve({list:()=>run('operations','readonly',s=>s.getAll()),
        add:o=>run('operations','readwrite',s=>s.add(o)),mark:o=>run('operations','readwrite',s=>s.put(o)),
        remove:id=>run('operations','readwrite',s=>s.delete(id)),
        cache:v=>run('snapshot','readwrite',s=>s.put(v,'layout')),read:()=>run('snapshot','readonly',s=>s.get('layout')),close:()=>db.close()});
    };
  });
}
export async function createLayoutSync({userId,client,url,publishableKey,onState=()=>{},onInvalidate=()=>{}}){
  const origin=new URL(url);
  if(!UUID.test(userId)||origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Nije moguće otvoriti zaštićeni raspored.');
  let dead=false,running=null,mode=navigator.onLine?'online':'offline',lastError=null,channel=null,sub=null,invalidTimer=0;
  const scope=origin.host+'/'+userId;
  const store=await openLayoutStore(globalThis.indexedDB,scope);
  const controller=new AbortController(),signal=controller.signal;
  async function session(){
    if(dead)throw Error('Prikaz je zatvoren.');
    const {data,error}=await client.auth.getSession();
    if(dead||error||data?.session?.user?.id!==userId||!data.session.access_token)throw Error('Potrebna je prijava istog operatera.');
    return data.session.access_token;
  }
  try{await session();}catch(e){store.close();throw e;}
  async function report(){
    if(dead)return;
    const ops=await store.list();if(dead)return;
    const issues=ops.filter(o=>o.status==='conflict').map(o=>({id:o.id,area_id:o.payload.area_id,rack:o.payload.rack,reason:o.reason}));
    onState({mode:issues.length?'conflict':mode,pending:ops.filter(o=>o.status==='pending').length,conflicts:issues.length,issues,error:lastError});
  }
  function invalidate(){clearTimeout(invalidTimer);invalidTimer=setTimeout(()=>{if(!dead)Promise.resolve().then(onInvalidate).catch(()=>{});},180);}
  async function request(method,params,body){
    const token=await session();
    const target=new URL('/rest/v1/warehouse_rack_positions',origin);target.search=new URLSearchParams(params).toString();
    const timeout=new AbortController();const abort=()=>timeout.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);
    try{
      const r=await fetch(target,{method,signal:timeout.signal,redirect:'error',cache:'no-store',
        headers:{apikey:publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
      const data=await r.json().catch(()=>null);
      if(!r.ok)throw Object.assign(Error(r.status===401||r.status===403?'Ovlasti nisu potvrđene.':'Spremanje trenutačno nije dostupno.'),{status:r.status,code:data?.code||String(r.status)});
      if(!Array.isArray(data))throw Error('Odgovor poslužitelja nije potvrđen.');
      if(data.length>1)throw Error('Oznaka regala nije jednoznačna.');
      return data[0]||null;
    }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  const transport={read:p=>request('GET',{select:FIELDS,area_id:'eq.'+p.area_id,rack:'eq.'+p.rack}),write:(p,base)=>base?
    request('PATCH',{select:FIELDS,id:'eq.'+base.id,area_id:'eq.'+p.area_id,rack:'eq.'+p.rack,updated_at:'eq.'+base.updated_at},{x:p.x,z:p.z,capacity:p.capacity}):
    request('POST',{select:FIELDS},p)};
  async function cycle(){
    if(dead)return;
    if(!navigator.onLine){mode='offline';await report();return;}
    try{
      const ops=(await store.list()).filter(o=>o.status==='pending').sort((a,b)=>a.at-b.at);
      if(ops.length){mode='syncing';await report();}
      for(const op of ops){
        if(dead)return;
        const result=await applyOperation(op,transport);if(dead)return;
        if(result.kind==='done'){await store.remove(op.id);invalidate();}
        else await store.mark({...op,status:'conflict',reason:result.reason});
      }
      lastError=null;mode='online';
    }catch(e){lastError=e.message;mode=navigator.onLine?'error':'offline';}
    if(!dead)await report();
  }
  let dirty=false;
  function flush(){
    if(dead)return Promise.resolve();
    dirty=true;
    if(!running)running=(async()=>{while(dirty&&!dead){dirty=false;
      // CAS/unique constraints protect even browsers without Web Locks.
      if(navigator.locks)await navigator.locks.request('asc.layout:'+scope,cycle);else await cycle();
    }})().finally(()=>{running=null;});
    return running;
  }
  const refresh=()=>{if(!dead){invalidate();void flush().catch(()=>{});}};
  const offline=()=>{mode='offline';void report().catch(()=>{});};
  const visible=()=>{if(!document.hidden)refresh();};
  window.addEventListener('online',refresh);window.addEventListener('offline',offline);
  window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  const poll=setInterval(()=>{if(!document.hidden&&navigator.onLine)refresh();},30000);
  function dispose(){if(dead)return;dead=true;controller.abort();clearInterval(poll);clearTimeout(invalidTimer);
    window.removeEventListener('online',refresh);window.removeEventListener('offline',offline);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);
    sub?.unsubscribe();if(channel)Promise.resolve(client.removeChannel(channel)).catch(()=>{});store.close();}
  try{
    sub=client.auth.onAuthStateChange((_event,s)=>{if(!s||s.user?.id!==userId)dispose();}).data.subscription;
    channel=client.channel('spatial-layout-'+crypto.randomUUID());
    for(const table of ['warehouse_areas','warehouse_rack_positions','warehouse_space_bindings','locations','storage_sets','tires'])channel.on('postgres_changes',{event:'*',schema:'public',table},invalidate);
    channel.subscribe();
  }catch{/* Polling remains active when realtime is unavailable. */}
  void flush().catch(()=>{});
  return {
    flush,dispose,
    async enqueue(input){await session();const op=makeOperation(input);try{await store.add(op);}catch(e){if(e.name==='ConstraintError')throw Error('Za ovaj regal već postoji lokalna promjena.');throw e;}
      await report();void flush().catch(()=>{});return op.id;},
    async discard(id){await session();const row=(await store.list()).find(o=>o.id===id&&o.status==='conflict');if(row)await store.remove(id);await report();},
    async cacheLayout(layout){await session();if(!dead)await store.cache(cleanLayout(layout));},
    async readLayout(){await session();const layout=await store.read();return !dead&&layout&&Date.now()-layout.cachedAt<7*864e5?layout:null;}
  };
}
