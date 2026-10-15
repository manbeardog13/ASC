import test from 'node:test';
import assert from 'node:assert/strict';
import { answer } from '../app/concierge.js';

test('a shop question is answered from the facts, without a model', () => {
  assert.match(answer('Kako zaprimiti nove gume?'), /Zaprimi/);
  assert.match(answer('Dolaze li za šest mjeseci na sezonsku zamjenu?'), /šest mjeseci/);
  assert.match(answer('Kako pronaći komplet po naljepnici?'), /QR/);
});

test('a live warehouse question is left for the database', () => {
  assert.equal(answer('Koliko je slobodno u skladištu?'), null);
  assert.equal(answer('Tko čeka na preuzimanje danas?'), null);
  assert.equal(answer('Nađi gume za DU 123-AB'), null);
});

test('an unrelated question gets no fact', () => {
  assert.equal(answer('Prodajete li automobile?'), null);
  assert.equal(answer(''), null);
});
