const assert=require('node:assert/strict');
const {createHarness,metrics,repo}=require('./fixtures/composer-harness.cjs');
const fs=require('node:fs');
const path=require('node:path');
async function interactions(){
 const h=await createHarness();const p=h.page;
 try {
 const input=p.locator('.nero-input'),send=p.locator('.nero-send'),root=p.locator('#neroComposer');
 await input.fill('Gdje je moj set?');await input.press('Enter');
 await p.waitForFunction(()=>window.__concierges.length===1);
 await send.click();
 await p.evaluate(()=>window.__concierges[0].resolve(null));await p.waitForTimeout(20);
 assert.equal(await p.evaluate(()=>window.__requests.length),0,'Stop must prevent a delayed concierge from starting AI');
 assert.equal(await root.evaluate(el=>el.classList.contains('is-busy')),false);
 await input.fill('Pronađi slobodno mjesto');await input.press('Enter');
 await p.waitForFunction(()=>window.__concierges.length===2);
 await p.evaluate(()=>window.__concierges[1].resolve(null));
 await p.waitForFunction(()=>window.__requests.length===1);
 await p.locator('[data-act=new]').click();
 await p.evaluate(()=>{window.__requests[0].onEvent({type:'delta',text:'STALE RESPONSE'});window.__requests[0].resolve()});
 assert.equal(await p.locator('.nero-log').innerText(),'','Late responses must not contaminate new conversation');
 assert.equal(await root.evaluate(el=>el.classList.contains('is-busy')),false);
 await p.evaluate(()=>window.__conciergeMode='reject');
 await input.fill('Pronađi kupca');await input.press('Enter');
 await p.waitForFunction(()=>window.__requests.length===2);
 await p.evaluate(()=>{window.__requests[1].onEvent({type:'text',text:'Mogu pomoći s prijemom.'});window.__requests[1].resolve()});
 await p.waitForTimeout(20);
 assert.match(await p.locator('.nero-log').innerText(),/Mogu pomoći/);
 assert.equal(await root.evaluate(el=>el.classList.contains('is-busy')),false);
 await input.fill('unos');
 await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));
 assert.equal(await input.inputValue(),'unos','IME Enter must retain the uncommitted draft');
 await p.locator('.nero-grab').focus();await p.keyboard.press('Enter');
 assert.equal(await p.locator('.nero-log').evaluate(el=>el.hidden),true);
 await input.focus();
 assert.equal(await p.locator('.nero-log').evaluate(el=>el.hidden),false,'Refocusing composer must recover collapsed conversation');
 await p.locator('.nero-file').setInputFiles({name:'too-large.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(7_000_001)});
 assert.match(await p.locator('.nero-log').innerText(),/najviše 7 MB/,'Reject files above the live agent limit before upload');
 assert.deepEqual(h.errors,[]);
 console.log('PASS stop during concierge, new chat late events, concierge rejection fallback, IME Enter, conversation restore');
 } finally { await h.close(); }
}
async function layout(){
 const output=path.join(repo,'out/composer-tests');fs.mkdirSync(output,{recursive:true});
 const report=[];
 for(const width of [320,390,560,561,768,844,1440]){
  const h=await createHarness({width,height:width===844?390:844,reducedMotion:width===390?'no-preference':'reduce'});
  try {
   const p=h.page;
   await p.locator('.nero-input').focus();
   await p.waitForTimeout(800);
   for(const theme of ['light','dark']){
    await p.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    for(const draft of ['', 'Opis novog seta guma. '.repeat(60)]){
     await p.locator('.nero-input').fill(draft);
     const m=await metrics(p);
     assert.ok(m.scrollWidth<=width,`page overflow at ${width}`);
     assert.equal(m.inputFont,'16px');
     for(const b of m.tools){
      assert.ok(b.x>=0&&b.right<=width,`${b.label} clipped at ${width}`);
      assert.ok(b.width>=43.9&&b.height>=43.9,`${b.label} target too small`);
     }
     assert.ok(m.sheet.bottom<= (width===844?390:844), 'sheet below viewport');
    }
   }
   await p.locator('.nero-input').fill('');
   await p.locator('[data-act=history]').click();
   await p.waitForTimeout(100);
   const m=await metrics(p);
   assert.ok(m.history.bottom<=m.sheet.y,'history must open above the input');
   assert.deepEqual(h.errors,[]);
   await p.screenshot({path:path.join(output,`composer-${width}.png`)});
   report.push({width,passed:true});
  } finally {await h.close();}
 }
 const h=await createHarness({width:390,height:844});
 try {
  await h.page.locator('.nero-input').fill('Keyboard test');
  await h.page.evaluate(()=>{
   Object.defineProperty(visualViewport,'height',{configurable:true,value:400});
   visualViewport.dispatchEvent(new Event('resize'));
  });
  const m=await metrics(h.page);
  assert.ok(m.sheet.bottom<=400&&m.root.y>=0,'composer must fit above synthetic keyboard');
 } finally {await h.close();}
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'Synthetic browser only; no live model or database requests, no physical phone verification',layout:report},null,2)+'\n');
 console.log('PASS layout: 7 widths, light/dark, long drafts, history above composer, synthetic keyboard');
}
(async()=>{await interactions();await layout();})().catch(e=>{console.error(e);process.exitCode=1});

