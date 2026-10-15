const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const outDir = process.env.ASC_TEST_OUTPUT || '/opt/cursor/artifacts';

function typeOf(file) {
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.webmanifest')) return 'application/manifest+json';
  return 'application/octet-stream';
}

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '/app') { res.statusCode = 302; res.setHeader('Location', '/app/dashboard.html'); return res.end(); }
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404; return res.end('missing');
    }
    res.setHeader('Content-Type', typeOf(file));
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const report = { passed: false, checks: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.addInitScript(() => { sessionStorage.setItem('asc.splash.warm', '1'); });
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host === '127.0.0.1') return route.continue();
      return route.abort();
    });
    await page.goto(`http://127.0.0.1:${port}/app/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('agentCard')?.classList.contains('notch-cut'));
    const styles = await page.evaluate(() => {
      const card = document.getElementById('agentCard');
      const bubble = card.querySelector('.text-bubble');
      const notes = document.querySelector('.notes-card');
      const cs = getComputedStyle(card);
      const bs = getComputedStyle(bubble);
      const ns = getComputedStyle(notes);
      return {
        radius: cs.borderRadius,
        notesRadius: ns.borderRadius,
        borderTop: cs.borderTopWidth,
        borderColor: cs.borderTopColor,
        shadow: cs.boxShadow,
        notesShadow: ns.boxShadow,
        background: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        filter: cs.backdropFilter || cs.webkitBackdropFilter,
        mask: (cs.maskImage || cs.webkitMaskImage || '').slice(0, 80),
        bubbleBg: bs.backgroundColor,
        bubbleShadow: bs.boxShadow,
        bubbleBorder: bs.borderTopWidth,
        after: getComputedStyle(card, '::after').content,
        ink: getComputedStyle(card.querySelector('.agent-hook')).color,
      };
    });
    assert.equal(styles.borderTop, '0px', 'agent card must not wear a sticking border');
    assert.equal(styles.backgroundImage, 'none', 'agent card must not paint an opaque gradient');
    assert.equal(styles.after, 'none', 'star-field overlay must be gone');
    assert.match(styles.filter, /blur\(30px\)/, 'agent card uses the shell glass blur');
    assert.equal(styles.radius, '22px');
    assert.equal(styles.shadow, styles.notesShadow, 'agent card uses the same shadow as the notes card');
    assert.equal(styles.bubbleBorder, '1px');
    assert.doesNotMatch(styles.bubbleShadow, /inset/, 'the field must not use a foggy inset ring');
    assert.notEqual(styles.mask, 'none');
    report.checks.push('glass edge matches card shadow, no stroke, shell blur, notch mask');

    await page.locator('#agentCard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(outDir, 'composer-glass-light.png') });
    await page.locator('#agentCard').screenshot({ path: path.join(outDir, 'composer-card-light.png') });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.locator('#agentCard').screenshot({ path: path.join(outDir, 'composer-card-dark.png') });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));

    const send = page.locator('#agentCard .tb-send');
    await send.waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#agentCard .tb-send').disabled, null, { timeout: 8000 });
    await page.locator('#tbInput').fill('pomoć');
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    });
    await send.click();
    await page.waitForSelector('#asc-agent .asc-chat-bubble.is-local');
    const reply = await page.locator('#asc-agent .asc-chat-bubble.is-local p').first().innerText();
    assert.match(reply, /bez vanjskog AI/);
    assert.equal(await page.locator('#tbInput').inputValue(), '');
    report.checks.push('visible pagehide does not drop the next question');

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    });
    const blocked = await page.evaluate(() => window.ASCChat.open('još jedno', true));
    assert.equal(blocked, false);
    await page.locator('#tbInput').fill('još jedno');
    await send.click();
    assert.equal(await page.locator('#tbInput').inputValue(), 'još jedno');
    report.checks.push('a hidden page does not swallow the typed question');

    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.screenshot({ path: path.join(outDir, 'composer-glass-mobile.png') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(overflow, false);
    report.checks.push('mobile composer does not overflow');
    report.passed = true;
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
