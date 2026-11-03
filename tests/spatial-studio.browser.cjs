// Exercise the actual distributable with a synthetic staff transport. No external requests.
const {chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const db=`
let user='00000000-0000-4000-8000-000000000010';export const getSession=async()=>user?{user:{id:user},access_token:'fixture'}:null;
export const onAuthChange=cb=>{window.__signout=()=>{user=null;cb('SIGNED_OUT',null)};return {data:{subscription:{unsubscribe(){}}}}};
export const loadMyProfile=async()=>({id:user,role:'employee'}),canEditWarehouse=r=>r==='employee';
export const listWarehouseLayout=async()=>({available:true,areas:[{id:'00000000-0000-4000-8000-000000000001',name:'Prizemlje',warehouse:'main',zone:'2.1',unit:'grid',width:10,depth:14}],positions:[{id:'rack',area_id:'00000000-0000-4000-8000-000000000001',rack:'R1',capacity:8,x:1,z:2}]});
export const listWarehouseSpaceBindings=async()=>({available:true,bindings:[{warehouse:'main',space_id:'house-ground',area_id:'00000000-0000-4000-8000-000000000001'}]});
export const listWarehouseInventory=async()=>({readCompletedAt:new Date().toISOString(),locations:[{id:'loc',warehouse:'main',zone:'2.1',rack:'R1',shelf:'1',slot:'1',status:'occupied',qr_code:'LOC-A1A1A1A1A1A1'},{id:'free',warehouse:'main',zone:'2.1',rack:'R2',shelf:'1',slot:'1',status:'free'}],sets:[{id:'s',status:'in_storage',public_code:'ASC-2026-0001',location_id:'loc',quantity:4,vehicle:{plate:'TEST-001',customer:{name:'Sintetički kupac'}},tires:[{size:'295/35 R20 105Y'}]}]});`;
const sdk=`import {getSession} from './db.js';export const supabase={auth:{getSession:async()=>({data:{session:await getSession()}})},channel:()=>({on(){return this},subscribe(cb){cb?.('SUBSCRIBED');return this}}),removeChannel:async()=>{}};`;
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw Error();const mocked=url.pathname==='/js/db.js'?db:url.pathname==='/js/supabaseClient.js'?sdk:url.pathname==='/js/config.js'?'export const config={SUPABASE_URL:"https://studio-fixture.invalid",SUPABASE_ANON_KEY:"fixture"};':url.pathname==='/app/composer.js'?'/* Independently covered by composer browser suites. */':null;const contents=mocked??await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(contents);}catch{res.writeHead(404).end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];
// Observe the camera passed to the real renderer; no test API in production.
await page.addInitScript(()=>{
 const events=window.__THREE_DEVTOOLS__=new EventTarget();
 events.addEventListener('observe',e=>{
  if(!e.detail.isScene)return;
  e.detail.onBeforeRender=(_renderer,_scene,camera)=>{window.__cameraMatrix=camera.matrixWorld.toArray()};
 });
});
await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/app/spatial-studio/index.html');await page.getByRole('button',{name:'Povezano'}).waitFor({timeout:15000});
await page.waitForFunction(()=>document.querySelector('.asc-map-plan')||(document.querySelector('canvas[data-engine]')?.width>500&&document.querySelector('canvas[data-engine]')?.height>200),{},{timeout:12000});
if(await page.locator('canvas').count())await page.evaluate(()=>new Promise(resolve=>{let frames=0;function next(){if(++frames===12)resolve();else requestAnimationFrame(next)}next()}));
if(await page.locator('canvas').count()){const image=process.env.ASC_STUDIO_QA_IMAGE||path.join(root,'out','spatial-studio-tests','cutaway.png');await fs.mkdir(path.dirname(image),{recursive:true});await page.locator('.canvas-wrap').screenshot({path:image})}
const webgl=await page.evaluate(()=>{const ctx=document.querySelector('canvas')?.getContext('webgl2');return ctx?{renderer:ctx.getParameter(ctx.RENDERER),width:ctx.drawingBufferWidth,height:ctx.drawingBufferHeight}:null});
assert.ok(webgl?.width>0||await page.locator('.asc-map-plan').isVisible(),'real scene or usable plan required');
if(webgl){
 const canvas=page.locator('canvas[data-engine]'), bounds=await canvas.boundingBox();
 const x=Math.round(bounds.x+bounds.width*.65),y=Math.round(bounds.y+bounds.height*.5);
 const view=()=>page.evaluate(()=>window.__cameraMatrix);
 const changed=async(before,label)=>{try{await page.waitForFunction(v=>window.__cameraMatrix?.some((n,i)=>Math.abs(n-v[i])>.005),before,{timeout:5000})}catch(e){throw Error(label+': '+e.message)}};
 const cutoff=await view();assert.ok(cutoff?.length===16,'GPU view matrix available');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+77,y-34,{steps:5});await page.mouse.up();
 await changed(cutoff,'primary drag pans camera');const panned=await view();
 assert.ok(panned.slice(0,12).every((n,i)=>Math.abs(n-cutoff[i])<.002),'pan translates without rotating');
 await page.mouse.wheel(0,-250);await changed(panned,'wheel zoom');
 await page.getByRole('button',{name:'Šetnja',exact:true}).click();await canvas.getAttribute('aria-label');
 await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')?.startsWith('Šetnja'),{}, {timeout:5000});
 await page.waitForFunction(()=>Math.abs((window.__cameraMatrix?.[13]??99)-1.52)<.01);
 const entry=await view();await page.keyboard.down('w');try{await changed(entry,'walking forward')}finally{await page.keyboard.up('w')}
 const walked=await view();await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-45,y+8,{steps:3});await page.mouse.up();
 await changed(walked,'look around in walk mode');
 const turned=await view(),pad=await page.getByRole('button',{name:'Korak natrag',exact:true}).boundingBox();
 await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2);await page.mouse.down();try{await changed(turned,'walking with on-screen pad')}finally{await page.mouse.up()}
 await page.getByRole('button',{name:'Centriraj prikaz'}).click();await page.waitForFunction(v=>window.__cameraMatrix.every((n,i)=>Math.abs(n-v[i])<.01),entry,{timeout:5000});
 const oldCanvas=await canvas.elementHandle();
 await page.locator('.room-button').click();await page.getByRole('dialog').getByRole('button',{name:/Bijele police/}).click();
 await page.waitForFunction(()=>Math.abs((window.__cameraMatrix?.[13]??99)-5.72)<.01);
 assert.ok(await oldCanvas.evaluate(el=>el===document.querySelector('canvas[data-engine]')),'room switch reuses the WebGL context');
 const walkImage=path.join(root,'out','spatial-studio-tests','walkthrough.png');await fs.mkdir(path.dirname(walkImage),{recursive:true});await page.locator('.canvas-wrap').screenshot({path:walkImage});
 await page.locator('.room-button').click();await page.getByRole('dialog').getByRole('button',{name:/Prizemlje/}).click();
}
await page.getByRole('button',{name:'Tlocrt',exact:true}).click();
const drawing=page.locator('.asc-map-plan'), initial=await drawing.getAttribute('viewBox'), box=await drawing.boundingBox();
const px=box.x+box.width*.58,py=box.y+box.height*.55;
const anchor=()=>drawing.evaluate((el,[x,y])=>{const p=new DOMPoint(x,y).matrixTransform(el.getScreenCTM().inverse());return [p.x,p.y]},[px,py]);
const start=await anchor();await page.mouse.move(px,py);await page.mouse.wheel(0,-420);
await page.waitForFunction(v=>document.querySelector('.asc-map-plan').getAttribute('viewBox')!==v,initial);
assert.ok((await anchor()).every((n,i)=>Math.abs(n-start[i])<.02),'plan zoom anchored to pointer');
const zoomed=await drawing.getAttribute('viewBox');
await page.mouse.down();await page.mouse.move(px-86,py-45,{steps:5});await page.mouse.up();
assert.notEqual(await drawing.getAttribute('viewBox'),zoomed,'drag pans the plan');
await drawing.focus();await page.keyboard.press('Home');assert.equal(await drawing.getAttribute('viewBox'),initial,'restore plan framing');
await page.getByRole('button',{name:'R1: 4 od 8'}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:/Sintetički kupac/}).waitFor();
// Walk the shelf aisle with the real package. The fallback keeps identical
// navigation controls and exposes its position and heading as an SVG marker.
await page.locator('.room-button').click();
await page.getByRole('dialog').getByRole('button',{name:/Bijele police/}).click();
await page.getByRole('button',{name:'Šetnja',exact:true}).click();
const walk=page.locator('.asc-spatial-canvas.walking');
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
await walk.getByRole('button',{name:'Korak naprijed'}).waitFor();
await settle();
if(webgl){
  const image=path.join(root,'out','spatial-studio-tests','walkthrough.png');
  await fs.mkdir(path.dirname(image),{recursive:true});
  await page.locator('.viewport').screenshot({path:image});
  const before=await walk.locator('canvas').screenshot();
  await walk.focus();await page.keyboard.down('w');await page.waitForTimeout(320);await page.keyboard.up('w');await settle();
  assert.ok(!before.equals(await walk.locator('canvas').screenshot()),'eye-level scene responds to movement');
  await walk.locator('canvas').evaluate(el=>el.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
}
const marker=walk.getByRole('img',{name:'Vaš položaj i smjer pogleda'});
await marker.waitFor();
const position=await marker.getAttribute('transform');
await walk.focus();await page.keyboard.down('ArrowUp');await page.waitForTimeout(280);await page.keyboard.up('ArrowUp');
assert.notEqual(await marker.getAttribute('transform'),position,'walking moves within the fallback room');
await page.setViewportSize({width:390,height:844});
const turn=await walk.getByRole('button',{name:'Okreni udesno'}).boundingBox();
assert.ok(turn && turn.width>=44 && turn.x+turn.width<=390,'turn control remains reachable on phone');
const heading=await marker.getAttribute('transform');
const touch=await ctx.newCDPSession(page);
const turnButton=walk.getByRole('button',{name:'Okreni udesno'});await turnButton.scrollIntoViewIfNeeded();
const tap=await turnButton.boundingBox();
await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tap.x+tap.width/2,y:tap.y+tap.height/2}]});
await page.waitForTimeout(160);
await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
assert.notEqual(await marker.getAttribute('transform'),heading,'touch pad turns the walker');
await page.setViewportSize({width:1440,height:900});
await page.locator('.room-button').click();await page.getByRole('dialog').getByRole('button',{name:/Prizemlje/}).click();
await page.getByRole('button',{name:'Tlocrt',exact:true}).click();await page.getByRole('button',{name:'R1: 4 od 8'}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:/Sintetički kupac/}).waitFor();
// Keyboard-only entry must respect the same floor and neighbouring rack as a map click.
const add=page.getByRole('button',{name:'Dodaj stupac'});
await add.focus();await page.keyboard.press('Enter');
const coordinates=page.locator('.coordinate-entry summary');
await coordinates.focus();await page.keyboard.press('Enter');
const x=page.getByRole('spinbutton',{name:'X (polja mreže)'}),z=page.getByRole('spinbutton',{name:'Z (polja mreže)'});
await page.keyboard.press('Tab');assert.ok(await x.evaluate(n=>document.activeElement===n));
await page.keyboard.type('1');await page.keyboard.press('Tab');await page.keyboard.type('2');
const save=page.getByRole('button',{name:'Spremi položaj'});
assert.ok(await save.isDisabled(),'existing R1 centre cannot host another rack');
await x.fill('100');assert.ok(await save.isDisabled(),'outside the room must be rejected');
await x.fill('0');await z.fill('0');assert.ok(await save.isEnabled());
let written;
await page.route('https://studio-fixture.invalid/rest/v1/warehouse_rack_positions*',async r=>{
  if(r.request().method()==='POST') written=r.request().postDataJSON();
  await r.fulfill({json:written?[written]:[]});
});
const saved=page.waitForResponse(r=>r.url().startsWith('https://studio-fixture.invalid/rest/v1/')&&r.request().method()==='POST');
await save.focus();await page.keyboard.press('Enter');await saved;
await page.getByText('Položaj je predan za sinkronizaciju.').waitFor();
assert.deepEqual([written.rack,written.x,written.z,written.capacity],['R2',0,0,8]);
await page.keyboard.press('Control+k');await page.getByRole('textbox',{name:'Pretražite sve prostore'}).fill('trokut');await page.getByRole('dialog').getByRole('button',{name:/Trokutasto spremište/}).click();assert.equal(await page.locator('.view-foot h2').textContent(),'Trokutasto spremište');
await page.getByRole('button',{name:'Skeniraj',exact:true}).click();await page.getByRole('textbox',{name:'Kod naljepnice'}).fill('LOC-A1A1A1A1A1A1');await page.getByRole('textbox',{name:'Kod naljepnice'}).press('Enter');assert.equal(await page.locator('.view-foot h2').textContent(),'Prizemlje');assert.equal(await page.locator('input[type=search]').inputValue(),'R1');
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no sideways scrolling on phone');
await page.evaluate(()=>window.__signout());await page.getByRole('link',{name:'Prijava'}).waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/Sintetički kupac|TEST-001/);
// Staff can enter a specific guide step, open the right operational page for
// the selected zone, and continue through admission, placement and retrieval.
await page.goto(origin+'/app/spatial-studio/index.html?guide=2&room=triangular-store');
const guide=page.getByRole('dialog',{name:'Vodič kroz skladište'});
await guide.getByRole('link',{name:'Otvori mjesta i QR oznake'}).waitFor();
assert.match(await guide.innerText(),/Trokutasto spremište/);
const labels=new URL(await guide.getByRole('link',{name:'Otvori mjesta i QR oznake'}).getAttribute('href'),page.url());
assert.equal(labels.pathname,'/app/locations.html');assert.equal(labels.searchParams.get('zone'),'TROKUT');
for(const [step,button,link,pageName] of [[4,'Prijam','Zaprimi komplet','checkin'],[5,'Smještaj','Smjesti komplet','place'],[6,'Pronalazak','Pronađi komplet','locate']]){
  await guide.getByRole('button',{name:'Korak '+step+': '+button}).click();
  assert.equal(new URL(await guide.getByRole('link',{name:link}).getAttribute('href'),page.url()).pathname,'/app/'+pageName+'.html');
}
await guide.getByRole('button',{name:'Završi vodič'}).click();assert.equal(await guide.count(),0);
// A set can be plotted only when the signed-in projection confirms its rack.
await page.goto(origin+'/app/spatial-studio/index.html?find=ASC-2026-0001');
await page.getByRole('button',{name:'Povezano'}).waitFor();
await page.getByRole('button',{name:'Regal R1',exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'Tlocrt',exact:true}).getAttribute('aria-pressed'),'true');
assert.match(await page.locator('.notice').textContent(),/2\.1 \/ R1 \/ 1 \/ 1/);
await page.getByRole('button',{name:'Šetnja',exact:true}).click();
const bearing=page.locator('.asc-walk-destination');await bearing.getByText('Regal R1',{exact:true}).waitFor();
assert.match(await bearing.innerText(),/Smjer prema regalu|U blizini regala/);
const initialBearing=await bearing.locator('svg').getAttribute('style');
await page.locator('.asc-spatial-canvas.walking').focus();
await page.keyboard.down('ArrowLeft');await page.waitForTimeout(190);await page.keyboard.up('ArrowLeft');
assert.notEqual(await bearing.locator('svg').getAttribute('style'),initialBearing,'bearing follows current viewpoint');
await page.goto(origin+'/app/spatial-studio/index.html?find=UNKNOWN');
await page.getByText('Komplet nije pronađen u dostupnoj evidenciji.').waitFor();
assert.equal(await page.locator('.selection').count(),0);
// A missed versioned chunk after a new deployment must not erase the whole app.
await page.route('**/assets/Canvas-*.js',route=>route.abort());
await page.goto(origin+'/app/spatial-studio/index.html?guide=2');
await page.getByRole('dialog',{name:'Vodič kroz skladište'}).getByRole('button',{name:'Zatvori'}).click();
await page.getByRole('button',{name:'Ponovno učitaj studio'}).waitFor();
await page.getByRole('button',{name:'Vodič',exact:true}).click();
await page.getByRole('link',{name:'Otvori mjesta i QR oznake'}).waitFor();
const serious=errors.filter(m=>!m.includes('Error creating WebGL context'));assert.deepEqual(serious,[]);console.log('PASS studio browser: staff projection, rack keyboard/map, room command, scanner lookup, mobile width, sign-out redaction. Renderer: '+JSON.stringify(webgl||'SVG fallback'));
}finally{await browser?.close();server.close()}})().catch(e=>{console.error(e);process.exitCode=1});
