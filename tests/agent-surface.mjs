import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const dash = readFileSync(new URL('../app/dashboard.html', import.meta.url), 'utf8');
const nero = readFileSync(new URL('../nero-design-studio/agent-card.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');

test('the purple card is the original shaped window, copied into Nero', () => {
  assert.match(dash, /@keyframes agAurora/);
  assert.match(dash, /border-radius:11px/);
  assert.match(dash, /linear-gradient\(135deg,#8b5cf6,#e040d0\)/);
  assert.match(dash, /id="agentHook3"/);
  assert.match(dash, /<section class="agent-card" id="agentCard"/);
  assert.match(nero, /border-radius:11px/);
  assert.match(nero, /linear-gradient\(135deg,#8b5cf6,#e040d0\)/);
  assert.match(appCss, /@keyframes aiDrift/);
  assert.doesNotMatch(dash, /agent-dust|nineDust|#d7bfef/);
  assert.doesNotMatch(appCss, /nine-studio|nineDust/);
  assert.equal(existsSync(new URL('../nine-studio/tenant.js', import.meta.url)), false);
});

test('Nero is the card on the board and a carved line on every page', () => {
  assert.match(dash, /id="agentTab">Nero</);
  assert.match(dash, /aria-label="Nero"/);
  assert.match(dash, /placeholder="Pitaj Nero…"/);
  assert.match(dash, /Powered by <a href="https:\/\/nerosummit.com">Nero Summit<\/a>/);
  assert.doesNotMatch(dash, /composer\.js/);
  const composer = readFileSync(new URL('../app/composer.js', import.meta.url), 'utf8');
  // The shared composer shows on every page, the dashboard included (2026-10-17).
  assert.doesNotMatch(composer, /getElementById\('agentCard'\)/);
  assert.match(composer, /getElementById\('neroComposer'\)/);
  assert.match(composer, /Pitaj Nero/);
  assert.match(dash, /html\.has-composer #agentCard \.text-bubble\{display:none\}/);
  const pages = [
    'app/checkin.html', 'app/login.html', 'app/customers.html', 'app/scan.html',
    'app/workshop.html', 'app/reminders.html', 'app/users.html', 'app/recycle.html',
    'app/set-detail.html', 'app/place.html', 'app/checkout.html', 'app/locate.html',
    'app/locations.html', 'app/warehouse.html', 'app/sastanak-skladiste.html',
    'app/warehouse-preview/index.html', 'index.html',
  ];
  for (const file of pages) {
    const html = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    assert.match(html, /Powered by <a href="https:\/\/nerosummit.com">Nero Summit<\/a>/, file);
  }
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  assert.match(app, /agentCard/);
  assert.match(app, /composer\.js/);
  assert.doesNotMatch(app, /getElementById\('agentCard'\) \|\| \/\\\/login/);
});

test('free gemini stays on and the local assistant is gone', () => {
  const config = readFileSync(new URL('../app/agent-config.js', import.meta.url), 'utf8');
  assert.match(config, /ASC_AGENT_REMOTE_ALLOWED = true/);
  assert.match(dash, /remote: true/);
  for (const file of [
    'app/assistant-local.js',
    'app/assistant-surface.js',
    'app/assistant-surface.css',
    'app/warehouse-preview/assistant-adapter.js',
  ]) assert.equal(existsSync(new URL('../' + file, import.meta.url)), false);
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /installNineAgent|nine-studio/);
  const checkin = readFileSync(new URL('../app/checkin.html', import.meta.url), 'utf8');
  assert.doesNotMatch(checkin, /sluhBtn|asc-agent|Drži i govori/);
  const spa = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(spa, /\/assistant/);
  assert.equal(existsSync(new URL('../js/views/assistant.js', import.meta.url)), false);
});
