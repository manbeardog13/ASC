import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const queue = require('../app/builder-queue.js');

test('queue keeps text, page, time, and attachment refs in order and drops duplicate ids', () => {
  const first = queue.sanitize({
    id: 'aaaaaaaa',
    text: 'prva',
    page: '/app/workshop.html',
    ts: 20,
    attachments: [{ path: '11111111-1111-1111-1111-111111111111/a.jpg', mime: 'image/jpeg', name: 'a.jpg' }],
    attempts: 0
  });
  const second = queue.sanitize({ id: 'bbbbbbbb', text: 'druga', page: '/app/locate.html', ts: 10 });
  const again = queue.sanitize({ id: 'aaaaaaaa', text: 'kasnije', page: '/app/workshop.html', ts: 30 });
  const ordered = queue.orderDedupe([first, second, again]);
  assert.deepEqual(ordered.map((item) => item.id), ['bbbbbbbb', 'aaaaaaaa']);
  assert.equal(ordered[1].text, 'prva');
  assert.equal(ordered[1].attachments[0].path, first.attachments[0].path);
  assert.equal(Object.keys(ordered[1]).join(','), 'id,text,page,ts,attachments,attempts');
});

test('queue refuses tokens and credentials', () => {
  for (const extra of [
    { access_token: 'secret' },
    { authorization: 'Bearer x' },
    { password: 'nope' },
    { attachments: [{ path: 'a', token: 'x' }] }
  ]) {
    assert.throws(() => queue.sanitize({ id: 'cccccccc', text: 'hi', page: '/', ts: 1, ...extra }));
  }
});

test('backoff waits 2s, 4s, 8s, 16s, then 60s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((n) => queue.backoffMs(n)), [2000, 4000, 8000, 16000, 60000, 60000]);
});
