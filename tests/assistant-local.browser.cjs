const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const rows=[
  {public_code:'ASC-001',status:'in_storage',quantity:4,season:'winter',zone:'2.3',rack:'S025',vehicle:{plate:'ZG123AA',customer:{name:'Marko Marić'}},tires:[]},
  {public_code:'ASC-002',status:'reserved',quantity:4,season:'summer',zone:'2.1',rack:'S010',vehicle:{plate:'ZG999BB',customer:{name:'Marko Horvat'}},tires:[]}
];
const session="{access_token:'synthetic-only',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'fixture'}}";
const auth=`const session=${session};export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(table){if(table!=='storage_sets')throw Error('Unexpected table');window.localReads=(window.localReads||0)+1;const query={select(){return this;},is(){return this;},order(){return this;},limit(){return this;},abortSignal(){return this;},then(resolve,reject){const work=window.delayLocalRead?new Promise(r=>window.releaseLocalRead=r):Promise.resolve();return work.then(()=>({data:${JSON.stringify(rows)},error:null})).then(resolve,reject);}};return query;}};`;
const db=`export const getSession=async()=>(${session});export const loadMyProfile=async()=>({role:'admin',full_name:'Synthetic'});export const listCustomers=async()=>[];export const listStorageSets=async()=>[];export const subscribeToChanges=()=>null;export const unsubscribe=()=>{};export const countsByStatus=async()=>({in_storage:0,reserved:0,checked_out:0,missing:0});export const healthStats=async()=>({});export const signOut=async()=>{};export const onAuthChange=()=>{};export const countPendingApprovals=async()=>0;`;
const server=http.createServer((req,res)=>{const p=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/ASC\//,''));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(p,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/octet-stream'});res.end(e?'':b);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const report=[];
  try{for(const width of [390,768,1440]){
    const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'}),providerRequests=[];
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.includes('/functions/'))providerRequests.push(u.pathname);if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/js/supabaseClient.js'))return route.fulfill({contentType:'text/javascript',body:auth});if(u.pathname.endsWith('/js/db.js'))return route.fulfill({contentType:'text/javascript',body:db});if(/\/app\/live-/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:'// Data views are outside this isolated assistant fixture.'});return route.continue();});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/ASC/app/customers.html');await page.locator('.asc-chat-launcher:not([disabled])').click();
    const chat=page.locator('#asc-agent');
    assert.equal(await chat.locator('.asc-chat-remote').isVisible(),false);
    const ask=async text=>{await chat.locator('textarea').fill(text);await chat.locator('form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('#asc-agent form').getAttribute('aria-busy')==='false');return chat.locator('.is-local').last().textContent();};
    assert.match(await ask('pronađi Marko'),/2 kompleta/);assert.match(await chat.locator('.asc-chat-actions').textContent(),/ASC-001.*Marko/);assert.ok(await chat.locator('.asc-chat-actions button').count()>=2);assert.match(page.url(),/customers/);
    assert.match(await ask('pronađi ZG123AA'),/ASC-001/);
    const unknown=await ask('Write a sonnet about Neptune');assert.ok(unknown.length>20);assert.equal(await page.evaluate(()=>typeof window.ASCAgent),'undefined');
    const before=await chat.locator('.is-local').count();await page.evaluate(()=>window.delayLocalRead=true);await chat.locator('textarea').fill('pronađi ASC-001');
    const immediate=await chat.locator('form').evaluate(f=>{f.requestSubmit();return document.querySelector('.asc-chat-status').textContent;});assert.equal(immediate,'Primljeno…');
    await page.waitForFunction(()=>typeof window.releaseLocalRead==='function');await chat.locator('.asc-chat-stop').click();await page.evaluate(()=>releaseLocalRead());await page.waitForTimeout(100);
    assert.equal(await chat.locator('.is-local').count(),before);assert.match(await chat.locator('.asc-chat-status').textContent(),/Zaustavljeno/);
    await page.addScriptTag({url:origin+'/ASC/app/agent-gemini.js'});
    assert.equal(await page.evaluate(async()=>{try{await ASCAgent.ask('anything',null,{remote:true});return 'not blocked';}catch(e){return e.code;}}),'remote_disabled');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.goto(origin+'/ASC/app/warehouse-preview/index.html');await page.waitForSelector('html[data-preview-state="ready"] #ask-asc');await page.locator('#ask-asc').click();
    await page.locator('#warehouse-assistant textarea').fill('Write a sonnet about Neptune');await page.locator('#warehouse-assistant form').evaluate(f=>f.requestSubmit());await page.waitForFunction(()=>document.querySelector('#warehouse-assistant form').getAttribute('aria-busy')==='false');
    assert.match(await page.locator('#warehouse-assistant .is-local').last().textContent(),/probn/i);assert.equal(await page.evaluate(()=>window.localReads||0),0);
    assert.deepEqual(providerRequests,[]);assert.deepEqual(errors,[]);report.push({width,passed:true,providerRequests:0,checks:['ambiguous name offers choices','registration grounded in local read','unknown question never escalates','default remote UI hidden and direct client blocked','immediate acknowledgement','cancel suppresses delayed read','preview unknown does not access live data','no horizontal overflow']});await context.close();
  }}finally{await browser.close();await new Promise(r=>server.close(r));}
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
