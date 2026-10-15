import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as search from '../app/agent-search.js';

const source = await readFile(new URL('../app/agent-gemini.js', import.meta.url), 'utf8');
const final = text => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });
const call = (name, input = {}, id = 'tool-1', text) => ({
  content: [...(text ? [{ type: 'text', text }] : []), { type: 'tool_use', name, input, id, _sig: 'opaque-test-signature' }],
  stop_reason: 'tool_use'
});
const response = data => ({ ok: true, status: 200, json: async () => data });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 30 && !predicate(); i++) await tick(); assert.ok(predicate(), 'expected async checkpoint'); }

function client({ remoteAllowed = true, replies = [], fetch: fetchImpl, db = {}, auth = false, endpoint = 'https://project.example/functions/v1/asc-agent', storageFails = false } = {}) {
  const requests = [], events = [], timers = new Map(), stored = new Map(), imports = [];
  let timerId = 0, sessionReads = 0;
  const location = { pathname: '/ASC/app/warehouse-preview/index.html', search: '', href: 'https://host.example/ASC/app/warehouse-preview/index.html' };
  const document = { currentScript: { src: 'https://host.example/ASC/app/agent-gemini.js' },
    baseURI: location.href, querySelector: () => null };
  const sandbox = {
    URL, URLSearchParams, AbortController, TextDecoder, TextEncoder, location, document,
    sessionStorage: { setItem(key, value) { if (storageFails) throw Error('blocked'); stored.set(key, value); } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      requests.push({ url, ...options, payload: JSON.parse(options.body) });
      if (fetchImpl) return fetchImpl(url, options, requests.length);
      assert.ok(replies.length, 'unexpected provider request');
      return response(replies.shift());
    }
  };
  sandbox.window = { ASC_AGENT_REMOTE_ALLOWED: remoteAllowed, ASC_AGENT_URL: endpoint, ASC_AGENT_REQUIRE_AUTH: auth };
  const context = vm.createContext(sandbox);
  const dbExports = {
    getSession: async () => { sessionReads++; return { access_token: 'mock-session-token' }; },
    listStorageSets: async () => [], listCustomers: async () => [],
    countsByStatus: async () => ({ in_storage: 0, reserved: 0, checked_out: 0, missing: 0 }), ...db
  };
  new vm.Script(source, {
    filename: 'agent-gemini.js',
    importModuleDynamically: async specifier => {
      imports.push(specifier);
      const values = specifier.endsWith('/js/config.js') ? { config: { SUPABASE_URL: 'https://project.example' } }
        : specifier.endsWith('/js/db.js') ? dbExports
        : specifier.endsWith('/app/agent-search.js') ? search
        : assert.fail('unexpected import ' + specifier);
      const module = new vm.SyntheticModule(Object.keys(values), function () {
        Object.entries(values).forEach(([name, value]) => this.setExport(name, value));
      }, { context });
      await module.link(() => assert.fail('unexpected nested import'));
      await module.evaluate();
      return module;
    }
  }).runInContext(context);
  return {
    agent: sandbox.window.ASCAgent, window: sandbox.window, requests, events, timers, location, stored, imports,
    ask: (text = 'Pomozi', options) => sandbox.window.ASCAgent.ask(text, event => events.push(event), {remote:true,...options}),
    fire(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); } },
    get sessionReads() { return sessionReads; }
  };
}

test('only emits final text; trusted known tools and bounded context travel through existing protocol', async () => {
  let input, ctx;
  const c = client({ replies: [call('search_sets', { query: 'Đurić' }, 'a', 'Spremljeno unaprijed!'), final('Pronađena su dva kandidata.')] });
  assert.equal(await c.ask('Pronađi', {
    context: { selected: 'DEMO-1', extra: 'x'.repeat(4000) },
    tools: { search_sets: (args, context) => { input = args; ctx = context; return { result: 'Dva kandidata; traži odabir.' }; } }
  }), 'Pronađena su dva kandidata.');
  assert.equal(input.query, 'Đurić');
  assert.ok(ctx.signal instanceof AbortSignal);
  assert.equal(ctx.isActive(), true);
  assert.ok(ctx.context.length <= 2400);
  assert.deepEqual(c.events.filter(e => e.type === 'text').map(e => e.text), ['Pronađena su dva kandidata.']);
  assert.match(c.requests[0].payload.messages[0].content, /DEMO-1/);
  assert.match(c.requests[0].payload.messages[0].content, /samo priprema obrazac/);
  assert.equal(c.requests[1].payload.messages[1].content[1]._sig, 'opaque-test-signature');
  assert.equal(c.requests[1].payload.messages[2].content[0].tool_use_id, 'a');
});

