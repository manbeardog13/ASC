// Synthetic browser check for the operator-built warehouse map. No production
// auth or data: supabaseClient.js and db.js are replaced with stubs, the
// "shared backend" is an in-memory store in this Node process standing in for
// warehouse_areas / warehouse_rack_positions, and every non-loopback request
// is aborted.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(path.join(__dirname,'..'));
const output=path.resolve(process.env.ASC_TEST_OUTPUT||path.join(root,'out','assistant-tests'));fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const store={areas:[],positions:[],writes:0,failPosition:false};let seq=0,localSeed;
const key=v=>String(v??'').normalize('NFC').trim().replace(/\s+/g,' ').toUpperCase();
function stub(op,body){
 if(op==='layout')return {status:200,json:{available:true,areas:store.areas,positions:store.positions}};
 if(op==='pos'&&store.failPosition)return {status:503,json:{error:'Synthetic write failure'}};
 store.writes++;
 if(op==='area'){if(store.areas.some(a=>a.zone===body.zone))return {status:409,json:{error:'That already exists.'}};const row={id:'area-'+(++seq),warehouse:'main',...body};store.areas.push(row);return {status:200,json:row};}
 if(op==='delarea'){if(store.positions.some(p=>p.area_id===body.id))return {status:409,json:{error:'in use'}};store.areas=store.areas.filter(a=>a.id!==body.id);return {status:200,json:{}};}
 if(op==='pos'){const i=store.positions.findIndex(p=>p.area_id===body.area_id&&p.rack===body.rack);const row={id:i>=0?store.positions[i].id:'pos-'+(++seq),...body};if(i>=0)store.positions[i]=row;else store.positions.push(row);return {status:200,json:row};}
 if(op==='move'){const p=store.positions.find(p=>p.area_id===body.from_area_id&&p.rack===body.rack);if(p)Object.assign(p,{area_id:body.to_area_id,x:body.x,z:body.z});return {status:p?200:404,json:p||{error:'Position missing'}};}
 return {status:404,json:{}};
}
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/__stub/')){let b='';req.on('data',c=>b+=c);req.on('end',()=>{const r=stub(url.pathname.slice(8),b?JSON.parse(b):null);res.writeHead(r.status,{'Content-Type':'application/json'}).end(JSON.stringify(r.json));});return;}
 const rel=decodeURIComponent(url.pathname).replace(/^\/ASC\//,'');const file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b);});});
const synthetic=`const session={user:{id:'synthetic-ui-test'},expires_at:Math.floor(Date.now()/1000)+3600};`;
const auth=synthetic+`export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`;
const db=synthetic+`window.__dbWrites=window.__dbWrites||[];const seats=[{id:'location-syn-1',warehouse:'main',zone:'SYN',rack:'01',shelf:'1',slot:'01',status:'free'},{id:'location-syn-2',warehouse:'main',zone:'SYN',rack:'02',shelf:'1',slot:'01',status:'free'},{id:'location-b2-1',warehouse:'main',zone:'B2',rack:'K1',shelf:'1',slot:'01',status:'free'}];
const api=async(p,b)=>{const r=await fetch('/__stub/'+p,{method:b?'POST':'GET',body:b?JSON.stringify(b):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||'stub error');return j;};
export const getSession=async()=>session;export const loadMyProfile=async()=>({full_name:'UI test',role:window.__role||'employee'});
export const canEditWarehouse=(r)=>['admin','manager','employee','reception'].includes(r);
export const countLocations=async()=>seats.length;export const listLocationSeats=async()=>{if(window.__seatsFail)throw Error('Synthetic location outage');return seats.map(r=>({...r}));};
const inventorySets=[{id:'synthetic-set-1',public_code:'ASC-SYN-1',location_id:'location-syn-1',zone:'SYN',rack:'01',shelf:'1',slot:'01',quantity:4,status:'in_storage',vehicle:{id:'synthetic-vehicle',plate:'SYN-ONLY',customer:{id:'synthetic-customer',name:'Synthetic Customer'}},tires:[]}];
export const listWarehouseInventory=async()=>({sets:inventorySets,locations:await listLocationSeats(),readCompletedAt:new Date().toISOString()});
export const listWarehouseSpaceBindings=async()=>({available:false,bindings:[]});
export const findLocationByQr=async(q)=>q==='QR-SYN-01-1-01'?{warehouse:'main',zone:'syn',rack:'01',shelf:'1',slot:'01',qr_code:q}:null;
export const loadStorageSet=async(c)=>c==='ASC-SYN-1'?{public_code:c,zone:'SYN',rack:'01',shelf:'1',slot:'01'}:null;
export const listWarehouseLayout=async()=>window.__sharedOff?{available:false,areas:[],positions:[]}:api('layout');
export const createWarehouseArea=async(r)=>api('area',r);export const deleteWarehouseArea=async(id)=>api('delarea',{id});
export const saveRackPosition=async(r)=>api('pos',r);export const moveRackPosition=async(r)=>api('move',r);
export const createLocations=async(rows)=>{window.__dbWrites.push(rows);return [{zone:'A',rack:'1',shelf:'1',slot:'1',qr_code:'qa'},{zone:'B',rack:'1',shelf:'1',slot:'1',qr_code:'qb'}];};
export const subscribeToChanges=()=>null;export const unsubscribe=()=>{};export const signOut=async()=>{};export const onAuthChange=()=>{};export const countPendingApprovals=async()=>0;export const markOnboarded=async()=>{};`;
const report={scope:'Synthetic operator-area flow with a stubbed shared backend; no production auth/data',cases:[]};
const AUTH_RE=/access_token|refresh_token|sb-[a-z0-9]+-auth-token|"session"|bearer|eyJ[A-Za-z0-9_-]{10,}/i;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
async function device({width=1440,role='employee',sharedOff=false,seed=null}={}){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce',serviceWorkers:'block'});const errors=[];
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/ASC/js/db.js')return route.fulfill({contentType:'text/javascript',body:db});if(u.pathname==='/ASC/js/supabaseClient.js')return route.fulfill({contentType:'text/javascript',body:auth});if(u.pathname.endsWith('/agent-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.ASC_AGENT_URL="";'});return route.continue();});
 await context.addInitScript(([role,sharedOff,seed])=>{window.__role=role;window.__sharedOff=sharedOff;try{localStorage.setItem('asc.warehouse.preview.tutorial.hr.v1','{"version":1,"status":"dismissed"}');if(seed&&!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('asc.warehouse.preview.v2',seed);}}catch{}},[role,sharedOff,seed]);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.open=async(q='')=>{await page.goto(origin+'/ASC/app/warehouse-preview/index.html'+q);await page.waitForSelector('html[data-preview-state="ready"]');};
 page.saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2')||'null'));
 page.sync=()=>page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 return {context,page,errors};
}
const noAuthInStorage=async page=>{const all=await page.evaluate(()=>Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));for(const [k,v] of all)assert.ok(!AUTH_RE.test(k+' '+v),'auth material in localStorage key '+k);};
try{
 // ---- Device 1: offline/device-local build at two widths
 for(const width of [390,1440]){
  const {context,page,errors}=await device({width,sharedOff:true});await page.open();
  assert.ok(await page.locator('#empty-state').isVisible());assert.equal(await page.locator('#place-button').isDisabled(),true);
  await page.waitForFunction(()=>/3 mjesta/.test(document.getElementById('empty-slots')?.textContent||''));
  await page.waitForSelector('#add-area-empty:not([hidden])');await page.locator('#add-area-empty').click();await page.waitForSelector('#area-form');
  await page.locator('#area-zone').fill('SYN');await page.locator('#save-area').click();
  assert.ok(await page.locator('#area-error').isVisible(),'missing size/unit must be rejected');assert.equal(await page.saved(),null);
  await page.locator('input[name="unit"][value="grid"]').check();await page.locator('#area-width').fill('6');await page.locator('#area-depth').fill('4');
  await page.locator('#area-zone').fill('NOPE');await page.locator('#save-area').click();
  await page.waitForFunction(()=>/NOPE/.test(document.getElementById('area-error').textContent));assert.equal(await page.saved(),null,'zone not in locations blocked');
  await page.locator('#area-zone').fill('syn');await page.locator('#save-area').click();
  await page.waitForFunction(()=>document.getElementById('area-code').textContent==='SYN');
  assert.match(await page.locator('#geometry-note').textContent(),/6 × 4 polja mreže/);
  assert.equal(await page.locator('#remove-area-button').isVisible(),true);
  await page.locator('#place-button').click();await page.waitForSelector('#placement-card:not([hidden])');
  await page.waitForFunction(()=>document.querySelectorAll('#rack-options option').length===2);
  for(const [id,v] of [['place-x','-1'],['place-z','0']]){await page.locator('#'+id).fill(v);await page.locator('#'+id).dispatchEvent('change');}
  await page.locator('#place-rack').fill('99');await page.waitForFunction(()=>!document.getElementById('confirm-placement').disabled);await page.locator('#confirm-placement').click();
  await page.waitForFunction(()=>/99/.test(document.getElementById('placement-hint').textContent));assert.equal((await page.saved()).stacks.length,0,'rack not in locations blocked');
  await page.locator('#place-rack').fill('01');await page.locator('#confirm-placement').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2')||'{}').stacks?.length===1);
  const saved=await page.saved();assert.deepEqual([saved.areas[0].id,saved.areas[0].measurementStatus,saved.stacks[0].id,saved.stacks[0].rack],['SYN','operator-grid','SYN-01','01']);
  localSeed=JSON.stringify(saved);
  assert.match(await page.locator('#inspector .inspector-note').textContent(),/polja mreže \(nije izmjereno\)/);
  assert.equal(await page.locator('#remove-area-button').isVisible(),false,'non-empty area cannot be removed');
  for(const q of ['?zone=SYN&rack=01','?zone=syn&rack=01','?slot=QR-SYN-01-1-01','?set=ASC-SYN-1']){
   await page.open(q);await page.waitForFunction(()=>{const i=document.getElementById('inspector');return i&&!i.hidden&&/SYN-01/.test(i.textContent);},null,{timeout:10000}).catch(()=>{throw new Error('navigation failed for '+q);});
  }
  assert.match(await page.locator('#inspector .sub').textContent(),/regal 01/);
  await page.screenshot({path:path.join(output,'operator-area-'+width+'.png')});
  await page.open('?zone=SYN&rack=02');await page.waitForFunction(()=>/regal još nije/.test(document.getElementById('toast').textContent));assert.equal(await page.locator('#inspector').isVisible(),false);
  await page.locator('#view-plan').click();assert.equal(await page.locator('.plan-stack').count(),1);
  assert.match(await page.locator('#plan-view svg').getAttribute('viewBox'),/^-3\.7 -2\.7 7\.4 5\.4$/);
  assert.match(await page.locator('#plan-view svg').innerHTML(),/y="-2\.3"[^>]*>Vrh tlocrta/);
  // empty area removal uses the app dialog, not confirm()
  await page.locator('#view-3d').click();
  await noAuthInStorage(page);
  if(width===1440){
   // one-time upload of this device's layout once the shared backend is reachable
   await page.evaluate(()=>{window.__sharedOff=false;});await page.sync();
   await page.waitForSelector('#upload-layout:not([hidden])');await page.locator('#upload-layout').click();
   await page.waitForFunction(()=>document.getElementById('upload-layout').hidden);
   assert.deepEqual(store.areas.map(a=>a.zone),['SYN']);assert.deepEqual(store.positions.map(p=>[p.rack,p.x]),[['01',-1]]);
   // Device 2: a fresh browser sees the uploaded layout, then adds an area that device 1 picks up
   const d2=await device({width:1440});await d2.page.open();
   await d2.page.waitForFunction(()=>document.querySelectorAll('#areas [data-area]').length===1);assert.equal(await d2.page.locator('#area-code').innerText(),'SVA','remote selected area deletion must return to overview');assert.equal(await d2.page.locator('#placement-card').isVisible(),false,'removed area must cancel placement');
   await d2.page.open('?zone=SYN&rack=01');await d2.page.waitForFunction(()=>/SYN-01/.test(document.getElementById('inspector')?.textContent||''));
   await d2.page.locator('#add-area-button').click();await d2.page.waitForSelector('#area-form');
   await d2.page.locator('#area-zone').fill('b2');await d2.page.locator('input[name="unit"][value="m"]').check();await d2.page.locator('#area-width').fill('5');await d2.page.locator('#area-depth').fill('3');await d2.page.locator('#save-area').click();
   await d2.page.waitForFunction(()=>document.getElementById('area-code').textContent==='B2');
   assert.deepEqual(store.areas.map(a=>[a.zone,a.unit,a.width]),[['SYN','grid',6],['B2','m',5]]);
   await page.sync();await page.waitForFunction(()=>document.querySelectorAll('#areas [data-area]').length===2);
   assert.ok((await page.saved()).areas.some(a=>a.id==='B2'&&a.remoteId),'device 1 received device 2 area');
   // device 1 removes the empty shared area via the app dialog; device 2 sees it go
   await page.locator('#areas [data-area="B2"]').evaluate(n=>n.click());await page.locator('#view-plan').click();await d2.page.locator('#view-plan').click();await d2.page.locator('#place-button').click();await page.waitForSelector('#remove-area-button:not([hidden])');
   let nativeDialog=false;page.on('dialog',d=>{nativeDialog=true;d.dismiss();});
   await page.locator('#remove-area-button').click();await page.waitForSelector('#remove-area-confirm');await page.locator('#remove-area-confirm').click();
   await page.waitForFunction(()=>document.querySelectorAll('#areas [data-area]').length===1);assert.equal(nativeDialog,false);
   assert.deepEqual(store.areas.map(a=>a.zone),['SYN']);assert.equal(await page.locator('#area-code').innerText(),'SVA','deleting the selected plan area must return to overview');
   await d2.page.sync();await d2.page.waitForFunction(()=>document.querySelectorAll('#areas [data-area]').length===1);assert.equal(await d2.page.locator('#area-code').innerText(),'SVA','remote selected area deletion must return to overview');assert.equal(await d2.page.locator('#placement-card').isVisible(),false,'removed area must cancel placement');
   await noAuthInStorage(d2.page);assert.deepEqual(d2.errors,[]);await d2.context.close();
   report.cases.push({case:'two devices share layout via backend',passed:true});
  }
  assert.deepEqual(await page.evaluate(()=>window.__dbWrites),[]);
  assert.deepEqual(errors,[]);report.cases.push({width,passed:true});await context.close();
 }
 // ---- Readonly role: no editing controls
 {const {context,page,errors}=await device({role:'readonly'});await page.open();await page.waitForTimeout(300);
  for(const id of ['add-area-empty','add-area-button','place-button','remove-area-button'])assert.equal(await page.locator('#'+id).isVisible(),false,id+' visible to readonly');
  assert.deepEqual(errors,[]);report.cases.push({case:'readonly gated',passed:true});await context.close();}
 // ---- Legacy pre-area v2 state loads and can gain an area
 {const legacy=JSON.stringify({version:1,revision:2,stacks:[],tires:[],history:[]});
  const {context,page,errors}=await device({sharedOff:true,seed:legacy});await page.open();
  assert.equal(await page.locator('#download-raw').isVisible(),false);assert.ok(await page.locator('#empty-state').isVisible());
  await page.locator('#add-area-empty').click();await page.locator('#area-zone').fill('SYN');await page.locator('input[name="unit"][value="m"]').check();await page.locator('#area-width').fill('4');await page.locator('#area-depth').fill('4');await page.locator('#save-area').click();
  await page.waitForFunction(()=>document.getElementById('area-code').textContent==='SYN');assert.equal((await page.saved()).revision,3);await page.locator('#view-plan').click();await page.locator('#remove-area-button').click();await page.locator('#remove-area-confirm').click();await page.waitForFunction(()=>document.getElementById('area-code').textContent==='SVA');assert.equal((await page.saved()).areas.length,0,'local plan deletion stays saved and usable');
  assert.deepEqual(errors,[]);report.cases.push({case:'legacy v2 state',passed:true});await context.close();}
 // ---- Corrupt areas: warned, raw kept, downloadable, never overwritten by sync
 {const corrupt=JSON.stringify({version:1,revision:4,areas:'broken',stacks:[],tires:[],history:[]});
  const {context,page,errors}=await device({seed:corrupt});await page.open();
  await page.waitForSelector('#download-raw:not([hidden])');assert.match(await page.locator('#save-status').textContent(),/nije čitljiva/);
  await page.sync();await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>localStorage.getItem('asc.warehouse.preview.v2')),corrupt,'raw corrupt data must be kept');
  const dl=page.waitForEvent('download');await page.locator('#download-raw').click();const file=await dl;assert.equal(fs.readFileSync(await file.path(),'utf8'),corrupt);
  assert.deepEqual(errors,[]);report.cases.push({case:'corrupt areas kept + warned',passed:true});await context.close();}
 // ---- Locations page: one map link per zone in the batch
 {const {context,page}=await device();await page.goto(origin+'/ASC/app/locations.html');await page.waitForSelector('#loc-zone');
  await page.locator('#loc-zone').fill('A');await page.locator('#loc-racks').fill('1');await page.locator('#loc-shelves').fill('1');await page.locator('#loc-slots').fill('1');
  await page.evaluate(()=>{window.ASCQR=null;document.querySelector('.flow-actions .btn-primary').click();});
  await page.waitForSelector('[data-open-on-map="B"]');
  assert.deepEqual(await page.locator('[data-open-on-map]').evaluateAll(n=>n.map(a=>a.getAttribute('href'))),['warehouse-preview/index.html?zone=A','warehouse-preview/index.html?zone=B']);
  report.cases.push({case:'locations multi-zone links',passed:true});await context.close();}
 // Missing location data must never turn validation off.
 {const {context,page,errors}=await device({sharedOff:true});await context.addInitScript(()=>{window.__seatsFail=true;});await page.open();
  await page.locator('#add-area-empty').click();await page.locator('#area-zone').fill('INVENTED');await page.locator('input[name="unit"][value="grid"]').check();await page.locator('#area-width').fill('4');await page.locator('#area-depth').fill('4');await page.locator('#save-area').click();
  await page.waitForSelector('#area-error:not([hidden])');assert.equal(await page.saved(),null,'unverified zone must not be saved');
  assert.deepEqual(errors,[]);report.cases.push({case:'location outage fails closed',passed:true});await context.close();}
 // A failed shared edit must not be acknowledged or replaced at the next sync.
 {const {context,page,errors}=await device();await page.open('?zone=SYN&rack=01');await page.waitForSelector('#inspector:not([hidden])');
  await page.locator('#stack-tools summary').click();store.failPosition=true;
  const before=await page.saved();await page.locator('#capacity-input').fill('12');await page.locator('#capacity-input').dispatchEvent('change');
  await page.waitForFunction(()=>/Synthetic write failure/.test(document.getElementById('toast').textContent));
  assert.deepEqual(await page.saved(),before,'failed capacity write must preserve saved state');store.failPosition=false;
  await page.locator('#capacity-input').fill('12');await page.locator('#capacity-input').dispatchEvent('change');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2')).stacks[0].capacity===12);
  assert.equal(store.positions[0].capacity,12,'capacity is persisted remotely');
  const d2=await device();await d2.page.open('?zone=SYN&rack=01');await d2.page.waitForFunction(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2'))?.stacks[0]?.capacity===12);
  assert.deepEqual(errors,[]);assert.deepEqual(d2.errors,[]);await noAuthInStorage(page);await noAuthInStorage(d2.page);
  report.cases.push({case:'shared capacity and failed writes',passed:true});await context.close();await d2.context.close();}
 // A readonly user with an offline cache cannot edit through the inspector.
 {const {context,page,errors}=await device({role:'readonly',sharedOff:true,seed:localSeed});await page.open('?zone=SYN&rack=01');await page.waitForSelector('#inspector:not([hidden])');
  assert.equal(await page.locator('#add-tyre').isVisible(),false);assert.equal(await page.locator('#stack-tools').isVisible(),false);
  const before=await page.saved();await page.locator('#capacity-input').evaluate(n=>{n.value='16';n.dispatchEvent(new Event('change'));});
  await page.sync();assert.deepEqual(await page.saved(),before);assert.deepEqual(errors,[]);
  report.cases.push({case:'readonly cached inspector is immutable',passed:true});await context.close();}
 // Interrupted uploads retain their unsent racks and retry the existing area.
 {store.areas=[];store.positions=[];store.failPosition=true;
  const {context,page,errors}=await device({seed:localSeed});await page.open();await page.waitForSelector('#upload-layout:not([hidden])');
  await page.locator('#upload-layout').click();await page.waitForFunction(()=>/Synthetic write failure/.test(document.getElementById('toast').textContent));
  assert.equal(store.areas.length,1);assert.equal(store.positions.length,0);assert.equal((await page.saved()).stacks.length,1);
  assert.equal(await page.locator('#upload-layout').isVisible(),true,'partial upload remains retryable');
  store.failPosition=false;await page.locator('#upload-layout').click();await page.waitForFunction(()=>document.getElementById('upload-layout').hidden);
  assert.equal(store.areas.length,1,'retry must not duplicate area');assert.equal(store.positions.length,1);
  const d2=await device();await d2.page.open('?zone=SYN&rack=01');await d2.page.waitForSelector('#inspector:not([hidden])');
  assert.equal((await d2.page.saved()).stacks.length,1);assert.deepEqual(errors,[]);assert.deepEqual(d2.errors,[]);
  await noAuthInStorage(page);await noAuthInStorage(d2.page);report.cases.push({case:'partial upload retries without losing racks',passed:true});await context.close();await d2.context.close();}
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'AREAS-BROWSER.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
