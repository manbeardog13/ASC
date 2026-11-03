import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolveBaseUrl, FALLBACK_BASE_URL, config } from '../js/config.js';

test('APP_BASE_URL follows the host the app was served from', () => {
  assert.equal(resolveBaseUrl('https://asc-tire-hotel.netlify.app/js/config.js'), 'https://asc-tire-hotel.netlify.app/');
  assert.equal(resolveBaseUrl('https://manbeardog13.github.io/ASC/js/config.js'), 'https://manbeardog13.github.io/ASC/');
  assert.equal(resolveBaseUrl('https://6ad25fdf5e37d5448699103e--asc-tire-hotel.netlify.app/js/config.js?v=2'), 'https://6ad25fdf5e37d5448699103e--asc-tire-hotel.netlify.app/');
  assert.equal(resolveBaseUrl('https://app.nerosummit.com/ASC/js/config.js?v=2'), 'https://app.nerosummit.com/ASC/');
  assert.equal(resolveBaseUrl('http://localhost:8765/js/config.js'), 'http://localhost:8765/');
});

test('falls back to GitHub Pages when the origin cannot be resolved', () => {
  assert.equal(resolveBaseUrl('file:///C:/ASC/js/config.js'), FALLBACK_BASE_URL);
  assert.equal(resolveBaseUrl('not a url'), FALLBACK_BASE_URL);
  assert.equal(resolveBaseUrl(undefined), FALLBACK_BASE_URL);
  // Under node the module is a file: URL → fallback.
  assert.equal(config.APP_BASE_URL, FALLBACK_BASE_URL);
  assert.ok(config.APP_BASE_URL.endsWith('/'));
});

test('root handles existing auth links in the same ASC mount and preserves old printed labels', () => {
  const root = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  function target(input, recent = false) {
    const location = new URL(input);
    let result;
    location.replace = path => { result = new URL(path, location).href; };
    const sessionStorage = { getItem: () => recent ? String(Date.now()) : null, setItem() {} };
    vm.runInNewContext(root, { URL, URLSearchParams, location, sessionStorage });
    return result;
  }
  const mounted = 'https://app.nerosummit.com/ASC/';
  for (const base of [mounted, 'https://example.test/']) {
    const fragment = '#access_token=synthetic&type=recovery';
    assert.equal(target(base + '?next=https://example.invalid/' + fragment, true), base + 'app/login.html' + fragment);
    assert.equal(target(base + '#error=expired'), base + 'app/login.html#error=expired');
    assert.equal(target(base + '#/set/ASC-SYN'), base + 'app/set-detail.html?code=ASC-SYN');
    assert.equal(target(base), base + 'app/dashboard.html');
  }
});