test('cancel aborts fetch immediately and suppresses late calls, text, and history', async () => {
  const pending = deferred();
  const c = client({ fetch: (_url, _opts, n) => n === 1 ? pending.promise : response(final('Novi odgovor')) });
  const old = c.ask('Staro');
  await until(() => c.requests.length === 1);
  c.agent.cancel();
  const next = c.ask('Novo');
  await assert.rejects(old, { name: 'AbortError', code: 'cancelled' });
  assert.equal(c.requests[0].signal.aborted, true);
  assert.equal(await next, 'Novi odgovor');
  pending.resolve(response(call('create_tire_set', { customer_name: 'Late' })));
  await tick();
  assert.equal(c.requests.length, 2);
  assert.equal(c.stored.size, 0);
  assert.equal(c.requests[1].payload.messages.length, 1);
  assert.equal(c.events.filter(e => e.type === 'error').length, 0);
});

test('cancel during async tool stops remaining tools and guarded late effects', async () => {
  const pending = deferred();
  let entered = false, effects = 0;
  const data = call('search_sets');
  data.content.push({ type: 'tool_use', id: 'other', name: 'inventory_overview', input: {} });
  const c = client({ replies: [data] });
  const work = c.ask('Traži', { tools: {
    search_sets: async (_a, ctx) => { entered = true; await pending.promise; ctx.assertActive(); effects++; return { result: 'ok' }; },
    inventory_overview: () => { effects++; return { result: 'ok' }; }
  } });
  await until(() => entered);
  c.agent.cancel();
  await assert.rejects(work, { code: 'cancelled' });
  pending.resolve();
  await tick();
  assert.equal(effects, 0);
  assert.equal(c.requests.length, 1);
});

test('inactive surface ignores late response without executing tools', async () => {
  let visible = true, actions = 0;
  const pending = deferred(), c = client({ fetch: () => pending.promise });
  const work = c.ask('Traži', { isActive: () => visible, tools: { search_sets: () => { actions++; return { result: 'ok' }; } } });
  await until(() => c.requests.length === 1);
  visible = false;
  pending.resolve(response(call('search_sets')));
  await assert.rejects(work, { code: 'cancelled' });
  assert.equal(actions, 0);
  assert.equal(c.events.filter(e => e.type === 'error').length, 0);
});

test('single active turn rejects overlap and timeout never retries', async () => {
  const pending = deferred(), c = client({ fetch: () => pending.promise });
  const work = c.ask();
  await until(() => c.requests.length === 1);
  await assert.rejects(c.ask('drugi'), { code: 'busy' });
  c.fire(45000);
  await assert.rejects(work, { code: 'timeout' });
  assert.equal(c.requests.length, 1);
  assert.equal(c.requests[0].signal.aborted, true);
  assert.equal(c.events.filter(e => e.type === 'error').length, 1);
  pending.resolve(response(final('Kasno')));
  await tick();
  assert.equal(c.events.filter(e => e.type === 'text').length, 0);
});

test('empty and invalid provider responses fail with no retry', async () => {
  for (const data of [
    { content: [], stop_reason: 'end_turn' }, final(' '),
    { content: [{ type: 'text', text: 'partial' }], stop_reason: 'max_tokens' },
    { content: [{ type: 'tool_use', name: 'search_sets', id: 'a', input: [] }], stop_reason: 'tool_use' },
    { ...call('search_sets'), stop_reason: 'end_turn' }
  ]) {
    const c = client({ replies: [data] });
    await assert.rejects(c.ask(), e => ['invalid_response', 'empty_response'].includes(e.code));
    assert.equal(c.requests.length, 1);
    assert.equal(c.events.filter(e => e.type === 'text').length, 0);
  }
});

