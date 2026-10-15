const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const repo = process.env.ASC_REPO || path.resolve(__dirname, '../..');
const fixture = `<!doctype html><html lang="hr" data-theme="light" data-module="checkin"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app/app.css"></head><body><main class="shell"><h1>Prijem guma</h1><section class="card" style="margin-top:20px;min-height:300px"><h2>Novi set</h2><label>Ime kupca<input aria-label="Ime kupca"></label><button type="button">Spremi podatke kupca</button><button type="button">Odaberi slobodnu lokaciju</button><button type="button">Ispiši oznaku novog seta</button></section></main><script src="/app/composer.js"></script></body></html>`;
const db = `export const getSession=async()=>({user:{id:'test-user'},access_token:'synthetic-test-only'});export const loadMyProfile=async()=>({role:window.__role||'admin'});export const signedPhotoUrls=async()=>({});`;
const supabase = `const chain = new Proxy({}, {get(_,p){if(p==='then')return (resolve)=>Promise.resolve(resolve({data:[],error:null}));return ()=>chain}});export const supabase={from:()=>chain,storage:{from:()=>({upload:async()=>({data:{},error:null})})}};`;
async function createHarness(options={}) {
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:options.width||390,height:options.height||844},deviceScaleFactor:1,isMobile:!!options.mobile,hasTouch:!!options.mobile,reducedMotion:options.reducedMotion||'reduce',serviceWorkers:'block'});
 await context.addInitScript(({role})=>{
  window.__role=role; window.__requests=[]; window.__concierges=[]; window.__conciergeMode='defer'; window.__agentMode='defer';
  window.ASCConcierge={answer(text){if(window.__conciergeMode==='null')return Promise.resolve(null);if(window.__conciergeMode==='reject')return Promise.reject(new Error('fixture concierge failure'));return new Promise((resolve,reject)=>window.__concierges.push({text,resolve,reject}));}};
  window.ASCAgent={isConfigured:()=>true,configured:()=>true,ask(text,onEvent,options){return new Promise((resolve,reject)=>window.__requests.push({text,onEvent,options,resolve,reject}));},cancel(){window.__cancelCount=(window.__cancelCount||0)+1;},reset(){window.__resetCount=(window.__resetCount||0)+1;},recall(){}};
  window.SpeechRecognition=class {start(){}stop(){}};
  window.ASC_AGENT_REMOTE_ALLOWED=true;
 },{role:options.role||'admin'});
 const network=[];
 await context.route('**/*',async route=>{
   const u=new URL(route.request().url());network.push(u.origin+u.pathname);
   if(u.origin!=='http://asc.test')return route.fulfill({status:200,body:'',contentType:'text/plain'});
   const p=u.pathname;
   if(p==='/app/checkin.html')return route.fulfill({body:fixture,contentType:'text/html'});
   if(p==='/js/db.js')return route.fulfill({body:db,contentType:'text/javascript'});
   if(p==='/js/supabaseClient.js')return route.fulfill({body:supabase,contentType:'text/javascript'});
   if(p==='/js/config.js')return route.fulfill({body:'export const config={};',contentType:'text/javascript'});
   if(['/app/concierge.js','/app/agent-config.js','/app/qr.js','/app/agent-gemini.js','/app/builder-queue.js'].includes(p))return route.fulfill({body:'',contentType:'text/javascript'});
   let file=path.join(repo,p);
      if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.woff2')?'font/woff2':'application/octet-stream'});
   return route.fulfill({status:404,body:''});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://asc.test/app/checkin.html');await page.locator('#neroComposer').waitFor();
 await page.waitForTimeout(100);
 return {browser,context,page,network,errors,close:()=>browser.close()};
}
async function metrics(page){return page.evaluate(()=>{
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
 const visible=el=>!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
 return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,root:rect(document.querySelector('#neroComposer')),inputFont:getComputedStyle(document.querySelector('.nero-input')).fontSize,tools:[...document.querySelectorAll('.nero-tools button')].filter(visible).map(el=>({label:el.getAttribute('aria-label')||el.textContent,...rect(el)})),sheet:rect(document.querySelector('.nero-sheet')),history:document.querySelector('.nero-history').hidden?null:rect(document.querySelector('.nero-history'))};
 });}
module.exports={createHarness,metrics,repo};
