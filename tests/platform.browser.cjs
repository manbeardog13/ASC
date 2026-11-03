const assert=require('node:assert/strict');
const {start,pageFor}=require('./fixtures/platform-harness.cjs');
const fs=require('node:fs');
const path=require('node:path');
async function navigation(browser){
  for(const width of [320,390,1020,1021,1440]){
    const h=await pageFor(browser,{width});
    try{
      const p=h.page;
      await h.context.addInitScript(()=>localStorage.setItem('asc.profile',JSON.stringify({name:'Previous account',role:'Administrator'})));
      await p.goto('http://asc.test/app/customers.html');
      await p.waitForSelector('.side');
      if(width===1440){ // global search shortcut focuses the sidebar search
        await p.keyboard.press('Control+K');
        await p.waitForFunction(()=>document.activeElement&&document.activeElement.matches('.sb-search input'),null,{timeout:5000});
        await p.evaluate(()=>document.activeElement.blur());
        await p.locator('.sb-collapse').click();
        await p.locator('.sb-group[data-group="warehouse"] > button').click();
        assert.equal(await p.locator('html').getAttribute('data-side'),null,'Warehouse can be opened from the collapsed rail');
        const studio = p.getByRole('link', {name:'Prostorni studio', exact:true});
        await studio.waitFor({state:'visible'});
        assert.match(await studio.getAttribute('href'), /spatial-studio\/index\.html$/);
        await p.locator('.sb-user').click();
        await p.keyboard.press('ArrowDown');
        await p.keyboard.press('ArrowDown');
        await p.keyboard.press('Enter');
        assert.equal(await p.locator('.md-panel[data-panel=options]').isVisible(),true,'Settings opens its own panel');
        await p.keyboard.press('Escape');
        assert.equal(await p.locator('.sb-user').evaluate(el=>document.activeElement===el),true);
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
        await p.waitForFunction(()=>document.getElementById('mp-name').value==='UI Audit');
        assert.equal(await p.locator('#mp-role').evaluate(e=>e.readOnly),true);
        assert.equal(await p.evaluate(()=>localStorage.getItem('asc.profile')),null);
        if(width===390){
          await p.locator('#mp-name').fill('Novi Operater');
          await p.getByRole('button',{name:'Spremi ime'}).click();
          await p.waitForFunction(()=>document.getElementById('sbName').textContent==='Novi Operater');
        }
        await p.locator('.md-close').click();
        assert.equal(await p.locator('.sb-burger').evaluate(el=>el===document.activeElement),true);
        await p.locator('.sb-burger').click();
        await p.getByRole('button',{name:'Zatvori izbornik'}).click();
        assert.equal(await p.locator('.side').evaluate(el=>el.inert),true);
        await p.setViewportSize({width:1440,height:844});
        await p.waitForFunction(()=>!document.querySelector('.side').inert);
      }else{
        assert.equal(await p.locator('.side').evaluate(e=>e.inert),false);
        assert.equal(await p.locator('main').evaluate(e=>e.inert),false);
      }
      if (width === 1440) {
        await p.getByRole('link', {name:'Prostorni studio', exact:true}).click();
        await p.getByRole('button', {name:'Vodič', exact:true}).click();
        await p.getByRole('dialog', {name:'Vodič kroz skladište'}).waitFor();
        await p.goto('http://asc.test/app/customers.html');
        const guide = p.getByRole('link', {name:'Vodič za skladište', exact:true});
        await p.locator('.sb-group[data-group="more"] > button').click();
        await guide.click();
        await p.getByRole('link', {name:'Vođeni obilazak', exact:true}).click();
        assert.equal(new URL(p.url()).searchParams.get('guide'), '1');
        await p.getByRole('dialog', {name:'Vodič kroz skladište'}).waitFor();
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
      if(type==='reset'){
        await p.evaluate(async () => {
          const {supabase} = await import('/js/supabaseClient.js');
          supabase.auth.signInWithOAuth = async () => { throw new Error('Synthetic transport failure'); };
        });
        await p.locator('#google').click();
        await p.waitForFunction(() => document.querySelector('#msg').textContent === 'Google prijava nije uspjela.');
        assert.equal(await p.locator('#submit').isEnabled(), true);
        await p.locator('#forgot').click();
        assert.equal(await p.locator('#forgot').innerText(),'Natrag na prijavu');
        assert.equal(await p.getByRole('textbox', {name:'E-pošta', exact:true}).count(),1);
        await p.locator('#email').fill('ui@example.invalid');
      }
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
      const route = width === 390 ? '' : '&room=house-attic&view=walk&vodic=obilazak&guide=3&find=ASC-2026-0003';
      await p.goto('http://asc.test/app/login.html?from=studio' + route);
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
      await p.waitForFunction(() => window.__handoff);
      assert.equal(await p.evaluate(() => window.__handoff), 'spatial-studio/index.html' + route.replace(/^&/, '?'));
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
        window.__staffProfile = () => waiting;
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
async function operationalFeedback(browser) {
  for (const width of [320, 1440]) {
    const h = await pageFor(browser, { width });
    try {
      const p = h.page;
      await h.context.route(url => url.pathname === '/js/db.js' && !url.search, route => route.fulfill({
        contentType: 'text/javascript',
        body: `export * from '/js/db.js?fixture';
          const unavailable = async () => { throw new Error('Synthetic service failure'); };
          export { unavailable as listRecycleBin, unavailable as listUsers };
          export const listCustomers = async () => location.search === '?sample=1'
            ? [{id:'c1', name:'Pokusni kupac', vehicles:[{make:'Vozilo', plate:'TEST42', storage_sets:[{public_code:'ASC-2026-0042',season:'winter'}]}]}]
            : unavailable();
          export const listStorageSets = async () => {
            if (location.pathname.endsWith('workshop.html')) return unavailable();
            return [{id:'one',public_code:'ASC-TEST',status:'in_storage',expected_out_date:'2025-01-01'}];
          };
          export const recentMovements = async () => [
            {action:'move',created_at:'2026-10-20T10:00:00Z',storage_sets:{public_code:'ASC-TEST'}},
            {action:'in',created_at:'2026-10-19T10:00:00Z',storage_sets:{public_code:'ASC-TEST'}},
          ];
          export const markReminded = async () => {
            window.attempts = (window.attempts || 0) + 1;
            if (window.attempts === 1) return unavailable();
            return {queued:false};
          };`,
      }));
      const photoRequests = [];
      const trackPhotos = request => {
        if (/\/assets\/(?:set-\d+\.jpg|asc-tyres-original\.png)$/.test(new URL(request.url()).pathname)) {
          photoRequests.push(request.url());
        }
      };
      p.on('request', trackPhotos);
      await p.goto('http://asc.test/app/dashboard.html');
      await p.locator('.dash-overview summary').click();
      const movements = p.locator('#gMovesList li');
      await movements.filter({hasText:'Premještaj'}).waitFor({state:'visible'});
      assert.deepEqual(await movements.locator('b').allTextContents(), ['ASC-TEST', 'ASC-TEST']);
      assert.deepEqual(await movements.locator('span').allTextContents(), ['Premještaj', 'Ulaz']);
      assert.ok((await movements.locator('time').allTextContents()).every(Boolean));
      assert.equal(await p.locator('.stream-track, .asc-stock-strip, .asc-tyre-stream, [aria-roledescription="carousel"]').count(), 0,
        'A loaded dashboard must not render a rotating inventory feed');
      assert.deepEqual(photoRequests, [], 'Inventory must not request decorative carousel photos');
      p.off('request', trackPhotos);

      for (const [file, title] of [['customers','Kupci nisu učitani'], ['recycle','Koš nije učitan.'], ['workshop','Podaci za radionicu nisu učitani.'], ['users','Popis članova nije učitan']]) {
        await p.goto('http://asc.test/app/' + file + '.html');
        await p.getByText(title, {exact:false}).first().waitFor({state:'visible'});
        const retry = p.getByRole('link', {name:'Pokušaj ponovno'});
        assert.ok((await retry.getAttribute('href')).endsWith(file+'.html'));
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), file+' overflows');
      }
      await p.goto('http://asc.test/app/customers.html?sample=1');
      await p.locator('.disc-cust > .disc-head').click();
      await p.locator('.disc-car > .disc-head').click();
      await p.locator('[data-sticker]').click();
      await p.locator('.sticker-modal .sm-qr svg').waitFor();
      assert.equal(await p.locator('.sm-who').innerText(), 'Pokusni kupac');
      assert.match(await p.locator('.sm-sub').innerText(), /TEST42/);
      await p.keyboard.press('Escape');
      await p.locator('.sticker-modal').waitFor({state:'detached'});
      await p.goto('http://asc.test/app/reminders.html');
      const pending = p.locator('[data-sec=overdue] [data-remind]');
      await pending.click();
      await p.waitForFunction(() => document.querySelector('#toastMsg').textContent.includes('Neuspjelo: 1'));
      assert.equal(await pending.isVisible(), true, 'Failed write must leave the reminder actionable');
      p.once('dialog', dialog => dialog.dismiss());
      await p.locator('.rem-stage .cta').click();
      assert.equal(await p.evaluate(() => window.attempts), 1, 'Cancel must not mark any customer');
      await pending.click();
      await p.waitForFunction(() => !document.querySelector('[data-sec=overdue] .rr'));
      await p.locator('.rem-rested summary').click();
      assert.equal(await p.locator('.rem-rested .rr-code').innerText(), 'ASC-TEST');
      assert.equal(await p.locator('.rem-stage .cta').isVisible(), false);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  }
  console.log('PASS staff feedback: truthful customer, bin, workshop and user errors, confirmed reminder writes, bulk cancellation, 320/1440px');
}
async function staffWorkflowAccess(browser) {
  for (const [route, role] of [['checkin','readonly'],['locations','unknown'],['place','failed'],['checkout','changed']]) {
    const h = await pageFor(browser, {width:390, theme:'dark'});
    try {
      await h.context.addInitScript(role => {
        window.__staffProfile = async () => {
          if (role === 'failed') throw Error('Synthetic unavailable profile');
          return {id:role === 'changed' ? 'different-user' : 'ui-audit', role:role === 'changed' ? 'admin' : role};
        };
      }, role);
      const loads = [];
      h.page.on('request', req => { if (req.url().endsWith('/live-'+route+'.js')) loads.push(req.url()); });
      await h.page.goto('http://asc.test/app/'+route+'.html');
      const panel = h.page.locator('.workflow-gate');
      await panel.waitFor();
      assert.match(await panel.innerText(), role === 'failed' || role === 'changed' ? /Ovlasti nisu provjerene/ : /Pristup na čekanju/);
      assert.equal(await h.page.locator('main form:visible').count(), 0);
      assert.equal(await panel.getByRole('link',{name:'Ploča'}).getAttribute('href'), 'dashboard.html');
      assert.deepEqual(loads, [], 'Denied workflow must not request its scanner, inventory or mutation module');
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  }
  const h = await pageFor(browser, {width:1440,theme:'light'});
  try {
    await h.context.addInitScript(() => {
      window.__staffProfile = () => new Promise(resolve => {
        (window.__releaseStaff ||= []).push(() => resolve({id:'ui-audit',role:'reception',onboarded_at:'2026-01-01'}));
      });
    });
    await h.page.goto('http://asc.test/app/locations.html?zone=A',{waitUntil:'commit'});
    await h.page.waitForFunction(() => window.__releaseStaff?.length > 0);
    assert.equal(await h.page.locator('#loc-zone').count(), 0);
    await h.page.evaluate(() => {
      window.__staffProfile = async () => ({id:'ui-audit',role:'reception',onboarded_at:'2026-01-01'});
      window.__releaseStaff.forEach(release => release());
    });
    await h.page.locator('#loc-zone').waitFor();
    assert.equal(await h.page.locator('#loc-zone').inputValue(), 'A');
    assert.equal(await h.page.locator('.workflow-gate').count(), 0);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
  console.log('PASS staff workflow access: four routes fail closed, deferred profile prevents early scanner or form start, reception resumes normal work');
}
(async()=>{
  const browser=await start();
  try{await navigation(browser);await authentication(browser);await keyboardLogin(browser);await people(browser);await intakeAndIntroduction(browser);await locate(browser);await operationalFeedback(browser);await staffWorkflowAccess(browser);}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
