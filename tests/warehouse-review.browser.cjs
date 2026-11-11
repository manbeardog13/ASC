/* Whole review flow: isolated synthetic data only. No production/API/session. */
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'out/assistant-tests');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const checks=[];fs.mkdirSync(output,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[],requests=[],missing=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
  const source=fs.readFileSync(path.join(root,'app/warehouse-preview/scene.js'),'utf8');
  await page.route('**/app/warehouse-preview/scene.js',route=>route.fulfill({contentType:'text/javascript',body:source.replace('export function createScene(', 'function realScene(')+'\nexport function createScene(...args){const scene=realScene(...args);window.__reviewScene=scene;return scene;}'}));
  await page.goto(origin+'/design/warehouse-review.html');await page.waitForFunction(()=>window.__reviewScene?.getMotionState().buildingView==='upper-assembly');
  assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).visibleTireCount,0);
  await page.locator('#samples').click();
  const rooms=['house-ground','house-platform','house-attic','attic-parts','attic-racks','triangular-store'];
  for(const id of rooms){
   await page.locator('#space').selectOption('TEST-'+id);
   assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).buildingView,id);
   assert.ok((await page.evaluate(()=>__reviewScene.getRenderStats())).visibleTireCount>=8,`${id}: missing synthetic inventory`);
   assert.deepEqual(await page.evaluate(()=>__reviewScene.getPlacementIssues()),[],`${id}: invalid demo footprint`);
   await page.locator('#focus-sample').click();
   assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,4,`${id}: exact set focus`);
  }
  checks.push('all six storage rooms have valid synthetic addressed sets; exact four-of-eight focus in each');
  await page.locator('#sample-query').fill('NO-SUCH-SET');assert.equal(await page.locator('#focus-sample').isDisabled(),true);assert.match(await page.locator('#sample-count').textContent(),/Nema/);
  assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,0);assert.doesNotMatch(await page.locator('#status').textContent(),/označene zeleno/);
  await page.locator('#sample-query').fill('R01');await page.locator('#sample-query').press('Enter');assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,4);
  const nextSet=await page.locator('#sample-set option').nth(1).getAttribute('value');await page.locator('#sample-set').selectOption(nextSet);assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,0);assert.doesNotMatch(await page.locator('#status').textContent(),/označene zeleno/);
  await page.locator('#focus-sample').click();await page.locator('#reset').click();assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,0);assert.doesNotMatch(await page.locator('#status').textContent(),/označene zeleno/);
  for(const id of ['office','table-room']){await page.locator('#space').selectOption(id);assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).buildingView,id);assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).visibleTireCount,0);assert.equal(await page.locator('#focus-sample').isDisabled(),true);}
  await page.locator('#space').selectOption('existing');assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).buildingView,'all');assert.match(await page.locator('#status').textContent(),/zasebno/);
  await page.locator('#space').selectOption('all');assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).buildingView,'upper-assembly');
  await page.locator('#sample-query').fill('');
  await page.locator('#presentation').selectOption('dusk');assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).presentation,'dusk');
  await page.locator('#presentation').selectOption('studio');assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).presentation,'studio');
  await page.locator('#staff').check();assert.equal((await page.evaluate(()=>__reviewScene.getMotionState())).staffEnabled,true);await page.locator('#staff').uncheck();
  await page.locator('#ambient').uncheck();await page.locator('#plan').click();assert.equal(await page.locator('#plan').getAttribute('aria-pressed'),'true');await page.locator('#reset').click();assert.equal(await page.locator('#plan').getAttribute('aria-pressed'),'false');
  checks.push('search/no-results/keyboard, noninventory office/table rooms, separate building groups, lighting and plan/reset');
  await page.locator('#samples').click();
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(80);
   const sizes=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,footer:document.querySelector('footer').getBoundingClientRect().bottom,height:innerHeight}));
   assert.ok(sizes.scroll<=sizes.width+1,`overflow at ${width}`);assert.ok(Math.abs(sizes.height-sizes.footer-8)<2,'footer not at viewport bottom');
   await page.screenshot({path:path.join(output,`warehouse-review-${width}.png`),fullPage:true});
  }
  await page.evaluate(()=>{document.body.style.zoom='2';});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'200% CSS zoom overflows');await page.evaluate(()=>{document.body.style.zoom='';});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).disposed,false);assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).frameScheduled,false);
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));assert.equal((await page.evaluate(()=>__reviewScene.getRenderStats())).disposed,false);
  checks.push('390/768/1440 widths, 200% CSS zoom, viewport footer and back-forward-cache pause/resume');
  await page.evaluate(()=>__reviewScene.getCanvas().dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  assert.equal(await page.locator('#fallback').isVisible(),true);assert.equal(await page.locator('#capture').isDisabled(),true);
  await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#fallback').hidden);assert.equal(await page.locator('#fallback').isVisible(),false);assert.equal(await page.locator('#capture').isDisabled(),false);
  checks.push('WebGL loss blocks stale controls; explicit retry rebuilds renderer with current review state');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.ok(requests.every(url=>new URL(url).origin===origin&&!/(?:supabase|\/rest\/|\/auth\/|\/rpc\/|\/js\/db\.js)/i.test(url)));
  assert.deepEqual(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)})),{local:[],session:[]});
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({scope:'Isolated actual review with synthetic inventory; no physical clearance certification',checks},null,2));
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
