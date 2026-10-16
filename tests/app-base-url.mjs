import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBaseUrl, FALLBACK_BASE_URL, config } from '../js/config.js';

test('APP_BASE_URL follows the host the app was served from', () => {
  assert.equal(resolveBaseUrl('https://asc-tire-hotel.netlify.app/js/config.js'), 'https://asc-tire-hotel.netlify.app/');
  assert.equal(resolveBaseUrl('https://manbeardog13.github.io/ASC/js/config.js'), 'https://manbeardog13.github.io/ASC/');
  assert.equal(resolveBaseUrl('https://6ad25fdf5e37d5448699103e--asc-tire-hotel.netlify.app/js/config.js?v=2'), 'https://6ad25fdf5e37d5448699103e--asc-tire-hotel.netlify.app/');
  assert.equal(resolveBaseUrl('http://localhost:8765/js/config.js'), 'http://localhost:8765/');
});

test('falls back to GitHub Pages when the origin cannot be resolved', () => {
  assert.equal(resolveBaseUrl('file:///C:/ASC/js/config.js'), FALLBACK_BASE_URL);
  assert.equal(resolveBaseUrl('not a url'), FALLBACK_BASE_URL);
  assert.equal(resolveBaseUrl(undefined), FALLBACK_BASE_URL);
  // Under node the module is a file: URL → fallback.
  assert.equal(config.APP_BASE_URL, FALLBACK_BASE_URL);
  assert.ok(config.APP_BASE_URL.endsWith('/'));
});
