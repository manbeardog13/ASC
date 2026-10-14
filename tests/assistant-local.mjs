import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createLocalAssistant } from '../app/assistant-local.js';

const make = (code, name, plate, extra = {}) => ({ public_code: code, quantity: 4, status: 'in_storage', season: 'winter', zone: '2.3', rack: 'S025', shelf: '0', slot: 0,
  vehicle: { plate, customer: { name } }, ...extra });
const rows = [make('ASC-001234', 'Marko Horvat', 'DU-1234-AB'), make('ASC-001235', 'Marko Marić', 'ZG-3456-CD'), make('ASC-009876', 'Ivan Šimić', 'ST-9876-EF', { status: 'reserved' })];
function fixture(data = rows, initial = { page: 'dashboard' }) {
  let ctx = initial, reads = 0; const paths = [];
  const assistant = createLocalAssistant({ loadData: async () => { reads++; return data; }, navigate: path => paths.push(path), context: () => ctx, now: () => new Date(2026, 9, 14, 12) });
  return { ...assistant, paths, get reads() { return reads; }, setContext(value) { ctx = value; } };
}

test('navigation/help and check-in preparation use no data and perform no save', async () => {
  const a = fixture();
  assert.match((await a.reply('Što možeš?')).text, /bez vanjskog AI modela/);
  await a.reply('Molim otvori kupce');
  assert.deepEqual(a.paths, ['customers.html']);
  const add = await a.reply('Zaprimi novi komplet za Marka'); assert.match(add.text, /ništa nije spremljeno/i);
  add.actions[0].run(); assert.equal(a.paths[1], 'checkin.html'); assert.equal(a.reads, 0);
});
test('typo commands and Croatian words use grounded search', async () => {
  const a = fixture();
  for (const input of ['Pronadi gume za Iavn Simci', 'Prnoadi gume Ivan Simic', 'Where are Ivan Simic tyres?', 'Ivan Šimić']) {
    const result = await a.reply(input); assert.match(result.text, /ASC-009876/, input);
    assert.equal(a.paths.length, 0);
  }
  const result = await a.reply('Gdje su Markove gume?'); assert.match(result.text, /2 kompleta/); assert.equal(result.actions.length, 2);
});
test('ambiguous names require selection, selected code is entity labelled and navigation is explicit', async () => {
  const a = fixture(); const result = await a.reply('Pronađi gume Marko');
  assert.match(result.text, /2 kompleta/); assert.match(result.actions[0].label, /ASC-001234.*Marko Horvat/); assert.equal(a.paths.length, 0);
  assert.match((await a.reply('gdje su')).text, /Na koji komplet/);
  const chosen = await a.reply(result.actions[0].prompt); assert.match(chosen.text, /2.3 · S025 · 0 · 0/);
  chosen.actions[0].run(); assert.deepEqual(a.paths, ['set-detail.html?code=ASC-001234']);
});
test('numeric identifiers are not typo corrected or assembled across fields', async () => {
  const a = fixture([make('ASC-2026-1243', 'Marko Horvat', 'DU-1234-AB')]);
  for (const input of ['Pronađi DU-1243-AB', 'find DU 1243 AB', 'ASC-2026-1234', 'DU-1234-BA']) {
    assert.match((await a.reply(input)).text, /Nema podudaranja/, input);
  }
  assert.match((await a.reply('find DU 1234 AB')).text, /ASC-2026-1243/);
});
test('followup uses only an unambiguous prior match, resets on context changes and explicit reset', async () => {
  const a = fixture();
  await a.reply('Ivan Simic'); assert.match((await a.reply('where are they')).text, /ASC-009876/);
  a.setContext({ page: 'customers' }); assert.match((await a.reply('gdje su')).text, /Na koji komplet/);
  await a.reply('Ivan Simic'); a.reset(); assert.match((await a.reply('gdje su')).text, /Na koji komplet/);
});
test('selected set context is re-read and missing context cannot invent a set', async () => {
  const a = fixture(rows, { page: 'set-detail', setCode: 'ASC-001234' });
  assert.match((await a.reply('Objasni ovaj komplet')).text, /ASC-001234/);
  assert.match((await a.reply('where is it')).text, /ASC-001234/);
  a.setContext({ page: 'set-detail', setCode: 'ASC-000000' }); assert.match((await a.reply('gdje je')).text, /Nema podudaranja/);
});
test('inventory distinguishes set counts, unknown status, deleted rows and capacity', async () => {
  const a = fixture([...rows, make('X', 'X', 'X', { status: 'other' }), make('DELETED', 'X', 'X', { deleted_at: '2026-10-01' })]);
  const result = await a.reply('Koliko kompleta imamo?');
  assert.match(result.text, /učitanim kompletima: 4/); assert.match(result.text, /Na skladištu: 2/); assert.match(result.text, /rezervirano: 1/);
  assert.match(result.text, /bez poznatog statusa: 1/); assert.match(result.text, /nije potvrda slobodnog kapaciteta/);
  const tyres = await a.reply('Koliko guma imamo?'); assert.match(tyres.text, /Evidentirano guma: 16/);
  const storedTyres = await a.reply('Koliko guma na skladištu?'); assert.match(storedTyres.text, /guma u statusu na skladištu: 8/);
});
test('due pickups bind to device date, reject impossible dates and exclude checked-out/missing sets', async () => {
  const a = fixture([
    make('TODAY', 'A', 'A', { expected_out_date: '2026-10-14' }), make('TOMORROW', 'B', 'B', { expected_out_date: '2026-10-15' }),
    make('LATE', 'C', 'C', { expected_out_date: '2026-10-01' }), make('LATER', 'D', 'D', { expected_out_date: '2026-10-22' }),
    make('OUT', 'E', 'E', { expected_out_date: '2026-10-14', status: 'checked_out' }), make('MISSING', 'F', 'F', { expected_out_date: '2026-10-14', status: 'missing' }),
    make('BAD', 'G', 'G', { expected_out_date: '2026-02-31' })
  ]);
  const today = await a.reply('Što je za preuzimanje danas?'); assert.match(today.text, /TODAY/); assert.doesNotMatch(today.text, /TOMORROW|OUT|MISSING|BAD|LATE/);
  const tomorrow = await a.reply('pickups tomorrow'); assert.match(tomorrow.text, /TOMORROW/); assert.doesNotMatch(tomorrow.text, /TODAY/);
  const week = await a.reply('due pickups'); assert.match(week.text, /do 2026-10-21/); assert.match(week.text, /LATE/); assert.doesNotMatch(week.text, /LATER|BAD/);
  assert.match((await a.reply('pickups in 30 days')).text, /ne mogu pouzdano protumačiti/);
});
test('unrecognized pickup dates and customer filters clarify without discarding qualifiers', async () => {
  const a = fixture([make('OTHER', 'Ivan', 'DU-12-AA', { expected_out_date: '2026-10-14' })]);
  for (const input of ['Preuzimanja jučer', 'Gdje su Markove gume za preuzimanje danas?', 'pickups in 7 days', 'pickups next month', 'Preuzimanja 2026-10-14']) {
    const result = await a.reply(input); assert.match(result.text, /ne mogu pouzdano protumačiti/, input); assert.doesNotMatch(result.text, /OTHER/);
  }
  assert.equal(a.reads, 0);
});
test('checked-out locations are labelled historical rather than current presence', async () => {
  const a = fixture([make('OUT', 'Ana', 'DU-11-AA', { status: 'checked_out' })]);
  const result = await a.reply('Ana'); assert.match(result.text, /preuzeto/); assert.match(result.text, /prijašnja lokacija/);
});
test('warehouse preview and demo scopes never read live rows', async () => {
  for (const ctx of [{ page: 'warehouse-preview' }, { dataScope: 'Fictional local demo only; never live customer inventory.' }, 'unparseable']) {
    const a = fixture(rows, ctx); const result = await a.reply('Pronađi Ivan Simic');
    assert.match(result.text, /probni prikaz/i); assert.equal(a.reads, 0); assert.ok(result.actions.every(action => !action.run));
  }
});
test('unsupported tasks and writes are honest and require explicit app action', async () => {
  const a = fixture();
  assert.match((await a.reply('Why is my engine smoking?')).text, /ne mogu pouzdano/);
  assert.match((await a.reply('Obriši sve gume')).text, /Ništa nisam promijenio/);
  assert.equal(a.reads, 0); assert.equal(a.paths.length, 0);
  for (const input of ['Dodaj korisnika', 'Add reminder', 'create customer', 'dodaj podsjetnik za gume']) {
    const result = await a.reply(input); assert.match(result.text, /ne podržavam/, input);
    assert.ok(result.actions.every(action => !action.label.includes('zaprimanje')), input);
  }
});
test('failed data and auth reads are unavailable, never a false empty inventory', async () => {
  const a = createLocalAssistant({ loadData: async () => { throw new Error('raw secret db failure'); } });
  const result = await a.reply('stanje'); assert.match(result.text, /nisam uspio učitati/); assert.doesNotMatch(result.text, /secret|raw/); assert.equal(result.actions[0].submit, true);
  const b = createLocalAssistant({ loadData: async () => { const error = new Error(); error.code = 'session_required'; throw error; } });
  assert.match((await b.reply('Ivan')).text, /Prijavi se/);
});
test('a failed or unsupported fresh query clears the previous unambiguous reference', async () => {
  let fail = false;
  const a = createLocalAssistant({ loadData: async () => { if (fail) throw new Error('offline'); return rows; } });
  await a.reply('Ivan Simic'); fail = true; await a.reply('Pronađi Marko'); fail = false;
  assert.match((await a.reply('gdje su')).text, /Na koji komplet/);
  await a.reply('Ivan Simic'); await a.reply('Why is the engine smoking?'); assert.match((await a.reply('gdje su')).text, /Na koji komplet/);
});
test('selected customer followup filters strictly by current customer ID, never name or first match', async () => {
  const selected = make('SELECTED', 'Same Name', 'DU-1-AA'); selected.vehicle.customer.id = 'customer1';
  const other = make('OTHER', 'Same Name', 'DU-2-AA'); other.vehicle.customer.id = 'customer2';
  const a = fixture([selected, other], { page: 'customers', customerId: 'customer1' });
  assert.match((await a.reply('Gdje su njegove gume?')).text, /SELECTED/);
  a.setContext({ page: 'customers', customerId: 'customer2' }); assert.match((await a.reply("this customer's tyres")).text, /OTHER/);
  a.setContext({ page: 'customers', customerId: 'unknown' }); assert.match((await a.reply('gdje su')).text, /Nema podudaranja/);
});
test('explicit selected customer/set language overrides previous search while generic pronoun follows it', async () => {
  const selected = make('SELECTED', 'Marko', 'DU-1-AA'); selected.vehicle.customer.id = 'customer1';
  const other = make('OTHER', 'Ivan', 'DU-2-AA'); other.vehicle.customer.id = 'customer2';
  const a = fixture([selected, other], { page: 'customers', customerId: 'customer1' });
  await a.reply('Ivan'); assert.match((await a.reply('gdje su')).text, /OTHER/);
  assert.match((await a.reply("this customer's tyres")).text, /SELECTED/);
  await a.reply('Ivan'); assert.match((await a.reply('njegove gume')).text, /SELECTED/);
  a.setContext({ page: 'dashboard' }); await a.reply('Ivan'); assert.match((await a.reply("this customer's tyres")).text, /Na koji komplet/);
  a.setContext({ page: 'set-detail', setCode: 'SELECTED' }); await a.reply('Ivan'); assert.match((await a.reply('where are they')).text, /OTHER/);
  assert.match((await a.reply('Objasni ovaj komplet')).text, /SELECTED/);
});
test('stale action is rejected after a new request, changed selection, reset or aborted signal', async () => {
  const a = fixture(); let result = await a.reply('Ivan'); await a.reply('Marko'); assert.throws(() => result.actions[0].run(), { name: 'AbortError' });
  result = await a.reply('Ivan'); a.setContext({ page: 'set-detail', setCode: 'ASC-001234' }); assert.throws(() => result.actions[0].run(), { name: 'AbortError' });
  result = await a.reply('Ivan'); a.reset(); assert.throws(() => result.actions[0].run(), { name: 'AbortError' });
  const controller = new AbortController(); result = await a.reply('Ivan', { signal: controller.signal }); controller.abort(); assert.throws(() => result.actions[0].run(), { name: 'AbortError' });
  assert.equal(a.paths.length, 0);
});
test('abort promptly rejects an uncancellable slow data read and suppresses late results', async () => {
  let finish; const controller = new AbortController();
  const a = createLocalAssistant({ loadData: () => new Promise(resolve => { finish = resolve; }) });
  const promise = a.reply('Ivan', { signal: controller.signal }); await Promise.resolve(); controller.abort();
  await assert.rejects(promise, { name: 'AbortError' }); finish(rows);
  await assert.rejects(a.reply('Ivan', { signal: controller.signal }), { name: 'AbortError' });
});
test('new request and current context suppress late reads without retaining stale targets', async () => {
  let finish, ctx = { page: 'dashboard' };
  const a = createLocalAssistant({ context: () => ctx, loadData: () => new Promise(resolve => { finish = resolve; }) });
  const pending = a.reply('Ivan'); await Promise.resolve(); ctx = { page: 'customers' }; finish(rows);
  await assert.rejects(pending, { name: 'AbortError' }); assert.match((await a.reply('gdje su')).text, /Na koji komplet/);
});

