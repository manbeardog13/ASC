// Synthetic, network-isolated print evidence. No server, account or printer job.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const out = process.env.ASC_TEST_OUTPUT || path.join(root, 'out', 'assistant-tests', 'label-render');
fs.mkdirSync(out, { recursive: true });
const code = 'ASC-2099-0000';
const label = { who: 'SYNTHETIC TEST ONLY', vehicle: 'DEMO', plate: 'NOT A VEHICLE', season: 'winter', loc: 'TEST AREA' };
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic ASC print evidence</title>
<link rel="stylesheet" href="/app/tokens.css"><link rel="stylesheet" href="/app/app.css"><link rel="stylesheet" href="/app/flow.css"></head>
<body><main><h1>SYNTHETIC TEST ONLY</h1><p>Physical print UNVERIFIED</p><div id="host"></div><p id="done"></p></main>
<script src="/app/warehouse-preview/vendor/qrcode.js"></script><script src="/app/warehouse-preview/vendor/jsQR.js"></script><script src="/app/qr.js"></script>
<script>window.printCalls=0;window.print=()=>{window.printCalls++;if(window.printThrows)throw Error('synthetic print failure');};</script>
<script type="module">import {mountLabelPrint} from '/app/label-print.js';
window.mount=()=>mountLabelPrint(document.getElementById('host'),{code:${JSON.stringify(code)},label:${JSON.stringify(label)},onComplete:r=>document.getElementById('done').textContent=r});window.ready=true;</script></body></html>`;

async function setup(browser, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const requests = [];
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (url.origin !== 'https://asc.invalid') return route.abort();
    if (url.pathname === '/app/test-print.html') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/bridge/printers') return route.fulfill({ json: { printers: [{ id: 'synthetic', name: 'Synthetic printer', online: true }] } });
    if (url.pathname === '/bridge/print') return route.fulfill({ status: options.bridgeOk ? 200 : 422, json: { ok: !!options.bridgeOk } });
    // Only allow static print sources and the two already-vendored QR libraries.
    const allowed = ['/app/tokens.css', '/app/app.css', '/app/flow.css', '/app/qr.js', '/app/label-print.js', '/js/i18n.js',
      '/app/warehouse-preview/vendor/qrcode.js', '/app/warehouse-preview/vendor/jsQR.js'];
    if (!allowed.includes(url.pathname)) return route.abort();
    return route.fulfill({ path: path.join(root, url.pathname), contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' });
  });
  await p.addInitScript(opts => {
    localStorage.setItem('asc.lang', opts.lang || 'en');
    if (opts.bridge) window.ASC_PRINT_BRIDGE = '/bridge';
    window.printThrows = !!opts.printThrows;
  }, options);
  await p.goto('https://asc.invalid/app/test-print.html');
  await p.waitForFunction(() => window.ready);
  await p.evaluate(() => window.mount());
  await p.waitForFunction(() => ![undefined, 'searching'].includes(document.querySelector('.lp')?.dataset.state));
  return { p, ctx, requests, state: () => p.locator('.lp').getAttribute('data-state') };
}

async function closeSheet(p) {
  if (await p.locator('.sm-back').count()) await p.locator('.sm-back').click();
  await p.waitForFunction(() => !document.querySelector('.sticker-modal'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const results = [];
  async function scenario(name, options, fn) {
    const r = await setup(browser, options);
    try { await fn(r); results.push({ name, status: 'passed' }); }
    catch (error) { results.push({ name, status: 'failed', error: error.message }); }
    finally { await r.ctx.close(); }
  }
  try {
    await scenario('real renderer -> QR decode -> printable PDF', {}, async ({ p }) => {
      assert.equal(await p.evaluate(({ code, label }) => ASCQR.printSticker(code, label), { code, label }), true);
      assert.equal(await p.locator('.sm-code').textContent(), code);
      assert.equal(await p.locator('.sm-who').textContent(), label.who);
      const decoded = await p.evaluate(async () => {
        const svg = document.querySelector('.sm-qr svg');
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
        await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 600;
        const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 600, 600); context.drawImage(img, 0, 0, 600, 600);
        const pixels = context.getImageData(0, 0, 600, 600);
        const result = jsQR(pixels.data, 600, 600);
        return { payload: result?.data, code: ASCQR.extractCode(result?.data), expected: ASCQR.deepLink('ASC-2099-0000') };
      });
      assert.equal(decoded.payload, decoded.expected); assert.equal(decoded.code, code);
      await p.screenshot({ path: path.join(out, 'synthetic-label-mobile.png') });
      await p.emulateMedia({ media: 'print' });
      assert.equal(await p.locator('.sm-chrome').isVisible(), false);
      assert.equal(await p.locator('main').isVisible(), false);
      await p.locator('.sm-label').screenshot({ path: path.join(out, 'synthetic-label-print.png') });
      const pdf = await p.pdf({ path: path.join(out, 'synthetic-label.pdf'), format: 'A4', printBackground: true,
        displayHeaderFooter: false, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
      assert.equal(await p.evaluate(() => window.printCalls), 0);
      fs.writeFileSync(path.join(out, 'qr-roundtrip.json'), JSON.stringify({ provenance: 'synthetic browser test', ...decoded, physicalPrint: 'UNVERIFIED', paperProfile: 'A4, 10 mm margins; actual label stock UNKNOWN' }, null, 2) + '\n');
    });
    await scenario('missing QR encoder cannot open the print gate', {}, async ({ p, state }) => {
      await p.evaluate(() => { window.qrcode = undefined; });
      await p.locator('.lp-row .btn-primary').click();
      assert.equal(await state(), 'failed');
      assert.equal(await p.evaluate(() => window.printCalls), 0);
      assert.equal(await p.locator('.sm-label').count(), 0);
      assert.equal(await p.locator('#done').textContent(), '');
    });
    await scenario('print exception stays failed', { printThrows: true }, async ({ p, state }) => {
      await p.locator('.lp-row .btn-primary').click();
      await closeSheet(p);
      assert.equal(await state(), 'failed');
      assert.equal(await p.locator('#done').textContent(), '');
    });
    await scenario('missing afterprint stays unconfirmed', {}, async ({ p, state }) => {
      await p.clock.install();
      await p.locator('.lp-row .btn-primary').click();
      await p.clock.fastForward(60001);
      assert.equal(await state(), 'failed');
      assert.equal(await p.locator('#done').textContent(), '');
    });
    await scenario('retry after failed bridge print does not complete', { bridge: true }, async ({ p, state }) => {
      await p.locator('.lp-row .btn-primary').click();
      await p.waitForFunction(() => document.querySelector('.lp').dataset.state === 'failed');
      await p.locator('.lp-actions .btn').click();
      await p.waitForFunction(() => document.querySelector('.lp').dataset.state === 'failed');
      assert.equal(await p.locator('#done').textContent(), '');
      assert.equal(await state(), 'failed');
    });
    for (const lang of ['en', 'hr']) {
      await scenario(`system confirmation remains explicit (${lang})`, { lang }, async ({ p, state }) => {
        await p.locator('.lp-row .btn-primary').click();
        assert.equal(await state(), 'printing');
        await p.evaluate(() => dispatchEvent(new Event('afterprint')));
        await closeSheet(p);
        assert.equal(await state(), 'confirm');
        assert.equal(await p.locator('.lp-status').textContent(), lang === 'hr' ? 'Je li se naljepnica ispisala?' : 'Did the label print?');
        await p.screenshot({ path: path.join(out, `synthetic-confirm-${lang}.png`) });
        assert.equal(await p.locator('#done').textContent(), '');
        await p.locator('.lp-actions .ghost').click();
        assert.equal(await state(), 'failed');
        await p.locator('.lp-actions .btn').click();
        await p.evaluate(() => dispatchEvent(new Event('afterprint')));
        await closeSheet(p);
        assert.equal(await p.locator('#done').textContent(), '');
        await p.locator('.lp-actions .btn-primary').click();
        assert.equal(await p.locator('#done').textContent(), 'printed');
      });
    }
    await scenario('test print requires confirmation and never completes check-in', {}, async ({ p, state }) => {
      await p.locator('.lp-row .ghost').click();
      await p.evaluate(() => dispatchEvent(new Event('afterprint')));
      await closeSheet(p);
      assert.equal(await state(), 'confirm');
      await p.locator('.lp-actions .ghost').click();
      await p.locator('.lp-actions .btn').click();
      await p.evaluate(() => dispatchEvent(new Event('afterprint')));
      await closeSheet(p);
      await p.locator('.lp-actions .btn-primary').click();
      assert.equal(await state(), 'testOk');
      assert.equal(await p.locator('#done').textContent(), '');
    });
    fs.writeFileSync(path.join(out, 'scenarios.json'), JSON.stringify({ results, physicalPrint: 'UNVERIFIED', liveBridge: 'UNVERIFIED' }, null, 2) + '\n');
    for (const result of results) console.log(`${result.status}: ${result.name}${result.error ? ': ' + result.error : ''}`);
    if (results.some(result => result.status === 'failed')) process.exitCode = 1;
    else console.log(`label-render: ${results.length} scenarios passed; physical print UNVERIFIED`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
