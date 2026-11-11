const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<main id="mount"></main>');
    }
    const file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404; return res.end('');
    }
    res.setHeader('Content-Type', 'text/javascript');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    const heard = await page.evaluate(async () => {
      window.SpeechRecognition = class {
        constructor() { this.starts = 0; }
        start() {
          this.starts += 1;
          window.lastRec = this;
          if (this.starts === 1) {
            queueMicrotask(() => {
              this.onerror?.({ error: 'network' });
              this.onend?.();
            });
          }
        }
        stop() { this.onend?.(); }
        abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
      };
      const { listenHold } = await import('/js/voice.js');
      const hold = listenHold();
      const started = await new Promise((resolve) => {
        const tick = () => window.lastRec?.starts >= 2 ? resolve(window.lastRec.starts) : setTimeout(tick, 20);
        tick();
      });
      const row = [{ transcript: 'zimske' }];
      row.isFinal = true;
      window.lastRec.onresult({ resultIndex: 0, results: [row] });
      hold.release();
      return { started, text: await hold.done };
    });
    assert.ok(heard.started >= 2, 'a dropped speech socket must start again while held');
    assert.equal(heard.text, 'zimske');

    const discarded = await page.evaluate(async () => {
      const { listenHold, abortListening } = await import('/js/voice.js');
      const hold = listenHold();
      const row = [{ transcript: 'odbaci' }];
      row.isFinal = true;
      window.lastRec.onresult({ resultIndex: 0, results: [row] });
      abortListening();
      return hold.done;
    });
    assert.equal(discarded, '');
    console.log(JSON.stringify({ passed: true, checks: ['network drop restarts the hold', 'abort discards the transcript'] }));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
