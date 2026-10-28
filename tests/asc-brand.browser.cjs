/* Synthetic entry fixture: no production auth, customer data or network writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor, repo } = require('./fixtures/platform-harness.cjs');

const fixture = `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#edf0f5">
<script src="/app/theme-boot.js"></script><script src="/app/asc-brand.js"></script>
<link rel="stylesheet" href="/app/asc-brand.css">
<style>body{margin:0;padding:36px;font-family:Arial,sans-serif;background:#edf0f5;color:#16191e;min-height:90vh}html.dark body{background:#0a0c11;color:#e7e9ee}.logo{height:34px;width:auto}.fixture-work{margin-top:60px}</style>
</head><body><header><img class="logo" src="/app/assets/logo.png" alt="ASC"></header>
<main class="fixture-work"><h1>Hotel za gume</h1><button id="work">Otvori skladište</button></main>
<div id="splash" aria-hidden="true"><div class="sp-core"><img class="sp-mark" src="/app/assets/logo.png" width="488" height="92" alt=""></div></div>
</body></html>`;

async function contextFor(browser, { theme, blockedStorage = false, reducedMotion = 'no-preference', width = 1280, height = 800, warm = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, colorScheme: 'light', serviceWorkers: 'block' });
  await context.addInitScript(({ theme, blockedStorage, warm }) => {
    if (theme) localStorage.setItem('asc.theme', theme);
    if (warm) sessionStorage.setItem('asc.splash.warm', '1');
    if (blockedStorage) Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
  }, { theme, blockedStorage, warm });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://asc.test') return route.abort();
    if (/\.html$/.test(url.pathname)) return route.fulfill({ contentType: 'text/html', body: fixture });
    const file = path.join(repo, url.pathname);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/plain';
    return route.fulfill({ contentType, body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, errors };
}

async function themes(browser) {
  for (const options of [{}, { theme: 'light' }, { theme: 'dark' }, { blockedStorage: true }]) {
    const h = await contextFor(browser, { ...options, warm: true });
    try {
      await h.page.goto('http://asc.test/app/dashboard.html');
      const initial = options.theme !== 'light';
      assert.equal(await h.page.evaluate(() => document.documentElement.classList.contains('dark')), initial, 'Dark is the default, including a light OS; an explicit light choice wins');
      await h.page.evaluate(() => ASCTheme.toggle());
      assert.equal(await h.page.evaluate(() => document.documentElement.classList.contains('dark')), !initial, 'Theme toggle remains usable when storage is denied');
      await h.page.evaluate(() => ASCTheme.toggle());
      assert.equal(await h.page.evaluate(() => document.documentElement.classList.contains('dark')), initial);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  }
  console.log('PASS dark default, explicit saved choices, blocked-storage theme toggle');
}

async function entry(browser) {
  const h = await contextFor(browser);
  try {
    await h.page.goto('http://asc.test/app/dashboard.html');
    assert.equal(await h.page.evaluate(() => ASCSplash.mode), 'cold');
    assert.equal(await h.page.locator('#splash').isVisible(), true);
    await h.page.evaluate(() => ASCSplash.done());
    await h.page.waitForTimeout(1500);
    assert.equal(await h.page.locator('#splash').isVisible(), true, 'The full final second of the slow approach is retained on a fast auth response');
    const frame = await h.page.locator('.sp-core').evaluate(el => {
      const c = getComputedStyle(el);
      return { duration: c.animationDuration, easing: c.animationTimingFunction, transform: c.transform };
    });
    assert.match(frame.duration, /1s/);
    assert.match(frame.easing, /cubic-bezier\(0\.08, 0\.8, 0\.16, 1\)/);
    const output = path.join(repo, 'out/brand-tests');
    fs.mkdirSync(output, { recursive: true });
    await h.page.screenshot({ path: path.join(output, 'asc-entry-desktop.png') });
    await h.page.waitForFunction(() => document.querySelector('#splash').hidden);
    assert.equal(await h.page.evaluate(() => sessionStorage.getItem('asc.splash.warm')), '1');
    assert.equal(await h.page.locator('img.logo').count(), 1, 'The original clickable logo element is retained');
    assert.equal(await h.page.locator('img.logo').getAttribute('src'), '/app/assets/logo.png', 'The actual ASC silhouette remains the source');
    await h.page.goto('http://asc.test/app/dashboard.html');
    assert.equal(await h.page.evaluate(() => ASCSplash.mode), null, 'Warm navigation does not replay the entry');
    assert.equal(await h.page.locator('#splash').isVisible(), false);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
  console.log('PASS cold cinematic timing, original logo, warm navigation');
}

async function lifecycle(browser) {
  const h = await contextFor(browser);
  try {
    await h.page.clock.install();
    await h.page.goto('http://asc.test/app/dashboard.html');
    await h.page.evaluate(() => { document.documentElement.style.visibility = 'hidden'; });
    await h.page.clock.runFor(6001);
    assert.equal(await h.page.evaluate(() => document.querySelector('#splash').hidden), true, 'A missing auth callback cannot leave a permanent overlay');
    assert.equal(await h.page.evaluate(() => document.documentElement.style.visibility), 'hidden', 'Fail-open branding must never reveal an unauthenticated application');
    await h.page.evaluate(() => { window.__handoffs = 0; ASCSplash.bloom(() => { window.__handoffs++; }); ASCSplash.abort(); });
    await h.page.clock.runFor(200);
    assert.equal(await h.page.evaluate(() => window.__handoffs), 1, 'Skipping an intro cannot swallow an authentication navigation');
    await h.page.evaluate(() => { ASCSplash.bloom(); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    assert.equal(await h.page.evaluate(() => document.querySelector('#splash').hidden), true, 'Back-forward cache restores an interactive page');
    assert.equal(await h.page.evaluate(() => document.documentElement.classList.contains('splashing')), false);
    assert.deepEqual(h.errors, []);
  } finally { await h.context.close(); }
  console.log('PASS bounded watchdog, auth visibility preservation, skip-safe redirect, back-forward cache');
}

async function accessibility(browser) {
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const h = await contextFor(browser, { reducedMotion, width: 390, height: 844 });
    try {
      await h.page.goto('http://asc.test/app/login.html');
      const skip = h.page.getByRole('button', { name: 'Preskoči uvod' });
      const box = await skip.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= 390, 'Skip is a reachable touch target');
      if (reducedMotion === 'reduce') {
        assert.equal(await h.page.locator('.sp-core').evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.equal(await h.page.locator('.asc-brand-frame--entry').evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
        await h.page.evaluate(() => ASCSplash.done());
      } else {
        await h.page.waitForTimeout(1400);
        await h.page.screenshot({ path: path.join(repo, 'out/brand-tests/asc-entry-phone.png') });
        await skip.click();
        assert.equal(await h.page.locator('#splash').isVisible(), false, 'Touch/click skip dismisses immediately');
        await h.page.evaluate(() => ASCSplash.bloom());
        await h.page.keyboard.press('Escape');
      }
      await h.page.waitForFunction(() => document.querySelector('#splash').hidden);
      assert.equal(await h.page.locator('#work').isVisible(), true);
      assert.deepEqual(h.errors, []);
    } finally { await h.context.close(); }
  }
  console.log('PASS reduced-motion static treatment, mobile touch target, keyboard skip');
}

async function actualEntryPages(browser) {
  for (const signedOut of [false, true]) {
    const h = await pageFor(browser, { signedOut, theme: 'dark', width: 1280, height: 800 });
    try {
      await h.page.goto('http://asc.test/app/' + (signedOut ? 'login' : 'dashboard') + '.html');
      await h.page.waitForFunction(() => document.documentElement.style.visibility === '');
      const selector = signedOut ? '.auth-logo' : '.logo';
      assert.equal(await h.page.locator('.asc-brand-frame img' + selector).count(), 1, 'Actual entry pages apply the material to their original logo');
      assert.equal(await h.page.locator('#splash').isVisible(), false, 'Warm auth routes stay usable');
      assert.deepEqual(h.errors, []);
      if (!signedOut) await h.page.screenshot({ path: path.join(repo, 'out/brand-tests/asc-brand-integrated-dashboard.png') });
    } finally { await h.context.close(); }
  }
  console.log('PASS actual login and dashboard integration with synthetic authentication');
}

(async () => {
  const browser = await start();
  try { await themes(browser); await entry(browser); await lifecycle(browser); await accessibility(browser); await actualEntryPages(browser); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
