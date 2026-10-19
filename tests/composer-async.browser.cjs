// All network, storage, microphone and model responses are synthetic.
// Exercise the real composer through the shared browser fixture.
const assert = require('node:assert/strict');
const { createHarness } = require('./fixtures/composer-harness.cjs');
const supabase = `
const chain = new Proxy({}, {get(_,p) {
  if (p === 'then') return resolve => Promise.resolve(resolve({data:[], error:null}));
  return () => chain;
}});
export const supabase = {
  from: () => chain,
  storage: {from: () => ({upload: () => new Promise(resolve => {
    window.__uploadDone = () => resolve({data:{}, error:null});
  })})}
};`;
const config = 'export const config={SUPABASE_URL:"https://project.example",SUPABASE_ANON_KEY:"synthetic-fixture"};';
async function withPage(fn) {
  const h = await createHarness({supabase, config});
  try {
    await h.page.evaluate(() => {
      window.SpeechRecognition = class {
        constructor() { window.__recognition = this; }
        start() {}
        stop() {}
      };
    });
    await fn(h.page);
    assert.deepEqual(h.errors, [], 'No browser exceptions during asynchronous operations');
  } finally { await h.close(); }
}
(async()=>{
 await withPage(async p=>{
  await p.locator('.nero-input').fill('Existing customer draft');
  await p.locator('.nero-mic').dispatchEvent('pointerdown',{button:0,pointerId:1});
  await p.evaluate(()=>window.__recognition.onresult({results:[Object.assign([{transcript:'additional size 205 55 16'}],{isFinal:true})]}));
  assert.equal(await p.locator('.nero-input').inputValue(),'Existing customer draft additional size 205 55 16');
  await p.evaluate(()=>window.__oldRecognition=window.__recognition);
  await p.locator('[data-act=new]').click();
  await p.locator('.nero-input').fill('New customer draft');
  await p.evaluate(()=>window.__oldRecognition.onresult({results:[Object.assign([{transcript:'STALE'}],{isFinal:true})]}));
  assert.equal(await p.locator('.nero-input').inputValue(),'New customer draft');
 });
 await withPage(async p=>{
  await p.locator('.nero-file').setInputFiles({name:'old-customer.pdf',mimeType:'application/pdf',buffer:Buffer.from('mock')});
  await p.waitForFunction(()=>!!window.__uploadDone);
  await p.locator('.nero-input').fill('Read my attachment');await p.locator('.nero-input').press('Enter');
  assert.equal(await p.evaluate(()=>window.__concierges.length),0,'Sending must wait for selected upload');
  assert.equal(await p.locator('.nero-input').inputValue(),'Read my attachment');
  await p.locator('[data-act=new]').click();await p.evaluate(()=>window.__uploadDone());await p.waitForTimeout(20);
  assert.equal(await p.locator('.nero-files').innerText(),'','Old upload must not enter new chat');
 });
 await withPage(async p=>{
  await p.evaluate(()=>{
   delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
   window.MediaRecorder=class {constructor(){window.__rec=this;this.state='inactive';this.mimeType='audio/webm'}static isTypeSupported(){return true}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['synthetic'],{type:'audio/webm'})});this.onstop()}};
   window.fetch=()=>new Promise(resolve=>window.__transcribeDone=()=>resolve({ok:true,json:async()=>({text:'STALE AUDIO'})}));
  });
  await p.locator('.nero-input').fill('First customer');
  await p.locator('.nero-mic').dispatchEvent('pointerdown',{button:0,pointerId:1});await p.waitForFunction(()=>!!window.__rec);
  await p.locator('.nero-mic').dispatchEvent('pointerup',{pointerId:1});
  await p.locator('.nero-mic').dispatchEvent('pointerdown',{button:0,pointerId:2});
  await p.waitForFunction(()=>!!window.__uploadDone);await p.evaluate(()=>window.__uploadDone());await p.waitForFunction(()=>!!window.__transcribeDone);
  await p.locator('[data-act=new]').click();await p.locator('.nero-input').fill('Second customer');
  await p.evaluate(()=>window.__transcribeDone());await p.waitForTimeout(30);
  assert.equal(await p.locator('.nero-input').inputValue(),'Second customer','Old transcription must not overwrite new chat draft');
  assert.equal(await p.locator('.nero-rec').isVisible(),false);
 });
 console.log('PASS voice preserves draft, old recognition ignored, upload blocks send, late upload ignored, late audio ignored');
})().catch(e=>{console.error(e);process.exitCode=1});
