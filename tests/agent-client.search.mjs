import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matchScore, searchSets, customerCandidates } from '../app/agent-search.js';

const ivan = { id: 'customer-1', name: 'Ivan Šimić', phone: '+385 91 123 4567', email: 'ivan.simic@example.hr' };
const ivana = { id: 'customer-2', name: 'Ivana Šimić', phone: '+385 91 123 4568', email: 'ivana@example.hr' };
const dorde = { id: 'customer-3', name: 'Đorđe Čačić', phone: '+385 98 222 3333', email: 'dorde@example.hr' };
const rows = [
  { public_code: 'ASC-001234', vehicle: { customer: ivan, plate: 'DU-1234-AB', make: 'Volkswagen', model: 'Golf' },
    season: 'winter', zone: 'A', rack: 'R2', shelf: '3', slot: '04',
    tires: [{ size: '205/55 R16', brand: 'Michelin', model: 'Alpin', dot_code: '2424' }] },
  { public_code: 'ASC-001235', vehicle: { customer: ivana, plate: 'DU-1234-AC', make: 'Audi', model: 'A3' },
    season: 'summer', zone: 'B', rack: 'R4', shelf: '5', slot: '06',
    tires: [{ size: '225/45 R17', brand: 'Continental', model: 'PremiumContact', dot_code: '1025' }] },
  { public_code: 'ASC-009876', vehicle: { customer: dorde, plate: 'ZG-9876-CD', make: 'Renault', model: 'Clio' },
    season: 'all_season', zone: 'Čekaonica', rack: 'S1', shelf: '2', slot: '0', tires: [] }
];

test('normalize folds Croatian accents, case, punctuation, and repeated spacing', () => {
  assert.equal(normalize('  ĐORĐE—Čačić / Šimić, Željko!  '), 'dorde cacic simic zeljko');
  assert.equal(normalize('C\u030cAC\u0301IC\u0301'), 'cacic');
  assert.equal(normalize(null), '');
  assert.equal(normalize(0), '0');
});

test('search includes code, contacts, vehicle, translated season, location, and tire fields', () => {
  for (const query of ['ASC001234', 'Ivan Simic', '+385911234567', 'ivan.simic@example.hr',
    'DU 1234 AB', 'Volkswagen', 'Golf', 'zimske', 'winter', 'A R2 3 04', '205/55R16', 'Michelin', 'Alpin', '2424']) {
    assert.equal(searchSets(rows, query)[0], rows[0], query);
  }
  assert.deepEqual(searchSets(rows, 'cjelogodisnje'), [rows[2]]);
  assert.deepEqual(searchSets(rows, 'Cekaonica'), [rows[2]]);
  assert.deepEqual(searchSets(rows, '0'), [rows[2]]);
});

test('every word must match, including searches spanning several fields', () => {
  assert.deepEqual(searchSets(rows, 'simic zimske michelin'), [rows[0]]);
  assert.deepEqual(searchSets(rows, 'Ivan 385911234567'), [rows[0]]);
  assert.deepEqual(searchSets(rows, 'Ivan Bridgestone'), []);
});

test('minor letter typos and transpositions rank after exact matches', () => {
  assert.equal(searchSets(rows, 'Iavn Simci')[0], rows[0]);
  assert.deepEqual(searchSets(rows, 'Volskwagen'), [rows[0]]);
  assert.deepEqual(searchSets(rows, 'Micheln'), [rows[0]]);
  assert.ok(matchScore(['Ivan Šimić'], 'Ivan') > matchScore(['Ivana Šimić'], 'Ivan'));
  assert.ok(matchScore(['Ivan Šimić'], 'Ivan') > matchScore(['Ivon Šimić'], 'Ivan'));
});

test('changed numeric identifiers and plate letters never match fuzzily', () => {
  for (const query of ['ASC-001243', 'ASC-00123', 'DU-1243-AB', 'DU-1234-BA',
    '+385911234576', '205/55 R17', '2442']) {
    assert.deepEqual(searchSets([rows[0]], query), [], query);
  }
  assert.equal(matchScore(['123 456'], '456 123'), null);
  assert.equal(matchScore(['STORE-1234'], 'STROE-1234'), null);
  assert.equal(matchScore(['12345'], '1234'), null);
  assert.equal(matchScore(['R3', '2'], 'R2'), null);
  assert.deepEqual(searchSets([{ zone: 'R3', shelf: '2' }], 'R2'), []);
});

test('short tokens require exact words or meaningful prefixes, never fuzzy guesses', () => {
  assert.equal(matchScore(['Ivan'], 'iv'), null);
  assert.equal(matchScore(['Ana'], 'An'), null);
  assert.equal(matchScore(['Ana'], 'Anu'), null);
  assert.ok(matchScore(['Golf'], 'Gol') > 0);
  assert.equal(matchScore(['DU'], 'DU'), 1000);
  assert.equal(matchScore(['DU'], 'ZG'), null);
});

