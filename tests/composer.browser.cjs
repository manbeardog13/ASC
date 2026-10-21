const assert=require('node:assert/strict');
const {createHarness,metrics,repo}=require('./fixtures/composer-harness.cjs');
const fs=require('node:fs');
const path=require('node:path');
async function interactions(){
 const h=await createHarness();const p=h.page;
 try {
 const input=p.locator('.nero-input'),send=p.locator('.nero-send'),root=p.locator('#neroComposer');
 await send.click();
 assert.equal(await p.evaluate(()=>window.__concierges.length),0,'An empty arrow click must not send a message');
 assert.equal(await p.evaluate(()=>window.__requests.length),0,'An empty arrow click must not start AI');
 await input.fill('Gdje je moj set?');await send.click();
 await p.waitForFunction(()=>window.__concierges.length===1);
 assert.equal(await p.evaluate(()=>window.__concierges[0].text),'Gdje je moj set?','The arrow must send the draft');
 assert.equal(await input.inputValue(),'','Successful submission clears the sent draft');
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
 console.log('PASS arrow send and blank guard, stop during concierge, new chat late events, concierge rejection fallback, IME Enter, conversation restore');
 } finally { await h.close(); }
}
async function referenceLayout(){
 for(const width of [320,390,706,1440]){
  const h=await createHarness({width,height:844});
  try {
   const p=h.page;
   const m=await p.evaluate(()=>{
    const rect=selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,visible:!!el.getClientRects().length&&!el.hidden};};
    return {compact:document.querySelector('#neroComposer').classList.contains('is-compact'),sheet:rect('.nero-sheet'),input:rect('.nero-input'),plus:rect('.nero-plus'),mic:rect('.nero-mic'),send:rect('.nero-send'),tools:rect('.nero-tools')};
   });
   assert.equal(m.compact,true,'Measure the untouched browsing state');
   for(const name of ['plus','mic','send']){
    const b=m[name];
    assert.equal(b.visible,true,`${name} must be visible before focusing at ${width}`);
    assert.ok(b.width>=43.9&&b.height>=43.9,`${name} target too small at ${width}`);
    assert.ok(b.x>=0&&b.right<=width,`${name} clipped at ${width}`);
    assert.ok(m.input.bottom<=b.y,`Text must stay above ${name} at ${width}`);
   }
   assert.ok(Math.abs(m.plus.y-m.mic.y)<1&&Math.abs(m.mic.y-m.send.y)<1,`Primary controls must share one row at ${width}`);
   assert.ok(m.plus.right<m.mic.x&&m.mic.right<=m.send.x,'Attachment is left; dictation and send are right');
   assert.ok(m.sheet.width<=476.1,'Desktop composer is 30% narrower than its previous680px cap');
   assert.ok(Math.abs(m.plus.width-m.send.width)<.1&&Math.abs(m.plus.height-m.send.height)<.1,'Corner buttons must have identical dimensions');
   const insets=[m.plus.x-m.sheet.x,m.sheet.right-m.send.right,m.sheet.bottom-m.plus.bottom,m.sheet.bottom-m.send.bottom];
   assert.ok(Math.max(...insets)-Math.min(...insets)<1,'Both corner controls have exactly equal side and bottom insets');
   await p.locator('.nero-input').focus();
   const pills=await p.locator('.nero-pills').boundingBox();
   const sheet=await p.locator('.nero-sheet').boundingBox();
   assert.ok(pills&&pills.y+pills.height<=sheet.y,'Conversation controls must remain above the reference sheet');
   // Put an existing page action below the fold, then reach it by keyboard.
   // Reserving body space alone is insufficient if native focus scrolls it under the fixed dock.
   await p.getByRole('main').getByRole('button',{name:'Ispiši oznaku novog seta',exact:true}).evaluate(el=>{el.style.marginTop='1000px';el.dataset.focusTarget='last-page-action';});
   await p.getByRole('main').getByRole('button',{name:'Odaberi slobodnu lokaciju',exact:true}).focus();
   await p.keyboard.press('Tab');
   await p.waitForFunction(()=>{
    const target=document.querySelector('[data-focus-target="last-page-action"]');
    return document.activeElement===target&&target.getBoundingClientRect().bottom<=document.querySelector('#neroComposer').getBoundingClientRect().top;
   });
   assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
 }
 console.log('PASS resting two-row layout and keyboard page-action clearance at 320, 390, 706 and 1440 px');
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
    await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme==='dark');},theme);
    for(const draft of ['', 'Opis novog seta guma. '.repeat(60)]){
     await p.locator('.nero-input').fill(draft);
     const m=await metrics(p);
     assert.ok(m.scrollWidth<=width,`page overflow at ${width}`);
     assert.equal(m.inputFont,'16px');
     const pills=await p.locator('.nero-pills button').evaluateAll(nodes=>nodes.filter(el=>!el.hidden&&!!el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {label:el.textContent,x:r.x,right:r.right,width:r.width,height:r.height}}));
     for(const b of [...m.tools,...pills]){
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
async function neutralGlassAndSuggestions(){
 for(const width of [390,1440]){
  const h=await createHarness({width,height:900});
  try{
   const p=h.page;
   await p.getByRole('main').getByRole('button',{name:'Spremi podatke kupca',exact:true}).evaluate(el=>el.addEventListener('click',()=>window.__suggestionClicks=(window.__suggestionClicks||0)+1));
   // A real page card crossing the composer band produces its real wired actions.
   await p.locator('main .card').evaluate(el=>el.style.minHeight='1400px');
   await p.locator('.nero-suggest.on').waitFor();
   for(const theme of ['light','dark']){
    await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.classList.toggle('dark',theme==='dark');},theme);
    const style=await p.locator('.nero-sheet').evaluate(el=>{const s=getComputedStyle(el);return{color:s.backgroundColor,blur:s.backdropFilter};});
    const channels=style.color.match(/[\d.]+/g).map(Number);
    assert.ok(Math.max(...channels.slice(0,3))-Math.min(...channels.slice(0,3))<=10,'Glass must be neutral, without a purple fill');
    assert.ok(channels[3]>=.3&&channels[3]<=.65,'Glass must transmit the backdrop instead of becoming an opaque bar');
    assert.match(style.blur,/blur\([1-9]/,'Frost must actually blur the page behind the sheet');
    const row=await p.locator('.nero-suggest').boundingBox();
    assert.ok(row.height<=44.1,'Suggestions must fit one horizontal touch row');
    const buttons=await p.locator('.nero-bubble').evaluateAll(nodes=>nodes.map(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el,'::before');
     return{height:r.height,y:r.y,visualHeight:r.height-parseFloat(s.top)-parseFloat(s.bottom),whiteSpace:getComputedStyle(el).whiteSpace};
    }));
    for(const b of buttons){assert.ok(b.height>=44&&b.visualHeight<=28.1,'Suggestion visual capsule stays28px inside a44px target');assert.equal(b.whiteSpace,'nowrap');assert.ok(Math.abs(b.y-row.y)<1);}
    await p.screenshot({path:path.join(repo,`out/composer-tests/composer-glass-${theme}-${width}.png`)});
   }
   await p.locator('.nero-suggest').getByRole('button',{name:'Spremi podatke kupca',exact:true}).click();
   assert.equal(await p.evaluate(()=>window.__suggestionClicks),1,'Suggestions must execute their original page action');
   assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
 }
 console.log('PASS neutral transparent frosting, one-row28px visual suggestions with44px targets, real suggestion action');
}
async function dashboardFooter(){
 const {start,pageFor}=require('./fixtures/platform-harness.cjs');
 const browser=await start();
 try{
  for(const width of [390,1440]){
   const h=await pageFor(browser,{width,height:900,theme:'dark'});
   try{
    const p=h.page;
    await p.goto('http://asc.test/app/dashboard.html');
    await p.locator('#neroComposer').waitFor();
    const bounds=()=>p.evaluate(()=>{
     const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,bottom:r.bottom};};
     return{footer:box('.nero-mark'),composer:box('#neroComposer'),viewport:innerHeight,position:getComputedStyle(document.querySelector('.nero-mark')).position};
    });
    let b=await bounds();
    assert.equal(b.position,'fixed');
    assert.ok(Math.abs(b.viewport-b.footer.bottom-8)<1,'Credit must sit8px above the actual viewport bottom');
    assert.ok(b.composer.bottom<b.footer.y,'Composer and footer must never overlap');
    assert.ok(Math.abs(b.composer.x+b.composer.width/2-b.footer.x-b.footer.width/2)<1,'Footer and composer share the content-column center');
    const footerY=b.footer.y;
    await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));
    await p.waitForTimeout(50);
    b=await bounds();
    assert.ok(Math.abs(b.footer.y-footerY)<1,'Scrolling cannot strand the credit above the bottom edge');
    await p.screenshot({path:path.join(repo,`out/composer-tests/composer-footer-${width}.png`)});
    await p.locator('.nero-input').fill('Provjera tipkovnice');
    await p.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:400});visualViewport.dispatchEvent(new Event('resize'));});
    b=await bounds();
    assert.ok(b.composer.bottom<=400&&b.composer.y>=0,'Composer remains above the synthetic keyboard');
    assert.ok(b.composer.bottom<b.footer.y,'Keyboard lift does not collide with the viewport-edge credit');
    assert.deepEqual(h.errors,[]);
   }finally{await h.context.close();}
  }
 }finally{await browser.close();}
 console.log('PASS actual dashboard footer8px from bottom, fixed while scrolling, content aligned, no composer/keyboard overlap');
}
(async()=>{await interactions();await referenceLayout();await layout();await neutralGlassAndSuggestions();await dashboardFooter();})().catch(e=>{console.error(e);process.exitCode=1});
