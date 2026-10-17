// Synthetic browser check: empty warehouse -> operator creates an area -> binds a
// stack to a real rack -> deep link ?zone=&rack= navigates to it. No production
// auth or data: supabase client and db.js are replaced with in-page stubs and
// every non-loopback request is aborted.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(path.join(__dirname,'..'));
const output=path.resolve(process.env.ASC_TEST_OUTPUT||path.join(root,'out','assistant-tests'));fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname).replace(/^\/ASC\//,'');const file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b);});});
const synthetic=`const session={user:{id:'synthetic-ui-test'},expires_at:Math.floor(Date.now()/1000)+3600};`;
const auth=synthetic+`export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`;
// Two synthetic location rows in zone SYN; writes are recorded so the test can prove none happen.
const db=synthetic+`window.__dbWrites=[];const seats=[{warehouse:'main',zone:'SYN',rack:'01',shelf:'1',slot:'01',status:'free'},{warehouse:'main',zone:'SYN',rack:'02',shelf:'1',slot:'01',status:'free'}];
export const getSession=async()=>session;export const loadMyProfile=async()=>({full_name:'UI test',role:'readonly'});export const countLocations=async()=>seats.length;export const listLocationSeats=async()=>seats.map(r=>({...r}));
export const findLocationByQr=async()=>null;export const loadStorageSet=async()=>null;export const createLocations=async(r)=>{window.__dbWrites.push(r);return [];};export const subscribeToChanges=()=>null;export const unsubscribe=()=>{};export const signOut=async()=>{};export const onAuthChange=()=>{};export const countPendingApprovals=async()=>0;`;
const report={scope:'Synthetic operator-area flow; no production auth/data',cases:[]};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce',serviceWorkers:'block'});const errors=[];
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/ASC/js/db.js')return route.fulfill({contentType:'text/javascript',body:db});if(u.pathname==='/ASC/js/supabaseClient.js')return route.fulfill({contentType:'text/javascript',body:auth});if(u.pathname.endsWith('/agent-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.ASC_AGENT_URL="";'});return route.continue();});
 await context.addInitScript(()=>{try{localStorage.setItem('asc.warehouse.preview.tutorial.hr.v1','{"version":1,"status":"dismissed"}');}catch{}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/ASC/app/warehouse-preview/index.html');await page.waitForSelector('html[data-preview-state="ready"]');
 // 1. empty state
 assert.ok(await page.locator('#empty-state').isVisible());assert.equal(await page.locator('#place-button').isDisabled(),true);
 await page.waitForFunction(()=>/2 mjesta/.test(document.getElementById('empty-slots')?.textContent||''));
 // 2. area creation: incomplete form rejected, nothing saved
 await page.locator('#add-area-empty').click();await page.waitForSelector('#area-form');
 await page.locator('#area-zone').fill('SYN');await page.locator('#save-area').click();
 assert.ok(await page.locator('#area-error').isVisible(),'missing size/unit must be rejected');
 assert.equal(await page.evaluate(()=>localStorage.getItem('asc.warehouse.preview.v2')),null);
 assert.equal(await page.locator('#zone-options option[value="SYN"]').count(),1,'live zones offered');
 await page.locator('input[name="unit"][value="grid"]').check();await page.locator('#area-width').fill('6');await page.locator('#area-depth').fill('4');await page.locator('#save-area').click();
 await page.waitForFunction(()=>document.getElementById('area-code').textContent==='SYN');
 assert.equal(await page.locator('#empty-state').isVisible(),false);assert.equal(await page.locator('#place-button').isDisabled(),false);
 assert.match(await page.locator('#geometry-note').textContent(),/6 × 4 polja mreže/);
 assert.equal(await page.locator('#remove-area-button').isVisible(),true);
 // 3. bind a stack to rack 01 via coordinates
 await page.locator('#place-button').click();await page.waitForSelector('#placement-card:not([hidden])');
 await page.waitForFunction(()=>document.querySelectorAll('#rack-options option').length===2);
 await page.locator('#place-x').fill('-1');await page.locator('#place-x').dispatchEvent('change');await page.locator('#place-z').fill('0');await page.locator('#place-z').dispatchEvent('change');
 await page.locator('#place-rack').fill('01');
 await page.waitForFunction(()=>!document.getElementById('confirm-placement').disabled);await page.locator('#confirm-placement').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2')||'{}').stacks?.length===1);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('asc.warehouse.preview.v2')));
 assert.deepEqual([saved.areas[0].id,saved.areas[0].measurementStatus,saved.stacks[0].id,saved.stacks[0].rack],['SYN','operator-grid','SYN-01','01']);
 assert.equal(await page.locator('#remove-area-button').isVisible(),false,'non-empty area cannot be removed');
 assert.ok(!/token|session|access_token/i.test(JSON.stringify(saved)),'no auth material in map storage');
 // 4. navigation: deep link to zone/rack selects the bound stack after reload
 await page.goto(origin+'/ASC/app/warehouse-preview/index.html?zone=SYN&rack=01');await page.waitForSelector('html[data-preview-state="ready"]');
 await page.waitForFunction(()=>document.getElementById('inspector')&&!document.getElementById('inspector').hidden&&/SYN-01/.test(document.getElementById('inspector').textContent));
 assert.match(await page.locator('#inspector .sub').textContent(),/regal 01/);
 await page.screenshot({path:path.join(output,'operator-area-'+width+'.png')});
 // unknown rack never guessed
 await page.goto(origin+'/ASC/app/warehouse-preview/index.html?zone=SYN&rack=02');await page.waitForSelector('html[data-preview-state="ready"]');
 await page.waitForFunction(()=>/regal još nije/.test(document.getElementById('toast').textContent));
 assert.equal(await page.locator('#inspector').isVisible(),false);
 // 5. plan view renders the operator area
 await page.locator('#view-plan').click();assert.equal(await page.locator('.plan-stack').count(),1);
 assert.deepEqual(await page.evaluate(()=>window.__dbWrites),[]);
 assert.deepEqual(errors,[]);report.cases.push({width,passed:true});await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'AREAS-BROWSER.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
