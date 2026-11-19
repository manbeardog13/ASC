import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  AUDIENCE, BRIDGE_KEY, COMPANY_SESSION_KEY, CONSUMED_KEY, HANDOFF_KEY,
  JWKS_URL, NERO_ISSUER, REASON, TENANT_SESSION_KEY,
  establishHandoff, clearHandoff, hasBridgedSession, bindSignOut, splitJwt,
} from '../js/neroSessionHandoff.js';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-asc-handoff';
jwk.use = 'sig';
jwk.alg = 'ES256';
const JWKS = [jwk];

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    _data: data,
  };
}

function mint(claims = {}, headerExtra = {}) {
  const now = Math.floor((claims.now ?? Date.now()) / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: jwk.kid, ...headerExtra })).toString('base64url');
  const body = {
    iss: NERO_ISSUER,
    aud: AUDIENCE,
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
    iat: now,
    exp: now + 300,
    jti: 'jti-valid',
    ...claims,
  };
  delete body.now;
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = sign('SHA256', Buffer.from(`${header}.${payload}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${sig.toString('base64url')}`;
}

function unreachableFetch() {
  return async () => { throw new Error('network down'); };
}

function jwksFetch(keys = JWKS, { status = 200, fail = false } = {}) {
  return async (url) => {
    assert.equal(url, JWKS_URL);
    if (fail) throw new Error('network down');
    return {
      ok: status === 200,
      status,
      json: async () => ({ keys }),
    };
  };
}

test('valid single-use handoff token establishes a bridged session and cannot be replayed', async () => {
  const storage = memoryStorage();
  const token = mint({ jti: 'jti-once' });
  storage.setItem(HANDOFF_KEY, JSON.stringify({ v: 1, token }));
  const first = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(first.reason, null);
  assert.equal(first.session.sub, '11111111-1111-4111-8111-111111111111');
  assert.equal(first.session.source, 'handoff');
  assert.equal(hasBridgedSession(storage), true);
  assert.equal(storage.getItem(HANDOFF_KEY), null);
  // Logout must not let the same jti mint a new session in this tab.
  clearHandoff(storage);
  storage.setItem(HANDOFF_KEY, token);
  const second = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(second.session, null);
  assert.equal(second.reason, REASON.replay);
});

test('expired handoff token fails closed and does not write a bridge', async () => {
  const storage = memoryStorage();
  const now = Date.now();
  storage.setItem(HANDOFF_KEY, mint({ jti: 'jti-exp', exp: Math.floor(now / 1000) - 10, now }));
  const result = await establishHandoff({ storage, jwks: JWKS, now });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.expired);
  assert.equal(hasBridgedSession(storage, now), false);
  assert.equal(storage.getItem(HANDOFF_KEY), null);
});

test('wrong audience fails closed', async () => {
  const storage = memoryStorage();
  storage.setItem(HANDOFF_KEY, mint({ jti: 'jti-aud', aud: 'authenticated' }));
  const result = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.audience);
  assert.equal(hasBridgedSession(storage), false);
});

test('tampered payload fails closed', async () => {
  const storage = memoryStorage();
  const token = mint({ jti: 'jti-tamp' });
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  payload.sub = '22222222-2222-4222-8222-222222222222';
  const tampered = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
  assert.ok(splitJwt(tampered));
  storage.setItem(HANDOFF_KEY, tampered);
  const result = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.tampered);
  assert.equal(hasBridgedSession(storage), false);
});

test('replay of a single-use token fails closed', async () => {
  const storage = memoryStorage();
  const token = mint({ jti: 'jti-replay' });
  storage.setItem(HANDOFF_KEY, token);
  const first = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.ok(first.session);
  clearHandoff(storage);
  // clearHandoff also drops the consumed list; seed a consumed jti as after first use
  // then confirm a later establish on a fresh bridge still rejects the same jti
  // when the consumed list is still present (no clear between uses).
  const storage2 = memoryStorage();
  storage2.setItem(HANDOFF_KEY, token);
  const ok = await establishHandoff({ storage: storage2, jwks: JWKS, now: Date.now() });
  assert.ok(ok.session);
  clearHandoff(storage2);
  storage2.setItem(HANDOFF_KEY, token);
  const again = await establishHandoff({ storage: storage2, jwks: JWKS, now: Date.now() });
  assert.equal(again.session, null);
  assert.equal(again.reason, REASON.replay);
});

test('Nero unreachable fails closed and leaves a one-time token for retry', async () => {
  const storage = memoryStorage();
  const token = mint({ jti: 'jti-down' });
  storage.setItem(HANDOFF_KEY, token);
  const result = await establishHandoff({ storage, fetchImpl: unreachableFetch(), now: Date.now() });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.unreachable);
  assert.equal(storage.getItem(HANDOFF_KEY), token);
  assert.equal(hasBridgedSession(storage), false);
  const later = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.ok(later.session);
});

