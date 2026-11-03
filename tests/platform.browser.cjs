const assert=require('node:assert/strict');
const {start,pageFor}=require('./fixtures/platform-harness.cjs');
const fs=require('node:fs');
const path=require('node:path');
async function navigation(browser){
  for(const width of [320,390,1020,1021,1440]){
    const h=await pageFor(browser,{width});
    try{
      const p=h.page;
      await p.goto('http://asc.test/app/customers.html');
      await p.waitForSelector('.side');
      if(width===1440){ // global search shortcut focuses the sidebar search
        await p.keyboard.press('Control+K');
        await p.waitForFunction(()=>document.activeElement&&document.activeElement.matches('.sb-search input'),null,{timeout:5000});
        await p.evaluate(()=>document.activeElement.blur());
      }
      if(width<=1020){
        assert.equal(await p.locator('.side').evaluate(e=>e.inert),true,'Closed mobile navigation must be inert');
        await p.locator('.sb-burger').click();
        assert.equal(await p.locator('main').evaluate(e=>e.inert),true);
        assert.equal(await p.evaluate(()=>!!document.activeElement.closest('.side')),true);
        await p.keyboard.press('Shift+Tab');
        assert.equal(await p.evaluate(()=>!!document.activeElement.closest('.side')),true);
        for(let i=0;i<22;i++){
          await p.keyboard.press('Tab');
          assert.equal(await p.evaluate(()=>!!document.activeElement.closest('.side,.acct-pop')),true,'Tab must remain in navigation');
        }
        await p.keyboard.press('Escape');
        assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('sb-burger')),true);
        assert.equal(await p.locator('main').evaluate(e=>e.inert),false);
        await p.locator('.sb-burger').click();
        await p.locator('.side .sb-user').click();
        await p.locator('.acct-pop [data-act=profile]').click();
        await p.waitForFunction(()=>!document.querySelector('.menu-drawer').inert);
        assert.equal(await p.locator('main').evaluate(e=>e.inert),true,'Profile drawer must retain background isolation');
        await p.locator('.md-close').click();
        await p.setViewportSize({width:1440,height:844});
        await p.waitForFunction(()=>!document.querySelector('.side').inert);
      }else{
        assert.equal(await p.locator('.side').evaluate(e=>e.inert),false);
        assert.equal(await p.locator('main').evaluate(e=>e.inert),false);
      }
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  }
  console.log('PASS navigation: mobile focus containment/restoration, profile handoff, 1020/1021 breakpoint, desktop reachability');
}
async function authentication(browser){
  for(const width of [320,390,768,1440]){
    const h=await pageFor(browser,{width,signedOut:true});
    try{
      const p=h.page;
      await p.goto('http://asc.test/app/login.html');
      await p.locator('#switch').click();
      const boxes=await p.evaluate(()=>[...document.querySelectorAll('.auth-card,.auth-names .fieldx,#submit,#google')].map(e=>({name:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right})));
      for(const box of boxes)assert.ok(box.x>=0&&box.right<=width,`${box.name} clipped at ${width}`);
      await p.locator('#first').fill('UI');await p.locator('#last').fill('Audit');
      await p.locator('#email').fill('ui@example.invalid');await p.locator('#password').fill('synthetic-test-password');
      await p.locator('#submit').click();
      await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('provjeri email'));
      assert.equal(await p.locator('#title').innerText(),'Dobrodošli natrag');
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  }
  for(const type of ['reset','recover','invite']){
    const h=await pageFor(browser,{width:390,signedOut:true});
    try{
      const p=h.page;
      await p.goto('http://asc.test/app/login.html'+(type==='recover'?'#type=recovery':type==='invite'?'#type=invite':''));
      if(type==='reset'){await p.locator('#forgot').click();await p.locator('#email').fill('ui@example.invalid');}
      else await p.locator('#password').fill('new-synthetic-password');
      assert.equal(await p.locator('#form').evaluate(e=>e.checkValidity()),true,`Hidden fields must not block ${type}`);
      await p.locator('#submit').click();
      await p.waitForFunction(type=>document.querySelector('#msg').textContent.includes(type==='reset'?'Link za reset poslan':'Lozinka spremljena'),type);
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  }
  const unavailable = await pageFor(browser, {width:390, signedOut:true});
  try {
    await unavailable.context.route('**/js/supabaseClient.js', route => route.abort());
    await unavailable.page.goto('http://asc.test/app/login.html');
    await unavailable.page.waitForFunction(() => document.querySelector('#msg').textContent.includes('Provjerite vezu'));
    assert.equal(await unavailable.page.locator('#submit').isDisabled(), true);
    assert.equal(await unavailable.page.locator('#google').isDisabled(), true);
    assert.equal(await unavailable.page.locator('#form').evaluate(form => form.dispatchEvent(new Event('submit',{cancelable:true}))), false, 'SDK failure cannot submit credential fields to a generic HTML endpoint');
  } finally { await unavailable.context.close(); }
  console.log('PASS authentication: bounded signup fields, visible confirmation, fresh reset and recovery without hidden-field validation');
}
async function keyboardLogin(browser) {
  for (const [width, height, visibleHeight] of [[390, 844, 308], [844, 390, 136]]) {
    const h = await pageFor(browser, { width, height, signedOut: true });
    try {
      const p = h.page;
      const out = path.join(__dirname, '../out/login-tests');
      fs.mkdirSync(out, { recursive: true });
      const snapshots = Object.create(null);
      // Desktop automation has no iOS keyboard. Model Safari's independently
      // shrinking and offset visual viewport while the layout viewport stays put.
      await h.context.addInitScript(() => {
        const visual = new EventTarget();
        Object.assign(visual, { height: innerHeight, offsetTop: 0, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { value: visual });
      });
      await p.goto('http://asc.test/app/login.html?from=studio');
      await p.locator('#email').waitFor();
      await p.screenshot({ path: path.join(out, 'login-' + width + '.png') });
      const showKeyboard = () => p.evaluate(({ height }) => {
        Object.assign(visualViewport, { height, offsetTop: 18 });
        visualViewport.dispatchEvent(new Event('resize'));
      }, { height: visibleHeight });
      for (const id of ['email', 'password', 'first', 'last']) {
        if (id === 'first') await p.locator('#switch').click();
        const field = p.locator('#' + id);
        await field.focus();
        await showKeyboard();
        await field.fill(id === 'email' ? 'operator@example.invalid' : 'Vidljiv unos');
        await p.waitForFunction(id => {
          const rect = document.getElementById(id).closest('.fieldx').getBoundingClientRect();
          return rect.top >= visualViewport.offsetTop + 10 && rect.bottom <= visualViewport.offsetTop + visualViewport.height - 17;
        }, id);
        const bounds = await field.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
        assert.ok(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16);
        assert.equal(await field.evaluate(el => el === document.activeElement), true);
        snapshots[id] = Math.round(bounds.y);
      }
      await p.evaluate(() => {
        document.activeElement.blur();
        Object.assign(visualViewport, { height: innerHeight, offsetTop: 0 });
        visualViewport.dispatchEvent(new Event('resize'));
      });
      await p.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--keyboard-space').trim() === '0px');
      await p.locator('#switch').click();
      await p.locator('#forgot').click();
      assert.match(await p.locator('#forgot').innerText(), /Natrag/);
      await p.locator('#forgot').click();
      await p.locator('#email').fill('operator@example.invalid');
      await p.locator('#password').fill('synthetic-password');
      await p.evaluate(() => { window.ASCSplash.handoff = target => { window.__handoff = target; }; });
      await p.locator('#submit').click();
      await p.waitForFunction(() => window.__handoff === 'spatial-studio/index.html');
      assert.deepEqual(h.errors, []);
      console.log('PASS login restored studio route, keyboard field positions at ' + width + 'x' + visibleHeight, snapshots);
    } finally { await h.context.close(); }
  }
}

async function intakeAndIntroduction(browser){
  const intake=await pageFor(browser,{width:320});
  try{
    await intake.page.goto('http://asc.test/app/checkin.html');
    await intake.page.waitForSelector('#planMark');
    const box=await intake.page.locator('#planMark').boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=320,'Guided-intake control must be reachable');
    assert.deepEqual(intake.errors,[]);
  }finally{await intake.context.close();}
  for(const [width,height] of [[390,844],[844,390]]){
    const h=await pageFor(browser,{width,height,onboarding:true});
    try{
      const p=h.page;
      await p.goto('http://asc.test/app/dashboard.html');
      await p.waitForSelector('.asc-onboard');
      for(let i=0;i<10;i++){
        await p.keyboard.press('Tab');
        assert.equal(await p.evaluate(()=>!!document.activeElement.closest('.asc-onboard')),true);
      }
      await p.keyboard.press('Shift+Tab');
      assert.equal(await p.evaluate(()=>!!document.activeElement.closest('.asc-onboard')),true);
      assert.equal(await p.locator('main').evaluate(e=>e.inert),true);
      await p.locator('[data-create-slot]').click();
      await p.waitForURL('**/locations.html?intro=slot');
      await p.waitForSelector('#loc-zone');
      assert.equal(await p.locator('.asc-onboard').count(),0);
      await p.waitForFunction(()=>document.activeElement.id==='loc-zone');
      await p.goto('http://asc.test/app/dashboard.html');
      await p.waitForSelector('.asc-onboard');
      await p.keyboard.press('Escape');
      assert.equal(await p.locator('.asc-onboard').count(),0);
      assert.equal(await p.locator('main').evaluate(e=>e.inert),false);
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  }
  for (const origin of ['place.html?set=ASC-2026-0003#placement', 'checkin.html?place=ASC-2026-0003']) {
    const h = await pageFor(browser, { width: 390, onboarding: true });
    try {
      const p = h.page;
      await p.goto('http://asc.test/app/' + origin);
      await p.waitForSelector('.asc-onboard');
      await p.locator('[data-create-slot]').click();
      await p.waitForURL(url => url.pathname.endsWith('/locations.html') && url.searchParams.get('intro') === 'slot');
      assert.equal(new URL(p.url()).searchParams.get('return'), origin, 'Slot setup must retain intake or placement return context');
      await p.waitForSelector('#back-to-intake');
      assert.equal(await p.locator('#back-to-intake').getAttribute('href'), origin);
      await p.waitForFunction(() => document.activeElement.id === 'loc-zone');
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  }
  for (const [from, to] of [[390, 1440], [1440, 390]]) {
    const h = await pageFor(browser, { width: from, onboarding: true });
    try {
      const p = h.page;
      await p.goto('http://asc.test/app/dashboard.html');
      await p.waitForSelector('.asc-onboard');
      await p.waitForSelector('.side', { state: 'attached' });
      await p.setViewportSize({ width: to, height: 844 });
      await p.waitForTimeout(50);
      assert.equal(await p.locator('.side').evaluate(e => e.inert), true, 'Introduction must keep navigation inert across breakpoints');
      await p.keyboard.press('Escape');
      assert.equal(await p.locator('.side').evaluate(e => e.inert), to <= 1020, 'Dismissal must reconcile current navigation breakpoint');
      assert.equal(await p.locator('main').evaluate(e => e.inert), false);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  }
  console.log('PASS intake and introduction: reachable action, focus containment, real Locations route, Escape restores page');
}
async function locate(browser){
  const output=path.resolve(__dirname,'../out/locate-tests');fs.mkdirSync(output,{recursive:true});
  for(const width of [390,1440]){
    const h=await pageFor(browser,{width,height:900,theme:'dark'});
    try{
      const p=h.page;
      await h.context.addInitScript(()=>{
        window.__inventoryRequests=[];
        window.__loadInventory=()=>new Promise((resolve,reject)=>window.__inventoryRequests.push({resolve,reject}));
        window.__testInventory=Array.from({length:1005},(_,i)=>({id:'set-'+i,public_code:'ASC-2026-'+String(i+1).padStart(4,'0'),
          zone:'A',rack:'R1',shelf:'2',slot:'3',vehicle:{plate:'DU'+String(i+1)+'TEST',customer:{name:'Sintetički kupac '+i}},tires:[{size:'225/45 R17'}]}));
        window.__beforeInventory=JSON.stringify(window.__testInventory);
      });
      await p.goto('http://asc.test/app/locate.html');
      const query=p.getByRole('searchbox',{name:'Ime, registracija, kôd ili dimenzija'});
      await query.waitFor();
      const submit=p.locator('.locate-submit'),status=p.locator('#locate-status');
      assert.equal(await submit.isDisabled(),true,'Search cannot report false empty results before inventory loads');
      await query.fill('ASC-2026-1005');await query.press('Enter');
      assert.match(await status.innerText(),/Učitavanje/);
      assert.equal(await p.locator('.flow-hit').count(),0);
      await p.evaluate(()=>window.__inventoryRequests[0].reject(new Error('Synthetic unavailable inventory')));
      await p.locator('.locate-retry').waitFor({state:'visible'});
      assert.match(await status.innerText(),/nije učitan/);
      assert.equal(await query.inputValue(),'ASC-2026-1005','An error preserves the operator query');
      assert.equal(await submit.isDisabled(),true);
      await p.locator('.locate-retry').click();
      await p.waitForFunction(()=>window.__inventoryRequests.length===2);
      await p.evaluate(()=>window.__inventoryRequests[1].resolve({sets:window.__testInventory,locations:[]}));
      await p.locator('.flow-hit').waitFor();
      assert.match(await p.locator('.flow-hit').innerText(),/ASC-2026-1005/,'A real row beyond the old server default cap remains searchable');
      assert.equal(await p.locator('.flow-hit').getAttribute('href'),'set-detail.html?code=ASC-2026-1005');
      assert.equal(await p.evaluate(()=>JSON.stringify(window.__testInventory)===window.__beforeInventory),true,'Search must never modify customer/inventory records');
      assert.equal(await p.locator('.locate-results').getAttribute('aria-busy'),'false');
      assert.equal(await status.getAttribute('role'),'status');
      assert.equal(await p.locator('.side .sb-group[data-group="warehouse"]').count(),1,'Keep a single approved warehouse navigation group');
      assert.equal(await p.locator('.side a[href$="warehouse-preview/index.html"]').count(),1);
      assert.doesNotMatch(await p.locator('.side').innerText(),/Sva skladišta|PROSTORI/,'No duplicate warehouse tree belongs in the sidebar');
      const geometry=await p.evaluate(()=>{
        const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,right:r.right,height:r.height};};
        return{width:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector('.flow-head h1')).fontFamily,input:rect('#locate-query'),submit:rect('.locate-submit')};
      });
      assert.ok(geometry.width<=width,'Locate must not overflow horizontally');
      assert.match(geometry.font,/system-ui|sans-serif/,'A blocked web font must never fall back to serif headings');
      for(const control of [geometry.input,geometry.submit])assert.ok(control.x>=0&&control.right<=width&&control.height>=44,'Search controls stay visible and touch-sized');
      await query.fill('Sintetički');
      assert.equal(await p.locator('.flow-hit').count(),0,'Editing removes results from the previous query');
      await query.press('Enter');
      assert.equal(await p.locator('.flow-hit').count(),30,'Keep result DOM bounded');
      assert.match(await status.innerText(),/1005.*30/,'Announce full match count and visible limit honestly');
      await p.waitForFunction(()=>[...document.querySelectorAll('.nero-bubble')].some(b=>b.textContent.includes('ASC-2026-0001')));
      await p.evaluate(()=>window.__oldSuggestion=[...document.querySelectorAll('.nero-bubble')].find(b=>b.textContent.includes('ASC-2026-0001')));
      await query.fill('ASC-2026-1005');
      // Invoke the captured old listener before/after its refresh: it must not
      // navigate to an earlier customer's now-detached record.
      await p.evaluate(()=>window.__oldSuggestion.click());
      assert.match(p.url(),/\/locate\.html$/,'A stale record shortcut must never navigate');
      assert.equal(await query.inputValue(),'ASC-2026-1005','Suggestion refresh preserves the typed query');
      await query.fill('ASC-2026-1005');await query.press('Enter');
      await p.waitForFunction(()=>![...document.querySelectorAll('.nero-bubble')].some(b=>/ASC-2026-000[12]/.test(b.textContent)));
      await p.screenshot({path:path.join(output,`locate-dark-${width}.png`)});
      await query.focus();await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('locate-submit')),true);
      await p.keyboard.press('Tab');
      assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('flow-hit')),true,'Results remain reachable after the search button');
      assert.equal(await p.locator('.flow-hit').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
      await p.keyboard.press('Enter');
      await p.waitForURL('**/set-detail.html?code=ASC-2026-1005');
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  }
  console.log('PASS locate: ASC styling at390/1440, complete inventory search, loading/error/retry, record preservation, keyboard result navigation');
}
async function people(browser) {
  for (const role of ['admin', 'manager', 'employee', 'readonly', null]) {
    const {page, context, errors} = await pageFor(browser, {width: 1440});
    try {
      await context.addInitScript((role) => {
        let resolveProfile;
        const waiting = new Promise(resolve => { resolveProfile = resolve; });
        window.__readProfile = () => waiting;
        window.__releaseProfile = () => resolveProfile(role ? {
          id: 'ui-audit', role, full_name: 'UI Audit', onboarded_at: '2026-10-15',
        } : null);
        sessionStorage.setItem('nero.tenant.session.v1', JSON.stringify({role: 'tenant_admin'}));
      }, role);
      await page.goto('http://asc.test/app/users.html');
      const destination = page.locator('.sb-nav a[data-m="users"]');
      await destination.waitFor({state: 'attached'});
      assert.equal(await page.locator('a[href$="users.html"]').count(), 1);
      assert.equal(await destination.isVisible(), false);
      assert.equal(await page.locator('#invite-card').isVisible(), false);
      await page.evaluate(() => window.__releaseProfile());
      if (role === 'admin' || role === 'manager') {
        await page.locator('#team-summary').waitFor({state: 'visible'});
        assert.equal(await destination.isVisible(), true);
        assert.match(await destination.textContent(), /People|Osobe/);
        assert.equal(await page.locator('#addForm').isVisible(), true);
        await page.evaluate(() => document.dispatchEvent(new Event('asc:sign-out')));
      } else {
        await page.waitForFunction(() => document.querySelector('.ulist')?.textContent.includes('Samo administratori'));
        assert.equal(await destination.isVisible(), false);
      }
      assert.equal(await page.locator('#invite-card').isVisible(), false);
      assert.equal(await page.locator('#team-summary').isVisible(), false);
      assert.equal(await page.locator('.ulist [data-user]').count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  console.log('PASS People: one working ASC directory, role-gated navigation, pending and unknown profiles fail closed, sign-out clears controls');
}
(async()=>{
  const browser=await start();
  try{await navigation(browser);await authentication(browser);await keyboardLogin(browser);await people(browser);await intakeAndIntroduction(browser);await locate(browser);}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
