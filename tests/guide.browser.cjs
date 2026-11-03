// The guide must lead into the real operator screens. All backend traffic is synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./fixtures/platform-harness.cjs');

const screens = [
  ['obilazak','spatial-studio/index.html','.room-button','walk'],
  ['mjesto','locations.html','#loc-zone'],
  ['regal','spatial-studio/index.html','.room-button','plan'],
  ['prijem','checkin.html','#c_name'],
  ['smjestaj','place.html','#typed-code'],
  ['pronalazak','locate.html','#locate-query'],
];
const origin = 'http://asc.test/app/';
const screenshots = path.join(__dirname, '../out/guide-tests');

async function walkthrough(browser) {
  fs.mkdirSync(screenshots, {recursive: true});
  for (const width of [390, 1440]) {
    const { context, page, errors } = await pageFor(browser, { width, height: width === 390 ? 844 : 900 });
    try {
      await page.goto(origin + 'guide.html');
      assert.equal(await page.locator('.guide-step').count(), screens.length);
      for (const [index, [id, pagePath, selector, view]] of screens.entries()) {
        const following = screens[(index + 1) % screens.length][0];
        const selected = page.locator('.guide-step[aria-current=step]');
        assert.equal(await selected.getAttribute('href'), '#' + id);
        if (index === 0) await page.screenshot({path: path.join(screenshots, 'guide-' + width + '.png')});
        await page.locator('.guide-primary').click();
        await page.waitForURL(url => url.pathname === '/app/' + pagePath && url.searchParams.get('vodic') === id);
        if (view) assert.equal(new URL(page.url()).searchParams.get('view'), view);
        const coach = page.locator('.guide-coach');
        await coach.waitFor();
        const target = page.locator(selector);
        await target.waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow on ' + id);
        const control = coach.getByRole('button', {name:'Pokaži na zaslonu'});
        await control.evaluate((el, selector) => {
          el.addEventListener('click', () => {
            const field = document.querySelector(selector);
            window.__spotlight = field === document.activeElement && field.classList.contains('guide-focus');
          }, {once:true});
        }, selector);
        await control.click();
        assert.equal(await page.evaluate(() => window.__spotlight), true, 'Guide spotlight lands on interactive control: ' + id);
        assert.ok(await target.evaluate(el => el === document.activeElement), 'The destination retains focus: ' + id);
        const box = await target.boundingBox();
        assert.ok(box && box.y >= 0 && box.y + box.height <= (width === 390 ? 844 : 900), 'Target is visible: ' + id);
        assert.equal(await coach.getAttribute('open'), null);
        await coach.locator('summary').click();
        if (id === 'mjesto') await page.screenshot({path:path.join(screenshots, 'guide-control-' + width + '.png')});
        await coach.getByRole('link').click();
        await page.waitForURL(origin + 'guide.html#' + following);
      }
      assert.deepEqual(errors, []);
      console.log('PASS six guide screens, spotlight, next and return at width ' + width);
    } finally { await context.close(); }
  }
}
async function authentication(browser) {
  const { context, page, errors } = await pageFor(browser, {signedOut:true});
  try {
    for (const [id, pagePath, , view] of screens) {
      await page.goto(origin + 'guide.html#' + id);
      await page.locator('.guide-primary').click();
      if (view) {
        const login = page.getByRole('link', { name: 'Prijava' });
        await login.click();
      }
      await page.waitForURL(url => url.pathname.endsWith('/app/login.html'));
      await page.locator('#email').fill('guide@example.invalid');
      await page.locator('#password').fill('synthetic');
      await page.evaluate(() => { ASCSplash.handoff = url => { window.__guideReturn = url; }; });
      await page.locator('#submit').click();
      await page.waitForFunction(() => window.__guideReturn);
      const returned = new URL(await page.evaluate(() => window.__guideReturn), origin);
      assert.equal(returned.pathname, '/app/' + pagePath);
      assert.equal(returned.searchParams.get('vodic'), id, 'Keep guide after sign-in: ' + id);
      if (view) assert.equal(returned.searchParams.get('view'), view);
    }
    assert.deepEqual(errors, []);
    console.log('PASS all six guided destinations survive sign-in');
  } finally { await context.close(); }
}

async function guide(browser) { await walkthrough(browser); await authentication(browser); }
module.exports = guide;
if (require.main === module) (async () => {
  const browser = await start();
  try { await guide(browser); } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