test('HTTP and network failures have no automatic fallback', async () => {
  for (const failure of [() => ({ ok: false, status: 429 }), () => { throw Error('offline'); }]) {
    const c = client({ fetch: failure });
    await assert.rejects(c.ask());
    assert.equal(c.requests.length, 1);
    assert.equal(c.events.filter(e => e.type === 'text').length, 0);
  }
});

test('underlying errors cannot replace the friendly surface message', async () => {
  const technical = Object.assign(new Error('TypeError: internal transport detail'), { code: 'ECONNRESET' });
  const c = client({ fetch: () => { throw technical; } });
  await assert.rejects(c.ask(), e => {
    assert.equal(e.code, 'agent_unavailable');
    assert.equal(e.cause, technical);
    assert.match(e.userMessage, /Provjeri vezu/);
    assert.equal(e.message, e.userMessage);
    assert.equal(c.events.find(event => event.type === 'error').message, e.userMessage);
    assert.doesNotMatch(e.userMessage, /TypeError|transport|ECONNRESET/);
    return true;
  });
});

test('replayed tool arguments execute once even with new ids and reordered keys', async () => {
  let effects = 0;
  const c = client({ replies: [
    call('create_tire_set', { customer_name: 'Marko', quantity: 4 }, 'a'),
    call('create_tire_set', { quantity: 4, customer_name: 'Marko' }, 'b'),
    final('Pripremljeno za provjeru')
  ] });
  await c.ask('Pripremi', { tools: { create_tire_set: () => { effects++; return { result: 'Samo priprema.' }; } } });
  assert.equal(effects, 1);
  assert.equal(c.requests[2].payload.messages[4].content[0].tool_use_id, 'b');
});

test('unknown tool override cannot register a new tool', async () => {
  let effects = 0;
  const c = client({ replies: [call('delete_all'), final('Ta radnja nije dostupna.')] });
  await c.ask('Test', { tools: { delete_all: () => { effects++; return { result: 'deleted' }; } } });
  assert.equal(effects, 0);
  assert.match(c.requests[1].payload.messages[2].content[0].content, /nedopušten/);
});

test('normalized sticker effect executes once despite case, whitespace and ignored fields', async () => {
  let prints = 0;
  const c = client({ replies: [call('generate_sticker', { code: 'asc-42' }, 'a'),
    call('generate_sticker', { code: ' ASC-42 ', ignored: 'value' }, 'b'), final('Poslan zahtjev za ispis.')] });
  c.window.ASCQR = { printSticker: () => { prints++; } };
  c.window.qrcode = {};
  await c.ask();
  assert.equal(prints, 1);
});

test('reused tool id with changed arguments fails before repeating an effect', async () => {
  let effects = 0;
  const c = client({ replies: [call('create_tire_set', { customer_name: 'Marko' }, 'same'),
    call('create_tire_set', { customer_name: 'Ivan' }, 'same')] });
  await assert.rejects(c.ask('Pripremi', { tools: {
    create_tire_set: () => { effects++; return { result: 'Pripremljeno' }; }
  } }), { code: 'invalid_response' });
  assert.equal(effects, 1);
  assert.equal(c.requests.length, 2);
});

test('tool loop exhaustion fails and does not replay repeated effects', async () => {
  let effects = 0;
  const c = client({ replies: Array.from({ length: 6 }, (_, i) => call('search_sets', {}, 'a' + i)) });
  await assert.rejects(c.ask('Traži', { tools: { search_sets: () => { effects++; return { result: 'ok' }; } } }), { code: 'tool_limit' });
  assert.equal(effects, 1);
  assert.equal(c.requests.length, 6);
  assert.equal(c.events.filter(e => e.type === 'text').length, 0);
});

