// Local-only synthetic sessions. This does not authenticate to production.
const { chromium }=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'out','building-review');fs.mkdirSync(output,{recursive:true});
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const harness='<!doctype html><html><head><script type="importmap">{"imports":{"three":"/ASC/app/warehouse-preview/vendor/three.module.js"}}</script></head><body style="margin:0;background:#eef0ee"><div id="model" style="width:100vw;height:100vh"></div><script type="module">import {createScene} from "/ASC/app/warehouse-preview/scene.js";import {seedState} from "/ASC/app/warehouse-preview/model.js";window.fixture=seedState();window.viewer=createScene(document.getElementById("model"));viewer.setData(fixture,"all");</script></body></html>';
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname==='/model-test.html'){res.setHeader('Content-Type','text/html');res.end(harness);return;}const rel=decodeURIComponent(url.pathname).replace(/^\/ASC\//,'');const file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});});
const session="const session={user:{id:'building-ui-test'},expires_at:Math.floor(Date.now()/1000)+3600};";
const auth=session+"export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};";
const report={scope:'Synthetic local browser only',views:[],responsive:[]};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/js/supabaseClient.js'))return route.fulfill({contentType:'text/javascript',body:auth});return route.continue();});
 await page.goto(origin+'/model-test.html');await page.waitForFunction(()=>Boolean(window.viewer),{timeout:30000});
 for(const id of ['all','ground','reception','triangle','2.1','2.2','2.3']){
   const metrics=await page.evaluate(async id=>{viewer.setData(fixture,id);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));viewer.getCanvas();return viewer.getDiagnostics();},id);
   assert.ok(metrics.triangles>0,'view renders geometry: '+id);assert.ok(metrics.drawCalls<400,'draw-call budget: '+id);report.views.push(metrics);
   if(['all','ground'].includes(id))await page.screenshot({path:path.join(output,id+'.png')});
 }
 const downloadReady=page.waitForEvent('download',{timeout:90000});downloadReady.catch(()=>{});
 await page.evaluate(async()=>{const bytes=await viewer.exportModel({scope:'all'});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'}));a.download='ASC_Povezana_Zgrada.glb';a.click();});
 const download=await downloadReady;const modelPath=path.join(output,'ASC_Povezana_Zgrada.glb');await download.saveAs(modelPath);
 const bytes=fs.readFileSync(modelPath);assert.equal(bytes.readUInt32LE(0),0x46546c67);const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 for(const name of ['Skladište 2.1','Skladište 2.2','Skladište 2.3','Vozilo · tyre-service','Vozilo · gate-3'])assert.ok(json.nodes.some(n=>n.name?.startsWith(name)),'export includes '+name);
 report.export={bytes:bytes.length,nodes:json.nodes.length,meshes:json.meshes.length,path:modelPath};
 await page.goto(origin+'/ASC/app/warehouse-preview/index.html?room=ground');await page.waitForSelector('html[data-preview-state="ready"] #scene canvas',{timeout:30000});
 assert.equal(await page.locator('#building-room').inputValue(),'ground');
 for(const width of [390,1440]){await page.setViewportSize({width,height:width===390?844:1100});
   for(const id of ['ground','2.1','2.2','2.3','all','ground']){await page.locator('#building-room').selectOption(id);assert.equal(await page.locator('#view-3d').isDisabled(),false);}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   await page.screenshot({path:path.join(output,'app-'+width+'.png'),fullPage:true});report.responsive.push({width,passed:true});
 }
 assert.deepEqual(errors,[]);report.passed=true;
}finally{await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
