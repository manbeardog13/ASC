import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAssistant } from '../app/assistant-local.js';

const row = { public_code: 'ASC-001234', quantity: 4, status: 'in_storage', season: 'winter', zone: '2.3', rack: 'S025', shelf: '0', slot: '0',
  vehicle: { plate: 'DU-1234-AB', customer: { name: 'Marko Horvat' } } };

function harness(ops, data = [row]) {
  const paths = [];
  let reads = 0;
  const assistant = createLocalAssistant({
    loadData: async () => { reads++; return data; },
    navigate: path => paths.push(path),
    ops,
    now: () => new Date(2026, 9, 14, 12),
  });
  return { assistant, paths, get reads() { return reads; } };
}

test('slot moves wait for confirm and then call the RPC once', async () => {
  const calls = [];
  const ops = {
    suggest: async () => ({ zone: 'C', rack: '01', shelf: '1', slot: '2', qr_code: 'LOC-ABCDEF123456' }),
    place: async (args) => { calls.push(['place', args]); return { location: { zone: 'C', rack: '01', qr_code: args.qrCode } }; },
    move: async (args) => { calls.push(['move', args]); return { location: { zone: 'C', qr_code: args.qrCode } }; },
    checkout: async (args) => { calls.push(['out', args]); return { ok: true }; },
  };
  const a = harness(ops);
  const armed = await a.assistant.reply('Premjesti ASC-001234 na LOC-abcdef123456');
  assert.match(armed.text, /ništa nije spremljeno/i);
  assert.equal(calls.length, 0);
  assert.equal(a.reads, 0);
  const done = await armed.actions[0].run();
  assert.match(done, /Premješteno: ASC-001234/);
  assert.deepEqual(calls, [['move', { publicCode: 'ASC-001234', qrCode: 'LOC-ABCDEF123456' }]]);
  const again = await a.assistant.reply('Potvrdi');
  assert.match(again.text, /Ništa nisam promijenio/);
  assert.equal(calls.length, 1);
});

test('suggest, checkout and map actions stay local', async () => {
  const calls = [];
  const ops = {
    suggest: async () => { calls.push('suggest'); return { zone: 'A', rack: '01', shelf: '1', slot: '1', qr_code: 'LOC-AAAABBBBCCCC' }; },
    place: async () => { throw new Error('no'); },
    move: async () => { throw new Error('no'); },
    checkout: async (args) => { calls.push(['out', args.publicCode]); return { ok: true }; },
  };
  const a = harness(ops);
  const slot = await a.assistant.reply('Predloži slobodno mjesto');
  assert.match(slot.text, /LOC-AAAABBBBCCCC/);
  assert.equal(a.reads, 0);
  const out = await a.assistant.reply('Izdaj ASC-001234');
  assert.match(out.text, /ništa nije spremljeno/i);
  assert.match(await out.actions[0].run(), /Preuzeto: ASC-001234/);
  const map = await a.assistant.reply('Pokaži na karti Marko Horvat');
  assert.deepEqual(a.paths, ['warehouse-preview/index.html?set=ASC-001234']);
  assert.match(map.text, /ASC-001234/);
  assert.equal(a.reads, 1);
});

test('bare move and check-in still save nothing', async () => {
  const ops = { suggest: async () => null, place: async () => { throw new Error('saved'); }, move: async () => { throw new Error('saved'); }, checkout: async () => { throw new Error('saved'); } };
  const a = harness(ops);
  assert.match((await a.assistant.reply('Premjesti')).text, /Ništa nisam promijenio/);
  const add = await a.assistant.reply('Zaprimi novi komplet za Marka');
  assert.match(add.text, /ništa nije spremljeno/i);
  add.actions[0].run();
  assert.match((await a.assistant.reply('Obriši sve gume')).text, /Ništa nisam promijenio/);
  assert.equal(a.reads, 0);
  assert.equal(a.paths.length, 1);
  assert.equal(a.paths[0], 'checkin.html');
});
