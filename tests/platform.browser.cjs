const assert=require('node:assert/strict');
const {start,pageFor}=require('./fixtures/platform-harness.cjs');
async function navigation(browser){
  for(const width of [320,390,1020,1021,1440]){
    const h=await pageFor(browser,{width});
    try{
      const p=h.page;
      await p.goto('http://asc.test/app/customers.html');
      await p.waitForSelector('.side');
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
  for(const type of ['reset','recover']){
    const h=await pageFor(browser,{width:390,signedOut:true});
    try{
      const p=h.page;
      await p.goto('http://asc.test/app/login.html'+(type==='recover'?'#type=recovery':''));
      if(type==='reset'){await p.locator('#forgot').click();await p.locator('#email').fill('ui@example.invalid');}
      else await p.locator('#password').fill('new-synthetic-password');
      assert.equal(await p.locator('#form').evaluate(e=>e.checkValidity()),true,`Hidden fields must not block ${type}`);
      await p.locator('#submit').click();
      await p.waitForFunction(type=>document.querySelector('#msg').textContent.includes(type==='reset'?'Link za reset poslan':'Lozinka spremljena'),type);
      assert.deepEqual(h.errors,[]);
    }finally{await h.context.close();}
  }
  console.log('PASS authentication: bounded signup fields, visible confirmation, fresh reset and recovery without hidden-field validation');
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
(async()=>{
  const browser=await start();
  try{await navigation(browser);await authentication(browser);await intakeAndIntroduction(browser);}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
