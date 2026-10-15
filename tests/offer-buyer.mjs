import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buyerOfferDocument, buyerOfferText } from '../js/offerPrint.js';

const source = readFileSync(new URL('../js/offerPrint.js', import.meta.url), 'utf8');
const forbidden = [
  'entry_price', 'internal_cost', 'internal_notes', 'source_name', 'source_contact',
  'source_ref', 'source_notes', 'supplier', 'nabavna', 'ulazna', 'marza', 'marža',
];

test('the buyer print module does not name internal fields', () => {
  for (const word of forbidden) {
    assert.equal(source.toLowerCase().includes(word), false, word);
  }
  assert.equal(/\bmargin\b/i.test(source), false);
});

test('the buyer copy drops internal figures and supplier text', () => {
  const poison = 'ACME-SUPPLIER-SECRET';
  const offer = {
    customer_name: 'Ana',
    phone: '091',
    email: 'ana@example.com',
    currency: 'EUR',
    total: 80,
    terms: 'Plaćanje pri preuzimanju',
    valid_until: '2026-11-01',
    customer_snapshot: {
      name: 'Ana Anić', phone: '091111', email: 'ana@example.com',
      plate: 'DU-100-AA', make: 'VW', model: 'Golf', year: 2018, notes: 'Hotel guma',
    },
    lines: [
      { description: 'Zimske gume', qty: 4, unit_price: 20, image_url: 'https://cdn.example/photo.jpg', image_path: `offers/x/${poison}.jpg` },
    ],
    offer_related_sets: [{
      public_code: 'ASC-2026-0001', season: 'winter', tire_size: '205/55R16', tire_brand: 'Michelin',
      zone: 'A', rack: '01', shelf: '1', slot: '1', status: 'in_storage',
      check_in_date: '2026-10-01', swap_at: '2026-11-02', expected_out_date: '2026-11-03', keep_plan: 'seasonal',
    }],
    entry_price: 12.5,
    internal_cost: 4,
    margin: 63.5,
    internal_notes: poison,
    source_name: poison,
    source_contact: 'marin-secret',
    source_ref: poison,
    source_notes: poison,
    supplier: poison,
  };
  const hrefs = {
    set: (code) => `set-detail.html?code=${code}`,
    locate: (code) => `locate.html?q=${code}`,
  };
  const html = buyerOfferDocument(offer, hrefs);
  const text = buyerOfferText(offer, hrefs);
  for (const copy of [html, text]) {
    assert.equal(copy.includes(poison), false);
    assert.equal(copy.includes('marin-secret'), false);
    assert.equal(copy.includes('12.5'), false);
    assert.equal(copy.includes('63.5'), false);
    for (const word of forbidden) assert.equal(copy.toLowerCase().includes(word), false, word);
    assert.equal(/\bmargin\b/i.test(copy), false);
  }
  assert.match(html, /Ana Anić/);
  assert.match(html, /Zimske gume/);
  assert.match(html, /https:\/\/cdn\.example\/photo\.jpg/);
  assert.match(html, /set-detail\.html\?code=ASC-2026-0001/);
  assert.match(html, /locate\.html\?q=ASC-2026-0001/);
  assert.match(html, /Plaćanje pri preuzimanju/);
  assert.doesNotMatch(html, /offerInternal|staff only|Internal/);
});
