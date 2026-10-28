// Checkout release regression — synthetic session + routed js/db.js, no network.
// Models the slide-to-release flow, keyboard hold fallback, 8s undo window and
// the inline error + retry path. Mirrors tests/placement.browser.cjs structure.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.ASC_TEST_ROOT||path.join(__dirname,'..'));
const out=path.resolve(process.env.ASC_TEST_OUTPUT||path.join(root,'out/warehouse-tests'));
fs.mkdirSync(out,{recursive:true});
const report={mode:'source',scope:'Checkout release/undo synthetic; external requests blocked',cases:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'};

const server=http.createServer((req,res)=>{
  let file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/ASC\//,''));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(error,bytes)=>{
    if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
    res.end(bytes);
  });
});

// Routed db.js: enough surface for live-checkout.js to render and act.
// window.__writes captures every mutation; window.__failRelease / __failUndo
// toggle rejections; __deferRelease / __deferUndo park promises so a test can
// assert the pending state.
const db=`
export const loadMyProfile=async()=>({role:'employee',onboarded_at:'2026-01-01'});
export const markOnboarded=async()=>{};
export const listLocationSeats=async()=>[];
export const countLocations=async()=>3;
export const locationLabel=loc=>loc?.qr_code||'';
export const loadStorageSet=async code=>{
  if(window.__failLoad){throw new Error('Synthetic lookup failure')}
  const row={id:code,public_code:code,status:'in_storage',zone:'A',rack:'1',shelf:'2',slot:'3',qr_code:'LOC-A-1-2-3',
    vehicle:{plate:'ZD-1234',customer:{id:'cust-1',name:'Ana Horvat'}}};
  if(window.__deferLoad)return new Promise(resolve=>{window.__finishLoad=()=>resolve(row)});
  return row;
};
export const checkoutSet=async args=>{
  window.__writes.push({kind:'checkout',...args});
  if(window.__failRelease){window.__failRelease=false;throw new Error('Synthetic release failure')}
  if(window.__deferRelease)return new Promise(resolve=>{window.__finishRelease=()=>resolve({ok:true,public_code:args.publicCode})});
  return {ok:true,public_code:args.publicCode};
};
export const undoCheckout=async args=>{
  window.__writes.push({kind:'undo',...args});
  if(window.__failUndo){window.__failUndo=false;throw new Error('Synthetic undo failure')}
  return {ok:true,public_code:args.publicCode};
};`;

const qr=`window.ASCQR={normalize:raw=>raw.startsWith('ASC-')?raw:null,extractCode:raw=>raw.startsWith('ASC-')?raw:null,extractSlot:()=>null,scanInto:()=>{window.__scans=(window.__scans||0)+1},scanFile:async()=>{},stopScan:async()=>{}};window.__writes=[];`;

async function test(name,fn){
  try{report.cases.push({name,passed:true,...await fn()});}
  catch(error){report.cases.push({name,passed:false,error:error.message});}
}

