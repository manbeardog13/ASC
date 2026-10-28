// Mandatory label printing: printer discovery, per-site memory, states and the completion gate.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');const out=process.env.ASC_TEST_OUTPUT||path.join(root,'out','label-print');fs.mkdirSync(out,{recursive:true});
const page=`<!doctype html><html lang="hr"><head><meta charset="utf-8"><link rel="stylesheet" href="/app/tokens.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/flow.css"></head><body><main class="shell" style="padding:24px;max-width:640px"><div id="host"></div><p id="done"></p></main>
<script>window.ASCQR={printSticker(){}};window.print=()=>setTimeout(()=>dispatchEvent(new Event('afterprint')),10);</script>
<script type="module">import {mountLabelPrint} from '/app/label-print.js';window.mount=()=>mountLabelPrint(document.getElementById('host'),{code:'ASC-1',label:{who:'T',plate:'DU-1',season:'winter'},onComplete:r=>{document.getElementById('done').textContent=r}});window.ready=true;</script></body></html>`;
async function run(browser,{bridge,printers,printOk,name}){
  const ctx=await browser.newContext({viewport:{width:390,height:700}});const p=await ctx.newPage();
  await ctx.route('**/*',async r=>{const u=new URL(r.request().url());
    if(u.pathname==='/t.html')return r.fulfill({contentType:'text/html',body:page});
    if(u.pathname==='/bridge/printers')return printers==='down'?r.abort():r.fulfill({contentType:'application/json',body:JSON.stringify({printers})});
    if(u.pathname==='/bridge/print')return r.fulfill({status:printOk?200:422,contentType:'application/json',body:JSON.stringify({ok:!!printOk})});
    const f=path.join(root,u.pathname);if(fs.existsSync(f))return r.fulfill({path:f,contentType:f.endsWith('.css')?'text/css':'text/javascript'});return r.abort();});
  await p.addInitScript(b=>{if(b)window.ASC_PRINT_BRIDGE=b},bridge);
  await p.goto('http://asc.test/t.html');await p.waitForFunction(()=>window.ready);await p.evaluate(()=>window.mount());
  await p.waitForFunction(()=>!['searching',undefined].includes(document.querySelector('.lp')?.dataset.state));
  return {p,ctx,state:()=>p.evaluate(()=>document.querySelector('.lp').dataset.state),shot:n=>p.screenshot({path:path.join(out,n+'.png')})};
}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});try{
  // 1) no bridge -> system dialog ready; print -> confirm -> yes completes
  let r=await run(browser,{});assert.equal(await r.state(),'readySystem');await r.shot('ready');
  await r.p.click('.lp-row .btn-primary');await r.p.waitForFunction(()=>document.querySelector('.lp').dataset.state==='confirm');await r.shot('confirm');
  assert.equal(await r.p.textContent('#done'),'');await r.p.click('.lp-actions .btn-primary');assert.equal(await r.p.textContent('#done'),'printed');await r.ctx.close();
  // 2) bridge down -> offline + retry completes as retried
  r=await run(browser,{bridge:'/bridge',printers:'down'});assert.equal(await r.state(),'offline');await r.shot('offline');
  await r.p.click('.lp-actions .btn');assert.equal(await r.p.textContent('#done'),'retried');await r.ctx.close();
  // 3) bridge up, no printers -> none
  r=await run(browser,{bridge:'/bridge',printers:[]});assert.equal(await r.state(),'none');await r.shot('none');await r.ctx.close();
  // 4) bridge printer, print fails -> failed; remembered per site
  r=await run(browser,{bridge:'/bridge',printers:[{id:'zebra',name:'Zebra ZD421',online:true}],printOk:false});
  assert.equal(await r.p.inputValue('.lp-select'),'zebra');await r.p.click('.lp-row .btn-primary');
  await r.p.waitForFunction(()=>document.querySelector('.lp').dataset.state==='failed');await r.shot('failed');
  assert.equal(await r.p.evaluate(()=>localStorage.getItem('asc.printer.'+location.host)),'zebra');assert.equal(await r.p.textContent('#done'),'');await r.ctx.close();
  // 5) bridge printer OK -> printed completes
  r=await run(browser,{bridge:'/bridge',printers:[{id:'zebra',name:'Zebra ZD421',online:true}],printOk:true});
  await r.p.click('.lp-row .btn-primary');await r.p.waitForFunction(()=>document.querySelector('#done').textContent==='printed');await r.shot('printed');await r.ctx.close();
  console.log('label-print: 5 scenarios passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
