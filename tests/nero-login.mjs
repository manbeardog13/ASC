import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loginDestination, neroLoginUrl, safeLoginReturn, NERO_APP_URL } from '../js/neroLogin.js';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('Nero sign-in is the app root and carries no return query', () => {
  const url = new URL(neroLoginUrl());
  assert.equal(NERO_APP_URL, 'https://app.nerosummit.com');
  assert.equal(url.origin, 'https://app.nerosummit.com');
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.equal(neroLoginUrl(), loginDestination({ session: null, returnPath: 'set-detail.html?code=ASC-1' }));
});

test('a session follows only a same-app return path', () => {
  const session = { user: { id: 'user-A' } };
  assert.equal(loginDestination({ session, returnPath: 'set-detail.html?code=ASC-2026-0003' }), 'set-detail.html?code=ASC-2026-0003');
  assert.equal(loginDestination({ session, returnPath: 'warehouse-preview/index.html' }), 'warehouse-preview/index.html');
  assert.equal(loginDestination({ session, returnPath: 'customers.html' }), 'customers.html');
  assert.equal(loginDestination({ session }), 'dashboard.html');
  assert.equal(loginDestination({ session, returnPath: 'login.html' }), 'dashboard.html');
  assert.equal(loginDestination({ session, returnPath: 'https://evil.example/phish' }), 'dashboard.html');
  assert.equal(loginDestination({ session, returnPath: '//evil.example/phish' }), 'dashboard.html');
  assert.equal(safeLoginReturn('dashboard.html#fragment'), '');
});

test('the login page has no credential form and sends visitors to Nero', () => {
  const html = read('app/login.html');
  assert.doesNotMatch(html, /type="password"|signInWithPassword|signInWithOAuth|signIn\(|id="google"|id="form"/);
  assert.match(html, /loginDestination/);
  assert.match(html, /https:\/\/app\.nerosummit\.com/);
  assert.match(html, /Powered by <a href="https:\/\/nerosummit\.com">Nero Summit<\/a>/);
});

test('an authenticated session still opens the app; a signed-out deep link stores its return and goes to Nero', async () => {
  const source = read('app/app.js');
  const code = source.slice(source.indexOf('(() => {'), source.indexOf('\nconst root = document.documentElement;'));
  async function run({ pathname, search = '', session }) {
    const items = {};
    const targets = [];
    let reveals = 0;
    const style = {};
    const sandbox = {
      document: { documentElement: { style }, addEventListener() {}, dispatchEvent() {} },
      window: { ASCSplash: { done() { reveals++; }, bloom: (cb) => cb?.(), handoff: (url) => targets.push(url) } },
      sessionStorage: {
        setItem(key, value) { items[key] = value; },
        getItem(key) { return items[key] ?? null; },
        removeItem(key) { delete items[key]; },
      },
      location: { pathname, search, reload() {} },
      db: { getSession: async () => session, signOut: async () => {}, onAuthChange() {} },
      Promise,
      CustomEvent: class { constructor(type) { this.type = type; } },
      setTimeout: () => 0,
    };
    vm.runInNewContext(code.replace("import('../js/db.js')", 'Promise.resolve(db)'), sandbox);
    await tick();
    await tick();
    return { items, targets, reveals, style };
  }

  const signedIn = await run({ pathname: '/ASC/app/dashboard.html', session: { user: { id: 'user-A' } } });
  assert.equal(signedIn.style.visibility, '');
  assert.equal(signedIn.reveals, 1);
  assert.deepEqual(signedIn.targets, []);

  const deep = await run({ pathname: '/ASC/app/set-detail.html', search: '?code=ASC-2026-0003', session: null });
  assert.equal(deep.style.visibility, 'hidden');
  assert.equal(deep.items['asc.return'], 'set-detail.html?code=ASC-2026-0003');
  assert.deepEqual(deep.targets, [NERO_APP_URL]);
  assert.equal(deep.reveals, 0);
});