async function slideThumb(page){
  // Grab the thumb and drag it past the slide threshold. Pointer events
  // dispatched via Playwright's mouse API exercise the exact production path.
  const thumb=page.locator('.release-slider__thumb');
  const track=page.locator('.release-slider__track');
  const tb=await thumb.boundingBox();
  const trackBox=await track.boundingBox();
  const startX=tb.x+tb.width/2;
  const startY=tb.y+tb.height/2;
  await page.mouse.move(startX,startY);
  await page.mouse.down();
  const endX=trackBox.x+trackBox.width-tb.width/2-4;
  for(let i=1;i<=10;i++){
    await page.mouse.move(startX+(endX-startX)*(i/10),startY,{steps:1});
  }
  await page.mouse.up();
}

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({
    executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),
    args:['--no-sandbox'],headless:true,
  });
  try{
    const context=await browser.newContext({viewport:{width:430,height:900},serviceWorkers:'block'});
    await context.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.origin!==origin)return route.abort();
      if(u.pathname.endsWith('/js/db.js'))return route.fulfill({contentType:'text/javascript',body:db});
      if(u.pathname.endsWith('/app/qr.js'))return route.fulfill({contentType:'text/javascript',body:qr});
      if(['/app/app.js','/app/composer.js','/app/theme-boot.js'].some(v=>u.pathname.endsWith(v)))return route.fulfill({contentType:'text/javascript',body:''});
      return route.continue();
    });
    const page=await context.newPage();
    let errors=[];page.on('pageerror',e=>errors.push(e.message));

    const open=async()=>{
      errors=[];
      await page.goto(origin+'/ASC/app/checkout.html?set=ASC-FIRST');
      await page.waitForSelector('#release-control');
    };

    // --- 1) Skeleton reserves height before data arrives --------------------
    // The `_defer=1` URL marker (consumed by the stubbed loadStorageSet) parks
    // the lookup so the skeleton stays visible long enough to be measured.
    // Both heights come from the same viewport — they must match within a few
    // pixels so the slider rendering does not cause layout shift.
    await page.addInitScript(()=>{if(location.search.includes('_defer=1'))window.__deferLoad=true});
    await page.goto(origin+'/ASC/app/checkout.html?set=ASC-FIRST&_defer=1');
    await page.waitForSelector('.release-skeleton');
    const skeletonHeight=await page.evaluate(()=>Math.round(document.querySelector('.release-skeleton').getBoundingClientRect().height));
    await page.evaluate(()=>window.__finishLoad());
    await page.waitForSelector('#release-control');
    const sliderHeight=await page.evaluate(()=>Math.round(document.querySelector('#release-control').getBoundingClientRect().height));
    await test('skeleton reserves the slider height before data loads',async()=>{
      assert.ok(skeletonHeight>=70&&skeletonHeight<=90,`skeleton height ${skeletonHeight}px should match slider (~76px)`);
      assert.ok(Math.abs(skeletonHeight-sliderHeight)<=4,`skeleton (${skeletonHeight}px) and slider (${sliderHeight}px) must match within 4px`);
    });

    // --- 2) Slide release commits the checkout and shows success + undo ------
    await open();
    await slideThumb(page);
    await page.waitForSelector('.release-done');
    await test('slide-to-release schedules checkout without freeing the slot',async()=>{
      assert.deepEqual(errors,[]);
      const writes=await page.evaluate(()=>window.__writes);
      assert.equal(writes.length,0,'no write during cancellable grace period');
      assert.ok(await page.locator('#release-undo').isVisible());
      assert.equal(await page.locator('#release-open').count(),0,'no early navigation during pending release');
    });

    // --- 3) Undo rolls the checkout back and keeps the user on the page ------
    await page.locator('#release-undo').click();
    await page.waitForSelector('#release-control');
    await test('undo cancels locally and returns to the slider',async()=>{
      const writes=await page.evaluate(()=>window.__writes);
      assert.equal(writes.length,0,'Undo must never issue an inverse write');
      // Still on checkout.html — no navigation.
      assert.ok(page.url().includes('/checkout.html'));
    });

    // --- 4) Keyboard hold (Enter 600ms) also commits the release -------------
    await page.evaluate(()=>{window.__writes=[]});
    await page.locator('#release-control').focus();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(720);
    await page.keyboard.up('Enter');
    await page.waitForSelector('.release-done');
    await test('press-and-hold Enter for 600ms schedules release',async()=>{
      const writes=await page.evaluate(()=>window.__writes);
      assert.equal(writes.length,0,'keyboard release uses the same cancellable grace period');
    });

    // --- 5) Short Enter press does NOT commit --------------------------------
    await page.evaluate(()=>{window.__writes=[]});
    await open();
    await page.locator('#release-control').focus();
    await page.keyboard.down('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.up('Enter');
    await page.waitForTimeout(220);
    await test('releasing Enter before 600ms cancels the hold',async()=>{
      const writes=await page.evaluate(()=>window.__writes);
      assert.equal(writes.length,0,'no checkout write expected');
      assert.ok(await page.locator('#release-control').isVisible());
    });

    // --- 6) Error surfaces inline (role=alert) and retry keeps the slider ----
    await page.evaluate(()=>{window.__failRelease=true;window.__writes=[]});
    await slideThumb(page);
    await page.waitForSelector('[role="alert"].release-error');
    await test('release failure renders inline role=alert with retry',async()=>{
      const alertText=await page.locator('[role="alert"].release-error').textContent();
      assert.match(alertText,/Synthetic release failure/);
      assert.ok(await page.locator('#release-control').isVisible());
      assert.ok(await page.locator('#release-retry').isVisible());
      const writes=await page.evaluate(()=>window.__writes);
      assert.equal(writes.length,1,'first attempt was captured');
    });
    await page.locator('#release-retry').click();
    await page.waitForSelector('.release-done');
    await test('retry after error offers a fresh cancellation window',async()=>{
      const writes=await page.evaluate(()=>window.__writes);
      assert.equal(writes.length,1,'retry is pending until its grace period ends');
      assert.ok(await page.locator('#release-undo').isVisible());
    });

    await page.clock.install();
    await open();
    await page.evaluate(()=>{window.__deferRelease=true});
    await slideThumb(page);
    await page.clock.fastForward(8001);
    await page.waitForFunction(()=>typeof window.__finishRelease==='function');
    await test('expiry dispatches exactly one checkout and holds navigation until success',async()=>{
      assert.equal(await page.evaluate(()=>window.__writes.length),1);
      assert.ok(page.url().includes('checkout.html'));
      assert.equal(await page.locator('#release-control').getAttribute('aria-disabled'),'true');
      await page.evaluate(()=>window.__finishRelease());
      await page.waitForURL('**/set-detail.html?code=ASC-FIRST');
    });
    await open();await slideThumb(page);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.clock.fastForward(9000);
    await test('departed page never commits a pending release',async()=>{
      assert.equal(await page.evaluate(()=>window.__writes.length),0);
    });
    report.pageErrors=errors;
    await context.close();
  }finally{
    await browser.close();
    await new Promise(r=>server.close(r));
    fs.writeFileSync(path.join(out,report.mode+'-checkout-release-report.json'),JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report,null,2));
  if(report.cases.some(c=>!c.passed))process.exitCode=1;
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
