import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
function worker() {
  const listeners = {}, deleted = [], pending = [];
  const scope = 'https://example.test/ASC/';
  const context = {
    self: {
      location: { origin: 'https://example.test' }, registration: { scope },
      clients: { claim: async () => {} }, skipWaiting: async () => {},
      addEventListener: (name, fn) => { listeners[name] = fn; }
    },
    caches: {
      keys: async () => ['asc-tirehotel-v1', 'asc-tirehotel-v106-composer-controls', 'asc-tirehotel-v107-platform-review', 'another-pwa-v3'],
      delete: async key => { deleted.push(key); return true; }
    }, URL, Request, Response, Promise
  };
  vm.runInNewContext(source, context);
  return { listeners, deleted, pending };
}
test('ASC activation retires only its own obsolete caches', async () => {
  const w = worker();
  w.listeners.activate({ waitUntil: p => w.pending.push(p) });
  await Promise.all(w.pending);
  assert.deepEqual(w.deleted, ['asc-tirehotel-v1', 'asc-tirehotel-v106-composer-controls']);
});
test('service worker never caches Supabase API or write requests', () => {
  const w = worker();
  let intercepted = false;
  for (const request of [
    new Request('https://example.supabase.co/rest/v1/storage_sets'),
    new Request('https://example.test/ASC/', { method: 'POST' })
  ]) w.listeners.fetch({ request, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