test('nested-page navigation resolves from agent script directory and remains cancellable', async () => {
  const c = client({ replies: [call('open_set', { code: 'ASC-2026-0042' }), final('Otvaranje slijedi.')] });
  await c.ask();
  assert.match(c.requests[1].payload.messages[2].content[0].content, /još nije otvorena/);
  c.fire(650);
  assert.equal(c.location.href, 'https://host.example/ASC/app/set-detail.html?code=ASC-2026-0042');
  const d = client({ replies: [call('open_set', { code: 'X' }), final('Otvaranje slijedi.')] });
  await d.ask();
  d.agent.cancel();
  d.fire(650);
  assert.match(d.location.href, /warehouse-preview/);
});

test('create only stages known prefill fields; storage failure does not navigate or claim saving', async () => {
  const a = { customer_name: 'Marko', quantity: 4, edit: true, code: 'EXISTING', malicious: 'x' };
  const c = client({ replies: [call('create_tire_set', a), final('Provjeri obrazac.')] });
  await c.ask();
  assert.deepEqual(JSON.parse(c.stored.get('asc.prefill')), { customer_name: 'Marko', quantity: 4 });
  assert.match(c.requests[1].payload.messages[2].content[0].content, /NIJE spremljen/);
  c.fire(650);
  assert.equal(c.location.href, 'https://host.example/ASC/app/checkin.html?prefill=1');
  const d = client({ storageFails: true, replies: [call('create_tire_set', a), final('Nije uspjelo.')] });
  await d.ask();
  d.fire(650);
  assert.match(d.location.href, /warehouse-preview/);
  assert.match(d.requests[1].payload.messages[2].content[0].content, /Nije moguće/);
});

test('ambiguous partial, fuzzy and duplicate customer names require selection', async () => {
  for (const [name, rows] of [
    ['Marko', [{ id: '1', name: 'Marko Horvat' }, { id: '2', name: 'Marko Horvatić' }]],
    ['Marko Horvta', [{ id: '1', name: 'Marko Horvat' }, { id: '2', name: 'Marko Horvath' }]],
    ['Marko Horvat', [{ id: '1', name: 'Marko Horvat' }, { id: '2', name: 'Marko Horvat' }]]
  ]) {
    const c = client({ db: { listCustomers: async () => rows }, replies: [call('open_customer', { name }), final('Odaberi kupca.')] });
    await c.ask();
    assert.match(c.requests[1].payload.messages[2].content[0].content, /Odaberi točno ime ili id/);
    c.fire(650);
    assert.match(c.location.href, /warehouse-preview/);
  }
});

test('unique normalized full name navigates to real customer id', async () => {
  const c = client({ db: { listCustomers: async () => [{ id: 'a-1', name: 'Đuro Čavić' }] },
    replies: [call('open_customer', { name: 'duro cavic' }), final('Otvaranje slijedi.')] });
  await c.ask();
  c.fire(650);
  assert.equal(c.location.href, 'https://host.example/ASC/app/customers.html?id=a-1');
});

test('authenticated endpoint gets normal session only after same-project URL validation', async () => {
  const c = client({ auth: true, replies: [final('Pozdrav')] });
  await c.ask();
  assert.equal(c.sessionReads, 1);
  assert.equal(c.requests[0].headers.Authorization, 'Bearer mock-session-token');
  assert.equal(c.requests[0].redirect, 'error');
  assert.deepEqual(c.imports, ['https://host.example/ASC/js/config.js', 'https://host.example/ASC/js/db.js']);
  for (const endpoint of [
    'https://other.example/functions/v1/asc-agent', 'http://project.example/functions/v1/asc-agent',
    'https://project.example/functions/v1/asc-agent-demo-v2', 'https://project.example/functions/v1/asc-agent?redirect=bad'
  ]) {
    const d = client({ auth: true, endpoint });
    await assert.rejects(d.ask(), { code: 'invalid_endpoint' });
    assert.equal(d.sessionReads, 0);
    assert.equal(d.requests.length, 0);
  }
});

