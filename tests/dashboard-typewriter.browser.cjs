// Nero card typewriter: a stream that sends one tiny chunk, then the rest at
// once, must still reveal steadily — no stall on the first char, no dump at end.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const repo = process.env.ASC_REPO || path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'app/dashboard.html'), 'utf8');
const markup = html.match(/<section\b[^>]*\bid="agentCard"[\s\S]*?<\/section>/)?.[0];
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(c => c.includes('function askGemini(text, me)'));
const REST = 'okej'.repeat(150);
async function run(reduced) {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH||process.env.CHROME_PATH||'/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.route('**/*', r => r.abort());
    await page.setContent('<!doctype html><html><body>'+markup+'</body></html>');
    await page.evaluate((REST) => {
      window.ASCConcierge={answer(){return Promise.resolve(null)}};
      window.ASCAgent={configured:()=>true,ask(text,onEvent){
        return new Promise(res=>{setTimeout(()=>onEvent({type:'delta',text:'B'}),100);
          setTimeout(()=>onEvent({type:'delta',text:REST}),1100);
          setTimeout(()=>res('B'+REST),1150);});
      }};
    }, REST);
    await page.addScriptTag({content:script});
    await page.locator('#tbInput').fill('pitanje'); await page.locator('.tb-send').click();
    await page.waitForTimeout(40);
    assert.match(await page.locator('.tb-ans').innerText(), /Razmišljam/, 'typing indicator before the first token');
    const len = async () => (await page.locator('.tb-ans').innerText()).replace(/▍$/,'').length;
    const samples = [];
    for (let i = 0; i < 60; i++) { await page.waitForTimeout(50); samples.push(await len()); }
    const total = REST.length + 1; if (process.env.DBG) console.log(samples.join(','));
    assert.equal(samples[samples.length-1], total, 'everything revealed');
    if (reduced) { assert.ok(samples.some(s => s === total) && samples.indexOf(total) <= 23, 'reduced motion renders at once'); return; }
    const first = samples.indexOf(1); assert.ok(first >= 0 && first < 4, 'first char shows promptly');
    const t1 = samples.findIndex((s, i) => i > first && s > 1);
    // after the big chunk lands it must take several frames, not one dump
    const doneAt = samples.indexOf(total);
    assert.ok(doneAt - t1 >= 4, `gradual reveal (${t1}→${doneAt})`);
    assert.ok(doneAt - t1 <= 34, 'catches up quickly on long replies');
    const maxStep = Math.max(...samples.slice(1).map((s, i) => s - samples[i]));
    assert.ok(maxStep < total * 0.5, `no full dump (max step ${maxStep}/${total})`);
  } finally { await browser.close(); }
}
(async()=>{await run(false);await run(true);console.log('PASS dashboard typewriter: indicator, steady reveal, catch-up, reduced motion');})().catch(e=>{console.error(e);process.exitCode=1});
