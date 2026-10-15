// Synthetic browser fixtures only. Every external request is blocked; no live
// account, model, customer, camera or inventory service is contacted.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'out','workflow-review');fs.mkdirSync(output,{recursive:true});
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local'),rel=decodeURIComponent(u.pathname).replace(/^\/ASC\//,'');const file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});});
const session={user:{id:'synthetic-workflow',email:'fixture@example.invalid'},access_token:'synthetic-no-network',expires_at:9999999999};
const baseSet={id:'set-1',public_code:'ASC-2026-0042',status:'in_storage',season:'winter',quantity:4,on_rims:false,paid:true,fee:40,updated_at:new Date().toISOString(),expected_out_date:new Date().toISOString(),vehicle:{id:'car-1',plate:'TEST-42',make:'Fixture',model:'Vozilo',customer:{id:'customer-1',name:'Probni kupac',phone:'',email:''}},tires:[],photos:[]};
const overrides={
 getSession:`async()=>location.pathname.endsWith('/login.html')?null:${JSON.stringify(session)}`,
 loadMyProfile:"async()=>({full_name:'Toni · probni prikaz',role:sessionStorage.getItem('role')||'employee',onboarded_at:'2026-01-01'})",
 listStorageSets:"async()=>{if(sessionStorage.getItem('failData'))throw Error('fixture failure');return [readSet(),{...readSet(),id:'set-2',public_code:'ASC-2026-0043',location_id:'seat-2',slot:'2',vehicle:{...readSet().vehicle,plate:'TEST-43',customer:{id:'customer-2',name:'Drugi probni kupac'}},expected_out_date:null}];}",
 loadStorageSet:"async code=>code==='ASC-2026-0042'?readSet():null",
 listCustomers:"async()=>[{...readSet().vehicle.customer,vehicles:[{...readSet().vehicle,storage_sets:[readSet()]}]}]",
 countsByStatus:"async()=>({in_storage:2,reserved:0,checked_out:0})",
 healthStats:"async()=>({inventory:2,todayCheckIns:1,todayPickups:0})",
 freeSlotsByZone:"async()=>[{zone:'2.1',free:12},{zone:'2.2',free:8}]",
 recentMovements:"async()=>[{action:'in',created_at:new Date().toISOString(),storage_sets:{public_code:'ASC-2026-0042'}}]",
 countLocations:"async()=>12",
 listLocationSeats:"async()=>[]",
 suggestFreeSlot:"async()=>({id:'seat-1',qr_code:'LOC-2.1-A-1-1',zone:'2.1',rack:'A',shelf:'1',slot:'1'})",
 findLocationByQr:"async qr=>qr==='LOC-2.1-A-1-1'?{id:'seat-1',qr_code:qr}:null",
 locationLabel:"row=>[row?.zone,row?.rack,row?.shelf,row?.slot].filter(Boolean).join(' · ')",
 placeSet:"async()=>{sessionStorage.setItem('placeCalls',String(+(sessionStorage.getItem('placeCalls')||0)+1));saveSet({...readSet(),location_id:'seat-1',zone:'2.1',rack:'A',shelf:'1',slot:'1'});return {location:{zone:'2.1',rack:'A',shelf:'1',slot:'1'}};}",
 checkoutSet:"async()=>{sessionStorage.setItem('outCalls',String(+(sessionStorage.getItem('outCalls')||0)+1));saveSet({...readSet(),status:'checked_out',location_id:null,slot:null});return {};}",
 createStorageSet:"async()=>{sessionStorage.setItem('createCalls',String(+(sessionStorage.getItem('createCalls')||0)+1));return readSet().public_code;}",
 loadAuditTrail:"async()=>[]",signedPhotoUrls:"async()=>({})",subscribeToChanges:"()=>null",unsubscribe:"()=>{}",onAuthChange:"()=>({unsubscribe(){}})",countPendingApprovals:"async()=>0",findPossibleDuplicates:"async()=>[]",
};
const names=[...fs.readFileSync(path.join(root,'js/db.js'),'utf8').matchAll(/export (?:async )?function (\w+)/g)].map(m=>m[1]);
const db=`const initial=${JSON.stringify(baseSet)};function readSet(){return JSON.parse(sessionStorage.getItem('fixtureSet')||JSON.stringify(initial));}function saveSet(s){sessionStorage.setItem('fixtureSet',JSON.stringify(s));}\n`+names.map(name=>`export const ${name}=${overrides[name]||'async()=>[]'};`).join('\n');
const auth=`export const isConfigured=()=>true;const session=${JSON.stringify(session)};const chain=new Proxy(()=>{}, {get:(t,k)=>k==='then'?r=>Promise.resolve(r({data:[],error:null})):()=>chain});export const supabase={from:()=>chain,auth:{getSession:async()=>({data:{session:location.pathname.endsWith('/login.html')?null:session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`;
const report={scope:'Local synthetic browser; external requests blocked',viewports:[],journeys:[],errors:[]};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1366,height:1024},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.addInitScript(()=>{sessionStorage.setItem('asc.splash.warm','1');localStorage.setItem('asc.theme','dark');});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/js/db.js'))return route.fulfill({contentType:'text/javascript',body:db});if(u.pathname.endsWith('/js/supabaseClient.js'))return route.fulfill({contentType:'text/javascript',body:auth});if(u.pathname.endsWith('/agent-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.ASC_AGENT_URL="";'});if(u.pathname.endsWith('/app/qr.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'app/qr.js'),'utf8')+'\nwindow.ASCQR.scanInto=()=>{};window.ASCQR.printSticker=()=>true;'});return route.continue();});
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));page.on('console',msg=>{if(msg.type()==='warning')console.log(msg.text());});
 const go=async url=>{await page.goto(origin+'/ASC/app/'+url);};
 const ready=async()=>{await page.waitForSelector('.nero-proposal');await page.waitForSelector('html:not(.splashing)');};
 const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal page overflow');
 for(const [width,height] of (process.env.ASC_JOURNEYS_ONLY ? [] : [[360,800],[390,844],[844,390],[768,1024],[1024,768],[1366,1024],[1920,1080]])){
   await page.setViewportSize({width,height});await go('dashboard.html');await ready();await page.waitForSelector('#glance[data-live="1"]');await overflow();
   const visible=await page.locator('.nero-proposals').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight;});assert.ok(visible,'proposals visible');
   assert.equal(await page.locator('#neroComposer').count(),1);assert.ok(await page.locator('.nero-proposal').count()<=3);
   await page.screenshot({path:path.join(output,'board-'+width+'.png'),fullPage:true});
   await go('login.html');await page.locator('#switch').click();await overflow();
   assert.ok(await page.locator('#last').evaluate(n=>{const r=n.getBoundingClientRect(),p=n.closest('.auth-card').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right;}),'surname fits card');
   await page.screenshot({path:path.join(output,'signup-'+width+'.png'),fullPage:true});
   report.viewports.push({width,height,passed:true});
 }
 await page.setViewportSize({width:1366,height:1024});
 await go('dashboard.html');await ready();
 await page.locator('.board-details summary').first().focus();await page.keyboard.press('Space');assert.ok(await page.locator('.board-details').first().evaluate(n=>n.open));await page.keyboard.press('Space');
 await page.locator('[data-workflow="place"]').click();await ready();
 assert.match(page.url(),/place.html\?set=ASC-2026-0042/);
 await page.locator('[data-workflow="suggest-place"]').click();await page.waitForSelector('[data-workflow="confirm-place"]');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('placeCalls')),null,'suggestion must not place');
 await page.locator('[data-workflow="confirm-place"]').click();await page.waitForURL('**/set-detail.html?code=ASC-2026-0042');await ready();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('placeCalls')),'1');
 await page.locator('[data-workflow="checkout"]').click();await ready();
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-workflow="confirm-checkout"]').click();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('outCalls')),null,'cancelled pickup must not write');
 page.once('dialog',dialog=>dialog.accept());await page.locator('[data-workflow="confirm-checkout"]').click();await page.waitForURL('**/set-detail.html?code=ASC-2026-0042');await ready();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('outCalls')),'1');assert.equal(await page.locator('[data-workflow="checkout"]').count(),0);
 report.journeys.push('dashboard → suggest → place → record → pickup, cancel and confirm');
 await go('locate.html?q=TEST-42');await ready();await page.locator('.flow-hit').first().click();await page.waitForURL('**/set-detail.html?code=ASC-2026-0042');
 report.journeys.push('search opens the real set record');
 await go('checkin.html');await ready();await page.locator('[data-workflow="intake-next"]').click();assert.equal(await page.evaluate(()=>sessionStorage.getItem('createCalls')),null);
 await page.locator('[data-workflow="enter-plate"]').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'v_plate');await page.locator('#v_plate').fill('TEST-NEW');
 await page.locator('[data-workflow="intake-next"]').click();await page.waitForFunction(()=>document.querySelector('[data-workflow="intake-next"]')?.textContent==='Spremi i nastavi');
 report.journeys.push('intake proposals focus the field and retain validation');
 await page.evaluate(()=>sessionStorage.removeItem('fixtureSet'));
 await page.locator('[data-workflow="intake-next"]').click();await page.waitForSelector('[data-workflow="place"]');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('createCalls')),'1');assert.match(await page.locator('[data-workflow="place"]').getAttribute('href'),/place.html\?set=ASC-2026-0042/);
 report.journeys.push('saved intake proposes placement of the newly saved code');
 await go('dashboard.html');await ready();await page.locator('.nero-input').fill('Pronađi komplet');await page.locator('.nero-input').press('Enter');await page.waitForURL('**/locate.html');
 report.journeys.push('typed explicit navigation shares the direct route');
 await page.evaluate(()=>sessionStorage.setItem('role','readonly'));await go('dashboard.html');await ready();await page.waitForFunction(()=>document.getElementById('sbRole')?.textContent==='Pregled');
 assert.equal(await page.locator('[data-workflow="intake"],[data-workflow="place"],[data-workflow="checkout"]').count(),0);
 await page.evaluate(()=>{sessionStorage.setItem('failData','1');});await go('dashboard.html');await ready();assert.ok(await page.locator('#board-retry').isVisible());assert.equal(await page.locator('[data-glance="stored"]').textContent(),'—');
 report.journeys.push('readonly and failed data remain honest');
 await page.evaluate(()=>{sessionStorage.removeItem('failData');sessionStorage.removeItem('role');});await page.locator('#board-retry').click();await page.waitForSelector('#glance[data-live="1"]');
 await page.setViewportSize({width:1366,height:1024});await go('dashboard.html');await ready();
 await page.locator('#sbTheme').click();await page.screenshot({path:path.join(output,'board-light.png'),fullPage:true});await overflow();
 await page.locator('.nero-input').focus();await page.locator('.nero-input').fill('Kako pronaći komplet QR naljepnicom?');await page.locator('.nero-input').press('Enter');await page.waitForSelector('.nero-card-assistant');
 assert.equal(await page.locator('.nero-proposal').count(),3);await page.locator('[data-act="close"]').click();assert.ok(await page.locator('#neroComposer').evaluate(n=>n.classList.contains('is-compact')));
 report.journeys.push('light theme and expanded/collapsed shared conversation');
 // 200% equivalent layout viewport; no clipping at the resulting 683 CSS px.
 await page.setViewportSize({width:683,height:512});await overflow();await page.screenshot({path:path.join(output,'board-zoom-200.png'),fullPage:true});
 assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,process.env.ASC_JOURNEYS_ONLY?'verification-journeys.json':'verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
