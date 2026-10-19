import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app/live-workshop.js', import.meta.url), 'utf8');
const start = source.indexOf('// Search only reports');
const end = source.indexOf('// ---- Real data', start);
assert.ok(start >= 0 && end > start, 'Locate workshop microphone behavior');

function setup(supported) {
  const events = {}, attrs = {}, classes = new Set();
  const mic = {
    disabled: false,
    addEventListener: (name, fn) => events[name] = fn,
    setAttribute: (key, value) => attrs[key] = value,
    classList: {add: value => classes.add(value), remove: value => classes.delete(value)}
  };
  const sub = {textContent: 'Idle'}, input = {value: ''};
  let instance, painted = 0;
  class Speech {
    constructor() { instance = this; this.starts = 0; this.stops = 0; }
    start() { this.starts++; }
    stop() { this.stops++; }
    abort() {}
  }
  const sandbox = {
    window: {SpeechRecognition: supported ? Speech : null},
    document: {getElementById: id => id === 'wsMic' ? mic : sub, documentElement: {lang: 'hr'}},
    addEventListener() {}, input, paint: () => painted++
  };
  vm.runInNewContext(source.slice(start, end), sandbox);
  return {mic, sub, input, events, attrs, classes, get instance() {return instance;}, get painted() {return painted;}};
}

test('workshop listening state follows real recognition and spoken text searches inventory', () => {
  const h = setup(true);
  h.events.click();
  assert.equal(h.instance.starts, 1);
  assert.equal(h.classes.has('is-listening'), false, 'Do not pretend to listen before recognition starts');
  h.events.click();
  assert.equal(h.instance.starts, 1, 'Repeated clicks must not restart pending microphone permission');
  h.instance.onstart();
  assert.equal(h.classes.has('is-listening'), true);
  assert.equal(h.attrs['aria-pressed'], 'true');
  h.instance.onresult({results: [[{transcript: 'DU123AB'}]]});
  assert.equal(h.input.value, 'DU123AB');
  assert.equal(h.painted, 1);
  h.events.click();
  assert.equal(h.instance.stops, 1);
  h.instance.onend();
  assert.equal(h.classes.has('is-listening'), false);
  assert.equal(h.attrs['aria-pressed'], 'false');
});

test('microphone errors and unsupported browsers offer a truthful typed-search fallback', () => {
  const h = setup(true);
  h.events.click();
  h.instance.onstart();
  h.instance.onerror();
  assert.equal(h.classes.has('is-listening'), false);
  assert.match(h.sub.textContent, /nije uspjelo/);
  h.instance.onend();
  assert.match(h.sub.textContent, /nije uspjelo/, 'End event must retain the error explanation');
  const unsupported = setup(false);
  assert.equal(unsupported.mic.disabled, true);
  assert.match(unsupported.sub.textContent, /nije podržano/);
  assert.equal(unsupported.events.click, undefined);
});