test('missing session fails before any provider request', async () => {
  const c = client({ auth: true, db: { getSession: async () => null } });
  await assert.rejects(c.ask(), { code: 'auth_required' });
  assert.equal(c.requests.length, 0);
});

test('history trims only whole user turns and reset removes previous history', async () => {
  let n = 0;
  const c = client({ fetch: (_url, opts) => {
    const messages = JSON.parse(opts.body).messages, last = messages.at(-1);
    return response(typeof last.content === 'string' ? call('search_sets', {}, 'history-' + (++n)) : final('Odgovor ' + n));
  } });
  for (let i = 0; i < 15; i++) await c.ask('Upit ' + i, { tools: { search_sets: () => ({ result: 'Pronađeno' }) } });
  for (const req of c.requests) {
    const messages = req.payload.messages;
    assert.ok(messages.length <= 40);
    assert.equal(messages[0].role, 'user');
    assert.equal(typeof messages[0].content, 'string');
    const ids = new Set();
    for (const message of messages) if (Array.isArray(message.content)) for (const block of message.content) {
      if (block.type === 'tool_use') ids.add(block.id);
      if (block.type === 'tool_result') assert.ok(ids.has(block.tool_use_id), 'tool result kept with its matching call');
    }
  }
  c.agent.reset();
  await c.ask('Novi', { tools: { search_sets: () => ({ result: 'Pronađeno' }) } });
  assert.equal(c.requests.at(-2).payload.messages.length, 1);
});

// All protocol fixtures above explicitly opt into a synthetic remote endpoint.
test('missing or disabled remote allowance blocks before session imports and fetch', async () => {
  for (const flag of [false, null, 'true', 1]) {
    const c=client({remoteAllowed:flag,auth:true});
    assert.equal(c.agent.configured(),false);
    await assert.rejects(c.ask('anything'), {code:'remote_disabled'});
    assert.equal(c.requests.length,0);assert.equal(c.imports.length,0);assert.equal(c.sessionReads,0);
  }
  const c=client({auth:true});delete c.window.ASC_AGENT_REMOTE_ALLOWED;
  await assert.rejects(c.ask(),{code:'remote_disabled'});assert.equal(c.requests.length,0);
});
test('configured endpoint still requires an explicit remote turn', async () => {
  const c=client({auth:true});
  await assert.rejects(c.agent.ask('anything'),{code:'remote_disabled'});
  assert.equal(c.requests.length,0);assert.equal(c.sessionReads,0);
});
test('stream option emits deltas and still one final text', async () => {
  const sse = new TextEncoder().encode([
    'event: delta',
    'data: {"text":"Po"}',
    '',
    'event: delta',
    'data: {"text":"zdrav"}',
    '',
    'event: done',
    'data: {"content":[{"type":"text","text":"Pozdrav"}],"stop_reason":"end_turn"}',
    '',
    ''
  ].join('\n'));
  let sent = false;
  const c = client({ fetch: (_url, opts) => {
    assert.equal(opts.headers.Accept, 'text/event-stream');
    assert.equal(JSON.parse(opts.body).stream, true);
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'text/event-stream' : null },
      body: { getReader: () => ({ read: async () => (sent ? { done: true } : (sent = true, { done: false, value: sse })) }) }
    };
  } });
  assert.equal(await c.ask('Bok', { stream: true }), 'Pozdrav');
  assert.deepEqual(c.events.filter((e) => e.type === 'delta').map((e) => e.text), ['Po', 'zdrav']);
  assert.deepEqual(c.events.filter((e) => e.type === 'text').map((e) => e.text), ['Pozdrav']);
});

test('revoking remote allowance stops a tool-loop continuation', async () => {
  const c=client({replies:[call('inventory_overview')]});
  await assert.rejects(c.ask('count',{tools:{inventory_overview:()=>{c.window.ASC_AGENT_REMOTE_ALLOWED=false;return {result:'0'};}}}),{code:'remote_disabled'});
  assert.equal(c.requests.length,1);
});