test('structured plates cannot borrow digits from another field in any formatting', () => {
  const row = { public_code: 'ASC-2026-1243', vehicle: { plate: 'DU-1234-AB', customer: { name: 'Marko Horvat' } } };
  for (const query of ['DU-1243-AB', 'DU 1243 AB', 'DU1243AB', 'DU 1243AB', 'DU1243 AB']) {
    assert.deepEqual(searchSets([row], query), [], query);
    assert.equal(matchScore([row.public_code, row.vehicle.plate, row.vehicle.customer.name], query), null, query);
    assert.deepEqual(searchSets([row], 'Marko ' + query), [], 'mixed ' + query);
  }
  for (const query of ['DU-1234-AB', 'DU 1234 AB', 'DU1234AB', 'DU 1234AB', 'DU1234 AB']) {
    assert.deepEqual(searchSets([row], query), [row], query);
    assert.deepEqual(searchSets([row], 'Marko ' + query), [row], 'mixed ' + query);
  }
  assert.deepEqual(searchSets([row], 'Marko 1243'), [row], 'ordinary name plus an exact code number');
  assert.deepEqual(searchSets([row], 'Horvta 1234'), [row], 'typo-tolerant name plus an exact plate number');
  const suffixTrap = { public_code: 'AB-2026-5678', vehicle: { plate: 'DU-1234-CD' } };
  for (const query of ['DU-1234-AB', 'DU 1234 AB', 'DU1234AB', 'DU 1234AB', 'DU1234 AB']) {
    assert.deepEqual(searchSets([suffixTrap], query), [], 'suffix ' + query);
  }
});

test('spaced set codes and locations cannot borrow numeric chunks either', () => {
  const row = { public_code: 'ASC-2026-1243', vehicle: { plate: 'DU-1234-AB', customer: { name: 'Marko Horvat' } }, zone: 'R3', shelf: '2' };
  for (const query of ['ASC-2026-1234', 'ASC 2026 1234', 'ASC20261234', 'ASC2026 1234', 'R-2', 'R 2', 'R2']) {
    assert.deepEqual(searchSets([row], query), [], query);
  }
  for (const query of ['ASC-2026-1243', 'ASC 2026 1243', 'ASC20261243', 'ASC2026 1243']) {
    assert.deepEqual(searchSets([row], query), [row], query);
  }
});

test('identifier boundaries preserve short customer names and adjacent vehicle and tire terms', () => {
  for (const name of ['Ana', 'Ivo', 'Li']) {
    const row = { public_code: 'ASC-2026-1243', vehicle: { plate: 'DU-1234-AB', customer: { name } } };
    assert.deepEqual(searchSets([row], name + ' 1234'), [row], name);
    assert.ok(matchScore([name, 'DU-1234-AB'], name + ' 1234') > 0, name);
  }
  assert.deepEqual(searchSets(rows, 'Audi A3 225/45 R17'), [rows[1]]);
  assert.deepEqual(searchSets(rows, 'Audi A 3 225/45 R17'), [rows[1]]);
  assert.deepEqual(searchSets(rows, 'Audi A3 225/45 R16'), []);
  assert.deepEqual(searchSets(rows, 'Ivan ASC 001234 Volkswagen'), [rows[0]]);
});

test('empty and incomplete records are safe and do not return broad matches', () => {
  assert.deepEqual(searchSets(rows, '  !!! '), []);
  assert.deepEqual(searchSets([null, {}, { vehicle: {}, tires: [null] }], 'Ivan'), []);
  assert.deepEqual(searchSets(null, 'Ivan'), []);
  assert.equal(matchScore([null, undefined], 'Ivan'), null);
  assert.equal(matchScore('Ivan', ''), null);
  assert.deepEqual(customerCandidates(null, 'Ivan'), { exact: [], candidates: [] });
});

test('customer exact matches require normalized full-name equality and retain duplicates', () => {
  const duplicate = { ...ivan, id: 'customer-duplicate', name: 'IVAN SIMIC' };
  const customers = [ivana, ivan, duplicate, dorde];
  const result = customerCandidates(customers, '  ivan—šimić ');
  assert.deepEqual(result.exact, [ivan, duplicate]);
  assert.deepEqual(result.candidates, [ivana]);
  assert.equal(result.exact[0], ivan);
  assert.deepEqual(customerCandidates(customers, 'Dorde Cacic').exact, [dorde]);
});

test('partial and fuzzy names remain candidates, ranked for caller disambiguation', () => {
  const customers = [ivana, ivan, dorde];
  assert.deepEqual(customerCandidates(customers, 'Ivan'), { exact: [], candidates: [ivan, ivana] });
  assert.deepEqual(customerCandidates(customers, 'Iavn Simci'), { exact: [], candidates: [ivan] });
  assert.deepEqual(customerCandidates(customers, 'Simic').candidates, [ivana, ivan]);
  assert.deepEqual(customerCandidates(customers, ''), { exact: [], candidates: [] });
  assert.deepEqual(customerCandidates(customers, 'Iv'), { exact: [], candidates: [] });
  assert.deepEqual(customerCandidates(customers, '+385911234567'), { exact: [], candidates: [] });
});

test('helpers preserve source rows and stable order for tied scores', () => {
  const input = structuredClone(rows);
  const before = structuredClone(input);
  const result = searchSets(input, 'Simic');
  assert.deepEqual(input, before);
  assert.equal(result[0], input[0]);
  assert.equal(result[1], input[1]);
  assert.notEqual(result, input);
});
