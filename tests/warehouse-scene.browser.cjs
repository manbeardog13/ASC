/* Actual WebGL/SwiftShader, isolated synthetic inventory, no authenticated backend. */
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const output=path.resolve(process.env.ASC_TEST_OUTPUT||path.join(root,'out','assistant-tests'));
const fixture='<!doctype html><script type="importmap">{"imports":{"three":"/app/warehouse-preview/vendor/three.module.js"}}</script><body style="margin:0;background:#151a27"><input id="entry" aria-label="Synthetic input" style="position:absolute;top:0;right:0;z-index:2"><div id="view" style="position:relative;width:100vw;height:100vh"></div></body>';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{const rel=new URL(req.url,'http://local').pathname;if(rel==='/fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}const file=path.resolve(root,'.'+rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(body);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const checks=[];fs.mkdirSync(output,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:800},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/fixture');await page.clock.install({time:new Date('2026-10-21T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-21T12:00:01Z'));
  await page.evaluate(async()=>{
   const {createScene}=await import('/app/warehouse-preview/scene.js');
   window.layout={areas:[{id:'A',width:12,depth:32,name:'Synthetic A',floorRects:[{x:0,z:0,w:12,d:32}]}],stacks:[{id:'mixed',areaId:'A',x:-4,z:6,radius:.4,capacity:8,tireIds:['t1','t2','t3','t4','t5','t6','t7','t8']},{id:'neighbor',areaId:'A',x:-2,z:6,radius:.4,capacity:8,tireIds:['t9']}],tires:Array.from({length:9},(_,i)=>({id:'t'+(i+1),setId:i<4?'wanted':'other'}))};
   window.viewer=createScene(document.getElementById('view'));viewer.setData(layout,'all');viewer.setBuildingBindings({A:'attic-parts'});viewer.setBuildingEnabled(true);viewer.setBuildingView('upper-assembly');viewer.setAmbientEnabled(false);
  });
  await page.evaluate(()=>viewer.setCutaway('review'));assert.equal((await page.evaluate(()=>viewer.getMotionState())).cutaway,'review');await page.evaluate(()=>viewer.setCutaway('open'));
  assert.equal(await page.evaluate(()=>viewer.focusSet('wanted')),true);
  let stats=await page.evaluate(()=>viewer.getRenderStats());assert.equal(stats.visibleTireCount,9);assert.equal(stats.focusedTireCount,4);assert.equal(stats.mutedTireCount,5);assert.equal(stats.neighborOpacity,.15);
  assert.equal((await page.evaluate(()=>viewer.getMotionState())).active,false);await page.clock.runFor(80);await page.screenshot({path:path.join(output,'warehouse-scene-exact-set.png')});assert.ok((await page.evaluate(()=>viewer.getRenderStats())).occludedArchitectureCount>0);checks.push('exact 4-of-8 mixed customer stack green, five neighbors at 15% opacity, reduced motion immediate');
  await page.evaluate(()=>{viewer.clearFocus();viewer.setViewpoint({position:[-30,35,38],target:[-2,4,0]});});
  const pose=await page.evaluate(()=>viewer.getMotionState());
  await page.evaluate(()=>{for(let i=0;i<25;i++){viewer.setBuildingBindings({A:'attic-parts'});viewer.setData(structuredClone(layout),'all');viewer.setBuildingEnabled(true);}});
  const refreshed=await page.evaluate(()=>viewer.getMotionState());assert.ok(refreshed.cameraPosition.every((v,i)=>Math.abs(v-pose.cameraPosition[i])<1e-8));assert.ok(refreshed.cameraTarget.every((v,i)=>Math.abs(v-pose.cameraTarget[i])<1e-8));
  stats=await page.evaluate(()=>viewer.getRenderStats());assert.equal(stats.mutedTireCount,0);assert.equal(stats.focusedTireCount,0);assert.equal(stats.occludedArchitectureCount,0);
  await page.evaluate(()=>viewer.setBuildingEnabled(false));assert.equal((await page.evaluate(()=>viewer.getRenderStats())).buildingVisible,false);await page.evaluate(()=>viewer.setBuildingEnabled(true));
  checks.push('obstructing shelving dissolves during focus; clear restores architecture and tire opacity; 25 refreshes preserve camera');
  await page.evaluate(()=>{const invalid=structuredClone(layout);invalid.stacks[0].x=-5.99;viewer.setData(invalid,'all');});
  const issues=await page.evaluate(()=>viewer.getPlacementIssues());assert.equal(issues.length,1);assert.equal(issues[0].stackId,'mixed');assert.equal(issues[0].tireCount,8);checks.push('entire tire footprint excluded at unsupported floor edge with actionable quantity');
  await page.evaluate(()=>viewer.setData(layout,'all'));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.clock.runFor(40);
  await page.evaluate(()=>viewer.focusSet('wanted'));assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'flight');
  await page.clock.fastForward(200);await page.evaluate(()=>viewer.focusSet('other'));await page.clock.fastForward(1800);
  assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'orbit');
  await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'manual');checks.push('repeated search supersedes flight, settles into orbit, keyboard interrupts');
  await page.evaluate(()=>{viewer.clearFocus();viewer.setAmbientEnabled(true);});
  await page.clock.fastForward(119999);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'manual');
  await page.clock.fastForward(2);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'idle-flight');
  await page.clock.fastForward(3300);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'idle');
  await page.mouse.move(30,30);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'manual');checks.push('idle begins after exactly 120 seconds and pointer input cancels');
  await page.locator('#entry').focus();await page.clock.fastForward(120001);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'manual');
  await page.evaluate(()=>{document.activeElement.blur();viewer.setActivityBlocked(true);});await page.clock.fastForward(120001);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'manual');checks.push('input focus and explicit modal guard prevent idle takeover');
  await page.evaluate(()=>{viewer.setActivityBlocked(false);viewer.pause();});await page.clock.fastForward(120001);assert.equal((await page.evaluate(()=>viewer.getMotionState())).mode,'manual');
  await page.evaluate(()=>{viewer.resume();viewer.setAmbientEnabled(false);viewer.clearFocus();viewer.setViewpoint({position:[-30,35,38],target:[-2,4,0]});});
  // Deterministic monkey interactions: replay the same 60 actions twice so
  // newly exercised shader/material variants may warm up, but cannot keep growing.
  let seed=0x41534331;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  const steps=Array.from({length:60},(_,index)=>({kind:index<12?index:random()%12,value:random()}));
  const snapshots=[];
  for(let cycle=0;cycle<2;cycle++){
   await page.setViewportSize({width:1100,height:800});
   await page.evaluate(()=>{viewer.resume();viewer.setActivityBlocked(false);viewer.setAmbientEnabled(false);viewer.clearFocus();viewer.setData(structuredClone(layout),'all');viewer.setBuildingBindings({A:'attic-parts'});viewer.setBuildingEnabled(true);viewer.setBuildingView('upper-assembly');viewer.setCutaway('open');viewer.setView('perspective');viewer.setViewpoint({position:[-30,35,38],target:[-2,4,0]});});
   for(const step of steps){
    if(step.kind===4){const sizes=[{width:390,height:844},{width:768,height:900},{width:1100,height:800}];await page.setViewportSize(sizes[step.value%3]);}
    else if(step.kind===7)await page.keyboard.press('Escape');
    else await page.evaluate(({kind,value})=>{
     switch(kind){
      case 0:viewer.focusSet(value%2?'wanted':'other');break;
      case 1:viewer.clearFocus();break;
      case 2:viewer.setCutaway(['open','shell','closed'][value%3]);break;
      case 3:viewer.setBuildingEnabled(!!(value%2));break;
      case 5:if(value%2)viewer.pause();else viewer.resume();break;
      case 6:viewer.setData(structuredClone(layout),'all');viewer.setBuildingBindings({A:'attic-parts'});break;
      case 8:viewer.setViewpoint({position:[-30+value%35,12+value%22,20+value%17],target:[-2,4,0]});break;
      case 9:viewer.setView(value%2?'top':'perspective');break;
      case 10:viewer.setBuildingBindings(value%2?{}:{A:'attic-parts'});break;
      case 11:viewer.setBuildingView(value%2?'upper-assembly':'all');break;
     }
    },step);
    await page.clock.runFor(35);
    const current=await page.evaluate(()=>({motion:viewer.getMotionState(),stats:viewer.getRenderStats()}));
    assert.ok([...current.motion.cameraPosition,...current.motion.cameraTarget].every(Number.isFinite),'randomized interaction produced non-finite camera');
    assert.ok(current.stats.focusedTireCount<=current.stats.visibleTireCount,'focus exceeds actual visible inventory');
    assert.ok(current.stats.mutedTireCount<=current.stats.visibleTireCount,'muted count exceeds actual inventory');
   }
   await page.evaluate(()=>{viewer.resume();viewer.clearFocus();viewer.setData(structuredClone(layout),'all');viewer.setBuildingBindings({A:'attic-parts'});viewer.setBuildingEnabled(true);viewer.setBuildingView('upper-assembly');viewer.setCutaway('open');viewer.setView('perspective');viewer.setViewpoint({position:[-30,35,38],target:[-2,4,0]});});
   await page.clock.runFor(80);snapshots.push(await page.evaluate(()=>viewer.getRenderStats()));
   await page.evaluate(()=>viewer.pause());const paused=await page.evaluate(()=>viewer.getRenderStats());await page.clock.fastForward(500);
   assert.equal((await page.evaluate(()=>viewer.getRenderStats())).renderedFrames,paused.renderedFrames,'paused scene still renders');assert.equal(paused.frameScheduled,false);
  }
  assert.equal(snapshots[1].materialCount,snapshots[0].materialCount,'materials grow on identical replay');
  assert.equal(snapshots[1].geometries,snapshots[0].geometries,'GPU geometry grows on identical replay');
  assert.equal(snapshots[1].textures,snapshots[0].textures,'GPU textures grow on identical replay');
  assert.equal(snapshots[1].programCount,snapshots[0].programCount,'shader programs grow on identical replay');
  assert.ok(snapshots[1].renderedFrames-snapshots[0].renderedFrames<300,'unexpected render-loop growth');
  checks.push('120 seeded random interactions: focus, clear, cutaway, building, viewport, pause, refresh, bindings and manual input; finite camera and stable GPU/material counts on replay');
  await page.evaluate(()=>viewer.resume());
  await page.clock.runFor(80);fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'warehouse-scene-synthetic.png')});
  await page.evaluate(()=>viewer.dispose());const disposed=await page.evaluate(()=>viewer.getRenderStats());await page.clock.fastForward(1000);const afterDispose=await page.evaluate(()=>viewer.getRenderStats());assert.equal(afterDispose.renderedFrames,disposed.renderedFrames);assert.equal(afterDispose.frameScheduled,false);assert.equal(afterDispose.idleTimerScheduled,false);assert.equal(afterDispose.materialCount,0);assert.equal(await page.locator('canvas').count(),0);assert.deepEqual(errors,[]);checks.push('pause/resume and dispose cleanly release scene without page errors');
  const review=await context.newPage(),reviewErrors=[],failedAssets=[],reviewRequests=[];
  review.on('pageerror',error=>reviewErrors.push(error.message));review.on('response',response=>{if(response.status()>=400)failedAssets.push({url:response.url(),status:response.status()});});review.on('request',request=>reviewRequests.push({url:request.url(),method:request.method()}));
  // Expose the real scene API only in this test; renderer and behavior stay intact.
  const source=fs.readFileSync(path.join(root,'app/warehouse-preview/scene.js'),'utf8');
  await review.route('**/app/warehouse-preview/scene.js',route=>route.fulfill({contentType:'text/javascript',body:source.replace('export function createScene(', 'function createRealScene(')+'\nexport function createScene(...args){const scene=createRealScene(...args);window.__reviewScene=scene;return scene;}'}));
  await review.goto(origin+'/design/warehouse-review.html');await review.waitForFunction(()=>window.__reviewScene?.getMotionState().buildingView==='upper-assembly');
  assert.equal(await review.locator('#fallback').isVisible(),false);assert.match(await review.locator('#status').textContent(),/nije potvrđen/);
  assert.equal(await review.evaluate(async()=>{const {BUILDING_TOPOLOGY}=await import('/app/warehouse-preview/building.js');return BUILDING_TOPOLOGY.integrationReady;}),false);
  assert.equal((await review.evaluate(()=>__reviewScene.getRenderStats())).visibleTireCount,0);
  assert.equal(await review.locator('header img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await review.locator('#samples').click();assert.match(await review.locator('#status').textContent(),/Sintetički/);assert.ok((await review.evaluate(()=>__reviewScene.getRenderStats())).visibleTireCount>0);
  await review.locator('#focus-sample').click();assert.equal((await review.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,4);
  await review.locator('#cutaway').click();assert.equal((await review.evaluate(()=>__reviewScene.getMotionState())).cutaway,'closed');await review.locator('#cutaway').click();assert.equal((await review.evaluate(()=>__reviewScene.getMotionState())).cutaway,'review');
  await review.locator('#reset').click();assert.equal((await review.evaluate(()=>__reviewScene.getRenderStats())).focusedTireCount,0);assert.equal((await review.evaluate(()=>__reviewScene.getMotionState())).buildingView,'upper-assembly');
  const [download]=await Promise.all([review.waitForEvent('download'),review.locator('#capture').click()]);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const png=Buffer.concat(chunks);assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.length>5000,'capture is not a rendered PNG');
  await review.locator('#samples').click();assert.equal((await review.evaluate(()=>__reviewScene.getRenderStats())).visibleTireCount,0);assert.equal(await review.locator('#focus-sample').isVisible(),false);
  assert.deepEqual(await review.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)})),{local:[],session:[]});
  assert.deepEqual(reviewErrors,[]);assert.deepEqual(failedAssets,[]);assert.ok(reviewRequests.every(request=>request.method==='GET'&&new URL(request.url).origin===origin));assert.ok(reviewRequests.every(request=>!/(?:\/js\/db\.js|supabase|\/rest\/|\/auth\/|\/rpc\/)/i.test(request.url)));
  checks.push('actual isolated review page: upper-only unconfirmed disclosure, no missing assets/errors/backend requests, opt-in synthetic sets/focus, cutaway/reset, valid PNG capture, no persistence');
  await review.close();await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
 console.log(JSON.stringify({scope:'Synthetic isolated actual WebGL; not a physical device performance certification',checks},null,2));
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
