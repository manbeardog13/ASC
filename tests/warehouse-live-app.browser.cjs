// Real app UI with synthetic records and a scene API double; no production
// calls. Verifies the data/UI seam independently of WebGL quality checks.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const bindings=[];let writes=0,failBinding=false;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 if(req.url.startsWith('/__bindings')){let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  if(req.method==='POST'){if(failBinding){res.writeHead(503).end('{}');return;}writes++;const row=JSON.parse(body);const index=bindings.findIndex(b=>b.space_id===row.space_id);if(index>=0)bindings.splice(index,1);if(row.area_id)bindings.push(row);}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({available:true,bindings}));
 });return;}
 const rel=decodeURIComponent(new URL(req.url,'http://test').pathname).replace(/^\/ASC\//,'');const file=path.resolve(root,rel);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});
});
const auth=`const session={user:{id:'synthetic-user'},expires_at:Math.floor(Date.now()/1000)+3600};export const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:(cb)=>{window.__authChange=cb;return {data:{subscription:{unsubscribe(){}}}}}}};`;
const db=`
export const loadMyProfile=async()=>({role:window.__role||'employee'});
export const canEditWarehouse=r=>['admin','manager','employee','reception'].includes(r);
const locations=[{id:'loc-1',warehouse:'main',zone:'SYN',rack:'01',shelf:'1',slot:'1',status:'occupied'},{id:'loc-2',warehouse:'main',zone:'SYN',rack:'01',shelf:'1',slot:'2',status:'occupied'},{id:'loc-3',warehouse:'main',zone:'UNMAPPED',rack:'02',shelf:'1',slot:'1',status:'occupied'}];
const make=(id,code,location,quantity,status='in_storage')=>({id,public_code:code,location_id:location,quantity,status,vehicle:{id:'vehicle-'+id,plate:'SYN-'+id,customer:{id:'customer-'+id,name:'Synthetic '+id}},tires:[]});
const sets=[make('set-1','ASC-SYN-1','loc-1',4),make('set-2','ASC-SYN-2','loc-2',6),make('set-3','ASC-UNPLACED','loc-3',4),make('set-4','ASC-CHECKEDOUT',null,4,'checked_out')];
export const listWarehouseInventory=async()=>{if(window.__inventoryFail)throw Error('Synthetic unavailable');return {sets,locations,readCompletedAt:new Date().toISOString()};};
export const listLocationSeats=async()=>locations;
export const countLocations=async()=>locations.length;
export const findLocationByQr=async code=>({warehouse:code==='OTHER-QR'?'other':'main',zone:'SYN',rack:'01',shelf:'1',slot:'1'});
export const listWarehouseLayout=async()=>({available:false,areas:[],positions:[]});
export const listWarehouseSpaceBindings=async()=>{if(window.__bindingUnavailable)return {available:false,bindings:[]};return (await fetch('/__bindings')).json();};
export const saveWarehouseSpaceBinding=async row=>{const r=await fetch('/__bindings',{method:'POST',body:JSON.stringify(row)});if(!r.ok)throw Error('Synthetic rejected');return row;};
export const deleteWarehouseSpaceBinding=async row=>saveWarehouseSpaceBinding({...row,area_id:null});
export const getSession=async()=>({user:{id:'synthetic-user'}});export const subscribeToChanges=()=>null;export const unsubscribe=()=>{};
`;
const scene=`export function createScene(_container,callbacks){window.__sceneError=()=>callbacks.onError(new Error('Synthetic context loss'));window.__scene={focus:[],data:null,bindings:null,focusInventory:null,bindingCalls:0,clearCalls:0};queueMicrotask(()=>callbacks.onReady());return {setData:(s,a)=>{window.__scene.data=s;window.__scene.area=a;},setSelection(){},setBuildingEnabled:value=>window.__scene.buildingEnabled=value,setBuildingBindings:b=>{window.__scene.bindings=b;window.__scene.bindingCalls++;},setInventoryFocus:f=>window.__scene.focusInventory=f,clearFocus:()=>{window.__scene.focusInventory=null;window.__scene.clearCalls++;},focusSet:id=>{if(window.__focusFail)return false;window.__scene.focus.push(id);return true;},focusStack(){},getPlacementIssues:()=>window.__physicalIssue?[{stackId:'SYN-01',areaId:'SYN',spaceId:'attic-parts',reason:'outside-building-floor'}]:[],setActivityBlocked(){},setMode(){},setPlacementPreview(){},resize(){},resume(){},pause(){},dispose(){window.__scene.disposed=true;},reset(){},zoom(){}};}`;
(async()=>{
 const model=await import('../app/warehouse-preview/model.js');let seed=model.createArea(model.emptyState(),{id:'SYN',name:'Synthetic area',width:6,depth:4,unit:'m'});seed=model.markAreaShared(seed,'SYN','remote-syn');seed=model.createStack(seed,{areaId:'SYN',x:0,z:0,rack:'01',capacity:8});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 async function device({role='employee',fail=false,width=1440,seedValue=seed,query='',integrationReady=true}={}){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();const body=url.pathname.endsWith('/js/db.js')?db:url.pathname.endsWith('/js/supabaseClient.js')?auth:url.pathname.endsWith('/warehouse-preview/scene.js')?scene:url.pathname.endsWith('/warehouse-preview/building.js')?`export const BUILDING_TOPOLOGY={integrationReady:${integrationReady}};`:null;return body?route.fulfill({contentType:'text/javascript',body}):route.continue();});
  await context.addInitScript(({seed,role,fail})=>{window.__role=role;window.__inventoryFail=fail;localStorage.setItem('asc.warehouse.preview.v2',JSON.stringify(seed));localStorage.setItem('asc.warehouse.preview.tutorial.hr.v1','{"version":1,"status":"dismissed"}');},{seed:seedValue,role,fail});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/ASC/app/warehouse-preview/index.html'+query);await page.waitForSelector('html[data-preview-state="ready"]');return {context,page,errors};
 }
 try{
  const {context,page,errors}=await device();await page.waitForFunction(()=>window.__scene?.data?.tires?.length===10);
  assert.equal(await page.evaluate(()=>window.__scene.buildingEnabled),true);
  assert.match(await page.locator('#inventory-status').innerText(),/10 guma s 3D položajem.*1 kompleta.*2 guma iznad/);
  assert.equal(await page.locator('#stat-vacant').innerText(),'0');
  const beforeRefresh=await page.evaluate(()=>({bindings:window.__scene.bindingCalls,clears:window.__scene.clearCalls}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(80);assert.deepEqual(await page.evaluate(()=>({bindings:window.__scene.bindingCalls,clears:window.__scene.clearCalls})),beforeRefresh,'routine refresh must not reset camera bindings or idle focus');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2'))),seed,'live data must never enter persisted geometry');
  await page.locator('#search').fill('ASC-SYN-1');await page.locator('[data-set-result="set-1"]').click();
  assert.deepEqual(await page.evaluate(()=>window.__scene.focus),['set-1']);assert.equal(await page.evaluate(()=>window.__scene.focusInventory.tireIds.length),4,'only the requested set is highlighted');
  assert.equal(await page.locator('#add-tyre').count(),0);assert.equal(await page.locator('#remove-top').count(),0);
  await page.locator('.tyre-row').first().click();
  assert.equal(await page.locator('#tyre-details a[href="../customers.html?id=customer-set-1"]').count(),1);
  assert.equal(await page.locator('#tyre-details a[href="../checkout.html?set=ASC-SYN-1"]').count(),1);
  await page.locator('#search').fill('ASC-UNPLACED');await page.locator('[data-set-result="set-3"]').click();
  assert.match(await page.locator('#dialog').innerText(),/Zona još nema/);assert.equal((await page.evaluate(()=>window.__scene.focus)).includes('set-3'),false);await page.locator('#close-dialog').click();
  await page.locator('#search').fill('ASC-CHECKEDOUT');await page.locator('[data-set-result="set-4"]').click();assert.match(await page.locator('#dialog').innerText(),/nije aktivan/);await page.locator('#close-dialog').click();
  await page.locator('#search').fill('');await page.locator('#menu-button').click();await page.locator('#building-bindings-button').click();
  await page.locator('#bind-attic-parts').selectOption('remote-syn');await page.locator('[data-space-form="attic-parts"] button').click();
  await page.waitForFunction(()=>window.__scene.bindings.SYN==='attic-parts');assert.equal(writes,1);await page.locator('#close-dialog').click();
  const d2=await device({role:'viewer',width:390});await d2.page.waitForFunction(()=>window.__scene?.bindings?.SYN==='attic-parts');
  await d2.page.locator('#menu-button').click();await d2.page.locator('#building-bindings-button').click();assert.equal(await d2.page.locator('.space-binding-row button').count(),0);assert.equal(await d2.page.locator('#bind-attic-parts').isDisabled(),true);await d2.page.locator('#close-dialog').click();
  await d2.page.goto(origin+'/ASC/app/warehouse-preview/index.html?slot=OTHER-QR');await d2.page.waitForFunction(()=>/nije u prikazanom skladištu/.test(document.getElementById('toast').textContent));assert.equal(await d2.page.locator('#inspector').isVisible(),false,'other warehouse QR must not focus MAIN');
  await page.evaluate(()=>{window.__physicalIssue=true;window.dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>/10 guma u 1 regala samo u tlocrtu/.test(document.getElementById('inventory-status').textContent));
  await page.locator('#search').fill('ASC-SYN-1');await page.locator('[data-set-result="set-1"]').click();assert.equal(await page.locator('#plan-view').isVisible(),true);assert.match(await page.locator('#toast').innerText(),/3D položaj nije potvrđen/);
  await page.evaluate(()=>{window.__physicalIssue=false;window.__focusFail=true;window.dispatchEvent(new Event('focus'));});await page.locator('#view-3d').click();await page.locator('#search').fill('ASC-SYN-2');await page.locator('[data-set-result="set-2"]').click();assert.equal(await page.locator('#plan-view').isVisible(),true,'focusSet false must route to plan');await page.evaluate(()=>window.__focusFail=false);
  failBinding=true;await page.locator('#menu-button').click();await page.locator('#building-bindings-button').click();await page.locator('#bind-attic-parts').selectOption('');await page.locator('[data-space-form="attic-parts"] button').click();await page.waitForSelector('.binding-message:not([hidden])');assert.equal(await page.evaluate(()=>window.__scene.bindings.SYN),'attic-parts');assert.equal(writes,1);await page.locator('#close-dialog').click();
  await page.evaluate(()=>{window.__inventoryFail=true;window.dispatchEvent(new Event('focus'));});await page.waitForFunction(()=>document.getElementById('inventory-health').dataset.state==='stale');assert.equal(await page.evaluate(()=>window.__scene.data.tires.length),10);
  const failed=await device({fail:true});await failed.page.waitForFunction(()=>document.getElementById('inventory-health').dataset.state==='error');assert.equal(await failed.page.locator('#stat-tyres').innerText(),'—');assert.match(await failed.page.locator('#inventory-status').innerText(),/nije dostupna/);
  await page.evaluate(()=>window.__authChange('SIGNED_OUT',null));await page.waitForSelector('html[data-preview-state="locked"]');assert.equal(await page.locator('#preview-root').getAttribute('inert'),'');assert.equal(await page.evaluate(()=>window.__scene.disposed),true);
  const review=await device({integrationReady:false});await review.page.waitForFunction(()=>window.__scene?.data?.tires?.length===10);assert.equal(await review.page.evaluate(()=>window.__scene.buildingEnabled),false,'unreviewed architecture must not replace operational areas');
  await review.page.evaluate(()=>{window.__physicalIssue=true;window.dispatchEvent(new Event('focus'));});await review.page.waitForFunction(()=>/10 guma s 3D položajem/.test(document.getElementById('inventory-status').textContent));assert.doesNotMatch(await review.page.locator('#inventory-status').innerText(),/samo u tlocrtu/,'disabled architecture must not exclude valid legacy area tires');
  await review.page.locator('#search').fill('ASC-SYN-1');await review.page.locator('[data-set-result="set-1"]').click();assert.deepEqual(await review.page.evaluate(()=>window.__scene.focus),['set-1'],'exact live focus remains operational before architecture approval');
  await review.page.locator('#menu-button').click();assert.equal(await review.page.locator('#building-study-link').getAttribute('href'),'../../design/warehouse-review.html');await review.page.locator('#building-bindings-button').click();assert.match(await review.page.locator('#dialog').innerText(),/Model zgrade je u provjeri/);await review.page.locator('#close-dialog').click();
  await review.page.evaluate(()=>window.__sceneError());assert.match(await review.page.locator('#inventory-status').innerText(),/0 guma s 3D položajem.*10 guma u 1 regala samo u tlocrtu/);const focusCount=await review.page.evaluate(()=>window.__scene.focus.length);await review.page.locator('#search').fill('ASC-SYN-2');await review.page.locator('[data-set-result="set-2"]').click();assert.equal(await review.page.evaluate(()=>window.__scene.focus.length),focusCount,'context loss must block camera focus');assert.equal(await review.page.locator('#plan-view').isVisible(),true);
  const legacySeed=structuredClone(seed);delete legacySeed.stacks[0].rack;const legacy=await device({seedValue:legacySeed,query:'?slot=MAIN-QR'});await legacy.page.waitForFunction(()=>/regal još nije/.test(document.getElementById('toast').textContent));assert.equal(await legacy.page.locator('#inspector').isVisible(),false,'legacy stack ID must not substitute for explicit rack binding');
  assert.deepEqual(errors,[]);assert.deepEqual(d2.errors,[]);assert.deepEqual(failed.errors,[]);assert.deepEqual(legacy.errors,[]);assert.deepEqual(review.errors,[]);
  await Promise.all([context.close(),d2.context.close(),failed.context.close(),legacy.context.close(),review.context.close()]);console.log('warehouse live app: exact sets, coverage, record links, shared bindings, roles, failed writes, stale data, exact warehouse QR, no legacy ID guesses, physical exclusions, 2D fallback, idle-preserving refresh, architecture readiness gate, context-loss fallback, auth cleanup passed');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
