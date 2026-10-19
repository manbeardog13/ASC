const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const output=path.resolve(process.env.ASC_TEST_OUTPUT||path.join(root,'out','assistant-tests'));fs.mkdirSync(output,{recursive:true});
const report={scope:'Isolated Chromium, synthetic session and blocked external requests; no production auth/data',cases:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');const rel=decodeURIComponent(url.pathname).replace(/^\/ASC\//,'');const file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(b);});});
const synthetic=`const session={user:{id:'synthetic-ui-test'},expires_at:Math.floor(Date.now()/1000)+3600};`;
const auth=synthetic+`export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`;
const db=synthetic+`export const getSession=async()=>session; export const loadMyProfile=async()=>({full_name:'UI test',role:'readonly'});export const listCustomers=async()=>[];export const subscribeToChanges=()=>null;export const unsubscribe=()=>{};export const countsByStatus=async()=>({});export const listStorageSets=async()=>[];export const healthStats=async()=>({inventory:0,todayCheckIns:0,todayPickups:0});export const signOut=async()=>{};export const onAuthChange=()=>{};export const countPendingApprovals=async()=>0;export const canEditWarehouse=(r)=>['admin','manager','employee','reception'].includes(r);`;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});try{
for(const width of [390,768,1440]){
const context=await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce',serviceWorkers:'block'});
const errors=[];
await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/ASC/js/db.js')return route.fulfill({contentType:'text/javascript',body:db});if(u.pathname==='/ASC/js/supabaseClient.js')return route.fulfill({contentType:'text/javascript',body:auth});if(u.pathname.endsWith('/agent-config.js'))return route.fulfill({contentType:'text/javascript',body:'window.ASC_AGENT_URL="";'});return route.continue();});
await context.addInitScript(()=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded','1');localStorage.setItem('asc.warehouse.preview.v1','{"demo":true}');localStorage.setItem('asc.warehouse.preview.view.v1','{}');localStorage.setItem('asc.warehouse.preview.checks.v1','{}');}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/ASC/app/warehouse-preview/index.html');await page.waitForSelector('html[data-preview-state="ready"] #asc-navigation a');
assert.equal(await page.locator('#asc-navigation a').count(),11);
assert.equal(await page.locator('a[href$="warehouse.html"]').count(),0);
const initialHistory=await page.evaluate(()=>history.length);
assert.ok(await page.locator('#empty-state').isVisible(),'empty state hidden');assert.equal(await page.locator('#area-code').textContent(),'SVA');assert.equal(await page.locator('#area-tabs').isVisible(),false);assert.equal(await page.locator('#place-button').isDisabled(),true);assert.equal(await page.locator('#list-button').isDisabled(),true);assert.equal(await page.locator('#inspector').isVisible(),false);assert.equal(await page.locator('#empty-state a[href$="locations.html"]').count(),1);
assert.equal(await page.evaluate(()=>['asc.warehouse.preview.v1','asc.warehouse.preview.view.v1','asc.warehouse.preview.checks.v1'].some(k=>localStorage.getItem(k)!==null)),false,'legacy demo keys survived');
await page.locator('#view-plan').click();assert.equal(await page.locator('.plan-stack').count(),0);await page.locator('#view-3d').click();
await page.screenshot({path:path.join(output,'empty-'+width+'.png'),fullPage:true});
assert.equal(await page.evaluate(()=>history.length),initialHistory);
// The in-page '#asc-menu-button' strip is hidden since 71faff5 (declutter); the header burger is the visible opener on narrow screens, and the sidebar is always shown above 1020px.
const mobile=width<=1020,opener='#open-sidebar';assert.equal(await page.locator('#asc-menu-button').isVisible(),false);assert.equal(await page.locator(opener).isVisible(),mobile);
if(mobile)await page.locator(opener).click();assert.equal(await page.locator(opener).getAttribute('aria-expanded'),'true');if(mobile)assert.equal(await page.locator('#main-content').evaluate(n=>n.inert),true);
await page.locator('#asc-navigation .sb-group > button').click();assert.equal(await page.locator('#asc-navigation .sb-group-kids').evaluate(n=>n.inert),true);
await page.keyboard.press('Escape');assert.equal(await page.locator(opener).getAttribute('aria-expanded'),mobile?'false':'true');if(mobile)assert.equal(await page.evaluate(()=>document.activeElement.id),'open-sidebar');else assert.ok(await page.evaluate(()=>document.getElementById('sidebar').contains(document.activeElement)),'desktop Escape moved focus out of the sidebar');
// Opened from the hidden strip (e.g. a stale script or assistive tech), Escape must still land focus on a visible opener, not the hidden button.
if(mobile){await page.evaluate(()=>{document.activeElement.blur();document.getElementById('asc-menu-button').click();});
await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'open-sidebar');
await page.locator(opener).click();}
await page.locator('#asc-navigation a[href$="customers.html"]').click();await page.waitForURL('**/customers.html');await page.waitForSelector('.side .sb-nav');
await page.evaluate(()=>history.replaceState({unrelated:'preserved'},''));
if(width<=1020)await page.locator('.top .sb-burger').click();await page.locator('.side .sb-group > button').click();await page.locator('.side a[href$="warehouse-preview/index.html"]').click();await page.waitForURL('**/warehouse-preview/index.html');await page.waitForSelector('html[data-preview-state="ready"]');
await page.goBack();await page.waitForURL('**/customers.html');await page.waitForSelector('html.side-open');assert.equal(await page.locator('.top .sb-burger').getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>Boolean(history.state?.ascWarehouseMenuReturn)),false);assert.equal(await page.evaluate(()=>history.state.unrelated),'preserved');assert.equal(await page.locator('.side .sb-group > button').getAttribute('aria-expanded'),'true');assert.equal(await page.locator('.side .sb-group-kids').evaluate(n=>n.inert),false);assert.equal(await page.locator('.side a[href$="warehouse.html"]').count(),0);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
await page.screenshot({path:path.join(output,'menu-return-'+width+'.png')});
await page.goto(origin+'/ASC/app/warehouse-preview/');await page.waitForSelector('html[data-preview-state="ready"] #asc-navigation a');const directoryHistory=await page.evaluate(()=>history.length);if(mobile)await page.locator(opener).click();await page.locator('#asc-navigation a[aria-current="page"]').click();assert.ok(page.url().endsWith('/warehouse-preview/'));assert.equal(await page.evaluate(()=>history.length),directoryHistory);
await page.goto(origin+'/ASC/app/warehouse.html');await page.waitForURL('**/customers.html');
assert.deepEqual(errors,[]);report.cases.push({width,passed:true,checks:['shared nested menu links','blank-slate empty state','legacy demo storage removed','no stacks in plan view','menu inert/expanded state','native browser Back restores originating menu','legacy bookmark redirects to saved records','collapsed subgroup inert','visible opener focus restoration','source submenu and unrelated history state restored','directory self-link adds no Back step','no page errors/overflow']});await context.close();
}
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'BROWSER-VERIFICATION.json'),JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
