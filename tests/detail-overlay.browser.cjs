const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.endsWith('.html')){
    res.setHeader('Content-Type','text/html');
    const list=url.pathname.endsWith('dashboard.html');
    return res.end(`<html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/app/app.css"></head><body><main style="min-height:100vh"><h1>${list?'Fixture list':'Fixture detail'}</h1><a id="set" href="/app/set-detail.html?code=ASC-FIXTURE">Set record</a><a id="customer" href="/app/customers.html?id=fixture">Customer record</a><button>Action fixture</button></main><script type="module" src="/app/detail-overlay.js"></script></body></html>`);
  }
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'msedge'})});
  try{
    for(const width of [390,1440]){
      const context=await browser.newContext({viewport:{width,height:900}});
      const page=await context.newPage();const origin='http://127.0.0.1:'+server.address().port;
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/app/dashboard.html');
      await page.waitForTimeout(100);
      const before=await page.locator('main').boundingBox();
      await page.locator('#set').click();await page.locator('dialog[open]').waitFor();
      assert.ok(page.url().endsWith('set-detail.html?code=ASC-FIXTURE'));
      assert.deepEqual(await page.locator('body > main').boundingBox(),before,'underlying list does not shift');
      const box=await page.locator('dialog').boundingBox();
      if(width>=1024)assert.ok(box.x>0);else assert.equal(box.x,0);
      await page.frameLocator('iframe').getByRole('button',{name:'Action fixture'}).focus();
      await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
      assert.ok(page.url().endsWith('dashboard.html'));
      assert.equal(await page.evaluate(()=>document.activeElement.id),'set');
      await page.locator('#customer').focus();await page.keyboard.press('Enter');
      await page.locator('dialog[open]').waitFor();
      await page.goBack();await page.locator('dialog').waitFor({state:'detached'});
      await page.goForward();await page.locator('dialog[open]').waitFor();
      await page.reload();assert.equal(await page.locator('dialog').count(),0);
      assert.equal(await page.locator('h1').textContent(),'Fixture detail');
      await context.close();
    }
    console.log('PASS: phone/desktop sheet, unchanged list bounds, keyboard, child Escape, focus return, back/forward, refresh full-page');
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