async function defaultAssistant({ sessions, data = rows, failure = null } = {}) {
  const calls = [], imports = [], ctx = vm.createContext({ URL, Date, AbortController });
  let sessionIndex = 0;
  const query = Object.fromEntries(['select', 'is', 'order', 'limit', 'abortSignal'].map(name => [name, (...args) => { calls.push([name, ...args]); return query; }]));
  query.then = (resolve, reject) => Promise.resolve({ data, error: failure }).then(resolve, reject);
  const timeline = sessions || [{ user: { id: 'u' } }];
  const supabase = { auth: { getSession: async () => ({ data: { session: timeline[Math.min(sessionIndex++, timeline.length - 1)] } }) },
    from: table => { calls.push(['from', table]); return query; } };
  const url = new URL('../app/assistant-local.js', import.meta.url);
  const module = new vm.SourceTextModule(await fs.readFile(url, 'utf8'), { context: ctx, identifier: url.href,
    initializeImportMeta(meta) { meta.url = url.href; },
    importModuleDynamically: async path => {
      imports.push(path); assert.equal(path, '../js/supabaseClient.js');
      const dependency = new vm.SyntheticModule(['supabase'], function () { this.setExport('supabase', supabase); }, { context: ctx });
      await dependency.link(() => {}); await dependency.evaluate(); return dependency;
    } });
  await module.link(async path => {
    assert.equal(path, './agent-search.js');
    const search = new vm.SourceTextModule(await fs.readFile(new URL('../app/agent-search.js', import.meta.url), 'utf8'), { context: ctx });
    return search;
  });
  await module.evaluate();
  return { assistant: module.namespace.createLocalAssistant(), calls, imports };
}
test('default loader uses only the authenticated shared client and bounded read, never db queue import', async () => {
  const { assistant, calls, imports } = await defaultAssistant(); const controller = new AbortController();
  const result = await assistant.reply('Ivan Simic', { signal: controller.signal }); assert.match(result.text, /ASC-009876/);
  assert.deepEqual(imports, ['../js/supabaseClient.js']);
  assert.deepEqual(calls.map(call => call[0]), ['from', 'select', 'is', 'order', 'limit', 'abortSignal']);
  assert.deepEqual(calls.find(call => call[0] === 'from'), ['from', 'storage_sets']);
  assert.deepEqual(calls.find(call => call[0] === 'limit'), ['limit', 1000]);
  assert.deepEqual(calls.find(call => call[0] === 'is'), ['is', 'deleted_at', null]);
  assert.equal(calls.find(call => call[0] === 'abortSignal')[1], controller.signal);
  assert.doesNotMatch(calls.find(call => call[0] === 'select')[1], /email|phone|notes/);
});
test('default loader refuses signed-out read and rejects session changes during read', async () => {
  const out = await defaultAssistant({ sessions: [null] }); assert.match((await out.assistant.reply('Ivan')).text, /Prijavi se/); assert.equal(out.calls.length, 0);
  const changed = await defaultAssistant({ sessions: [{ user: { id: 'u1' } }, { user: { id: 'u2' } }] });
  await assert.rejects(changed.assistant.reply('Ivan'), { name: 'AbortError' });
  const failed = await defaultAssistant({ failure: { message: 'sensitive server detail' } });
  const result = await failed.assistant.reply('Ivan'); assert.match(result.text, /nisam uspio učitati/); assert.doesNotMatch(result.text, /sensitive/);
});
