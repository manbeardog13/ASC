// Exercise dashboard.html's own agent markup and inline event handlers.
// No real model, session, customer data or network request is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const repo = process.env.ASC_REPO || path.resolve(__dirname, '..');
const html = fs.readFileSync(process.env.ASC_DASHBOARD_FILE || path.join(repo, 'app/dashboard.html'), 'utf8');
const markup = html.match(/<section\b[^>]*\bid="agentCard"[\s\S]*?<\/section>/)?.[0];
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(code => code.includes('function askGemini(text, me)'));
assert.ok(markup && script, 'Use the actual dashboard agent markup and inline script');
async function run(mode) {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH||process.env.CHROME_PATH||'/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><html><body>'+markup+'</body></html>');
    await page.evaluate(mode => {
      window.__mode=mode; window.__requests=[]; window.__failAgent=false;
      window.ASCConcierge={answer(){
        if(window.__mode==='throw') throw new Error('synthetic concierge failure');
        if(window.__mode==='reject') return Promise.reject(new Error('synthetic concierge failure'));
        if(window.__mode==='fact') return Promise.resolve('Lokalni odgovor');
        return Promise.resolve(null);
      }};
      window.ASCAgent={configured:()=>true,ask(text,onEvent){
        window.__requests.push(text);
        if(window.__failAgent)return Promise.reject(new Error('synthetic agent failure'));
        onEvent({type:'text',text:'Odgovor agenta'});
        return Promise.resolve('Odgovor agenta');
      }};
    }, mode);
    await page.addScriptTag({content:script});
    const input=page.locator('#tbInput');
    await input.fill('Prvi upit');await page.locator('.tb-send').click();await page.waitForTimeout(30);
    if(mode==='fact') {
      assert.equal(await page.evaluate(()=>window.__requests.length),0);
      assert.match(await page.locator('.tb-reply').innerText(),/Lokalni odgovor/);
    } else {
      assert.equal(await page.evaluate(()=>window.__requests.length),1,'Concierge failure must fall through to the live-agent path');
      assert.match(await page.locator('.tb-reply').innerText(),/Odgovor agenta/);
      await page.evaluate(()=>{window.__failAgent=true;window.__mode='null'});
      await input.fill('Agent failure');await input.press('Enter');await page.waitForTimeout(30);
      assert.match(await page.locator('.tb-reply').innerText(),/Veza je pukla/);
      await page.evaluate(()=>window.__failAgent=false);
    }
    await page.evaluate(()=>window.__mode='null');
    await input.fill('Sljedeći upit');await input.press('Enter');await page.waitForTimeout(30);
    assert.equal(await input.inputValue(),'','The dashboard must accept the next request');
    assert.match(await page.locator('.tb-reply').innerText(),/Odgovor agenta/);
    assert.deepEqual(errors,[],'No unhandled concierge rejection or thrown error');
  } finally { await browser.close(); }
}
(async()=>{for(const mode of ['reject','throw','fact'])await run(mode);console.log('PASS dashboard concierge rejection/throw fallback, normal FAQ, agent-error recovery and subsequent sends');})().catch(error=>{console.error(error);process.exitCode=1});
