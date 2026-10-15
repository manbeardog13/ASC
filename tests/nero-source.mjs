import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the agent streams on the free tier and still answers old clients in JSON', () => {
  const fn = read('supabase/functions/asc-agent/index.ts');
  assert.match(fn, /streamGenerateContent\?alt=sse/);
  assert.match(fn, /generateContent/);
  assert.match(fn, /thoughtSignature/);
  assert.match(fn, /getUser\(/);
  assert.match(fn, /text\/event-stream/);
  assert.match(fn, /nero-attachments/);
  assert.match(fn, /BLOCKED_ROLES/);
});

test('the relay binds loopback, checks the admin, and keeps the webhook local', () => {
  const server = read('tools/builder-relay/server.ts');
  const readme = read('tools/builder-relay/README.md');
  assert.match(server, /127\.0\.0\.1/);
  assert.doesNotMatch(server, /0\.0\.0\.0/);
  assert.doesNotMatch(server, /funnel/i);
  assert.match(server, /jwks\.json/);
  assert.match(server, /\/auth\/v1\/user/);
  assert.match(server, /admin/);
  assert.match(server, /manager/);
  assert.match(readme, /tailscale serve/);
  assert.match(readme, /do not run `tailscale funnel`/i);
  assert.match(readme, /builder_relay_log/);
});

test('chat history is owner-scoped and the composer queues without tokens', () => {
  const sql = read('supabase/migrations/20261015050000_nero_chats.sql');
  const composer = read('app/composer.js');
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.match(sql, /nero-attachments/);
  assert.match(sql, /role in \('user', 'assistant'\)/);
  assert.doesNotMatch(sql, /access_token|builder_relay/);
  assert.match(composer, /getElementById\('agentCard'\)/);
  assert.match(composer, /Pitaj Nero/);
  assert.match(composer, /pointerdown/);
  assert.match(composer, /is-recording/);
  assert.match(composer, /queued, sends when Tailscale reconnects/);
  assert.match(composer, /Connect to Tailscale to reach Toni & Nero/);
  assert.match(composer, /prefers-reduced-motion|is-stream/);
  assert.ok(composer.indexOf('function startVoice') < composer.indexOf('recognition.start()'));
  assert.match(read('app/composer.css'), /backdrop-filter:blur\(22px\) saturate\(180%\)/);
  assert.match(read('app/composer.css'), /prefers-reduced-motion:reduce/);
  assert.match(read('app/agent-config.js'), /BUILDER_RELAY_URL = ""/);
});