test('JWKS HTTP failure is treated as unreachable', async () => {
  const storage = memoryStorage();
  storage.setItem(HANDOFF_KEY, mint({ jti: 'jti-503' }));
  const result = await establishHandoff({ storage, fetchImpl: jwksFetch(JWKS, { status: 503 }), now: Date.now() });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.unreachable);
});

test('logout clears the bridged session and Nero tokens in this tab', async () => {
  const storage = memoryStorage();
  storage.setItem(HANDOFF_KEY, mint({ jti: 'jti-out' }));
  storage.setItem(COMPANY_SESSION_KEY, JSON.stringify({ version: 1, access_token: mint({ aud: 'authenticated', jti: 'company' }), expires: Date.now() + 60_000, user: '11111111-1111-4111-8111-111111111111' }));
  storage.setItem(TENANT_SESSION_KEY, JSON.stringify({ v: 1, access_token: 'x', expires: Date.now() + 60_000 }));
  const first = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.ok(first.session);
  const cleared = clearHandoff(storage);
  assert.equal(cleared.reason, REASON.logout);
  assert.equal(hasBridgedSession(storage), false);
  assert.equal(storage.getItem(BRIDGE_KEY), null);
  assert.equal(storage.getItem(HANDOFF_KEY), null);
  assert.equal(storage.getItem(COMPANY_SESSION_KEY), null);
  assert.equal(storage.getItem(TENANT_SESSION_KEY), null);
  assert.ok(storage.getItem(CONSUMED_KEY));
});

test('asc:sign-out clears the bridged session', async () => {
  const storage = memoryStorage();
  storage.setItem(HANDOFF_KEY, mint({ jti: 'jti-event' }));
  assert.ok((await establishHandoff({ storage, jwks: JWKS, now: Date.now() })).session);
  const listeners = new Map();
  const target = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  bindSignOut(target, storage);
  listeners.get('asc:sign-out')();
  assert.equal(hasBridgedSession(storage), false);
  assert.equal(storage.getItem(COMPANY_SESSION_KEY), null);
});

test('existing same-origin Nero company session is accepted after JWKS verify', async () => {
  const storage = memoryStorage();
  const token = mint({ aud: 'authenticated', jti: 'company-1' });
  storage.setItem(COMPANY_SESSION_KEY, JSON.stringify({
    version: 1,
    access_token: token,
    expires: Date.now() + 60_000,
    user: '11111111-1111-4111-8111-111111111111',
  }));
  const result = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(result.reason, null);
  assert.equal(result.session.source, 'company-session');
  assert.equal(result.session.sub, '11111111-1111-4111-8111-111111111111');
  // Company session is left in place until logout (Summit still uses it).
  assert.ok(storage.getItem(COMPANY_SESSION_KEY));
});

test('existing tenant session (PR 48 key) is accepted after JWKS verify', async () => {
  const storage = memoryStorage();
  const token = mint({ aud: 'authenticated', jti: 'tenant-1' });
  storage.setItem(TENANT_SESSION_KEY, JSON.stringify({ v: 1, access_token: token, expires: Date.now() + 60_000 }));
  const result = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(result.reason, null);
  assert.equal(result.session.source, 'tenant-session');
});

test('expired company session fails closed without a network call', async () => {
  const storage = memoryStorage();
  let called = 0;
  storage.setItem(COMPANY_SESSION_KEY, JSON.stringify({
    version: 1,
    access_token: mint({ aud: 'authenticated', jti: 'old' }),
    expires: Date.now() - 1000,
    user: '11111111-1111-4111-8111-111111111111',
  }));
  const result = await establishHandoff({
    storage,
    fetchImpl: async () => { called++; throw new Error('should not fetch'); },
    now: Date.now(),
  });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.expired);
  assert.equal(called, 0);
});

test('missing token fails closed', async () => {
  const result = await establishHandoff({ storage: memoryStorage(), jwks: JWKS, now: Date.now() });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.missing);
});

test('tokens in the URL are ignored', async () => {
  const storage = memoryStorage();
  const token = mint({ jti: 'jti-url' });
  const result = await establishHandoff({
    storage,
    jwks: JWKS,
    now: Date.now(),
    location: { search: `?token=${token}`, hash: `#access_token=${token}`, href: `https://example.test/app/?t=${token}` },
  });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.missing);
});

test('handoff with a foreign issuer fails as tampered', async () => {
  const storage = memoryStorage();
  storage.setItem(HANDOFF_KEY, mint({ jti: 'jti-iss', iss: 'https://evil.example/auth/v1' }));
  const result = await establishHandoff({ storage, jwks: JWKS, now: Date.now() });
  assert.equal(result.session, null);
  assert.equal(result.reason, REASON.tampered);
});
