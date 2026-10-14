// Headless load of the main ASC pages. Fails on an uncaught exception or
// when the expected heading is missing. Supabase is stubbed so the check
// does not touch production and does not need a session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.jpg': 'image/jpeg' };
function exportNames(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Map();
  for (const match of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.set(match[1], 'fn');
  for (const match of src.matchAll(/export\s+(?:const|let|class)\s+(\w+)/g)) names.set(match[1], 'val');
  for (const match of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.set(name, 'fn');
    }
  }
  return names;
}
const session = '{user:{id:"smoke",email:"smoke@example.com"},expires_at:Math.floor(Date.now()/1000)+3600}';
const auth = `export function isConfigured(){return true;}
const session=${session};
export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({}),signOut:async()=>{},updateUser:async()=>({})}};`;
const dbOverrides = {
  getSession: 'export const getSession=async()=>session;',
  loadMyProfile: 'export const loadMyProfile=async()=>({full_name:"Smoke",role:"employee",email:"smoke@example.com"});',
  signOut: 'export const signOut=async()=>{};',
  onAuthChange: 'export const onAuthChange=()=>({data:{subscription:{unsubscribe(){}}}});',
  healthStats: 'export const healthStats=async()=>({inventory:0,todayCheckIns:0,todayPickups:0,lastBackup:null});',
  countsByStatus: 'export const countsByStatus=async()=>({in_storage:0,reserved:0,checked_out:0,missing:0});',
  listStorageSets: 'export const listStorageSets=async()=>[];',
  listCustomers: 'export const listCustomers=async()=>[];',
  listRecycleBin: 'export const listRecycleBin=async()=>[];',
  OWNER_EMAIL: 'export const OWNER_EMAIL="smoke@example.com";',
  ADMIN_ROLES: 'export const ADMIN_ROLES=["admin"];',
};
const db = `const session=${session};\n` + [...exportNames(path.join(root, 'js/db.js'))].map(([name, kind]) => (
  dbOverrides[name] || (kind === 'fn' ? `export const ${name}=async()=>null;` : `export const ${name}=null;`)
)).join('\n') + '\n';

const pages = [
  ['/app/login.html', ['Dobrodošli natrag', 'Ploča']],
  ['/app/dashboard.html', 'Ploča'],
  ['/app/checkin.html', 'Spremi gume', '() => { const loc=document.getElementById("locField"); const steps=document.getElementById("flowSteps"); return Boolean(loc && loc.hidden && steps && steps.children.length===3); }'],
  ['/app/scan.html', 'Skeniraj naljepnicu'],
  ['/app/place.html', 'Smjesti komplet', '() => Boolean(document.getElementById("flow-reader"))'],
  ['/app/checkout.html', 'Preuzmi komplet', '() => Boolean(document.getElementById("flow-reader"))'],
  ['/app/locate.html', 'Pronađi komplet', '() => Boolean(document.querySelector("#flow-root input"))'],
  ['/app/locations.html', 'Naljepnice mjesta', '() => Boolean(document.getElementById("loc-zone"))'],
  ['/app/warehouse-preview/index.html', 'Prostorni pregled', '() => document.querySelectorAll("#asc-navigation a").length===11'],
];

function chromeBin() {
  const candidates = [process.env.CHROMIUM_PATH, process.env.CHROME_PATH, '/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file));
}

function redact(text) {
  return String(text || '').replace(/eyJ[A-Za-z0-9_\-.]{20,}/g, '[redacted]').slice(0, 300);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/js/db.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(db); return; }
  if (url.pathname === '/js/supabaseClient.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(auth); return; }
  if (url.pathname.endsWith('/agent-config.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end('window.ASC_AGENT_URL="";'); return; }
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
  const file = path.resolve(root, rel.endsWith('/') ? rel + 'index.html' : rel);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, body) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  });
});

async function cdp(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message);
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails || {};
      exceptions.push(redact([details.exception?.description, details.url, details.lineNumber, details.text].filter(Boolean).join(' @ ')));
    }
  });
  const send = (method, params = {}) => new Promise((resolve) => { const next = ++id; pending.set(next, resolve); ws.send(JSON.stringify({ id: next, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  const started = Date.now();
  let text = '';
  while (Date.now() - started < 8000) {
    const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
    text = evaluated.result?.result?.value || '';
    if (text.trim()) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
  ws.close();
  return { text: evaluated.result?.result?.value || text, exceptions };
}

const bin = chromeBin();
if (!bin) { console.error('smoke-pages: no Chrome/Chromium binary'); process.exit(1); }

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const chrome = spawn(bin, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9333', '--user-data-dir=/tmp/asc-smoke-chrome', 'about:blank'], { stdio: 'ignore' });
try {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch('http://127.0.0.1:9333/json/version')).json(); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  if (!version?.webSocketDebuggerUrl) throw new Error('Chrome DevTools did not start');
  const failures = [];
  for (const [page, expected, check] of pages) {
    const tab = await (await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent(origin + page), { method: 'PUT' })).json();
    const result = await cdp(tab.webSocketDebuggerUrl, 'document.body ? document.body.innerText : ""');
    let behavior = true;
    if (check) {
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
      const evaluated = await new Promise((resolve) => {
        ws.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id === 1) resolve(message); });
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(${check})()`, returnByValue: true } }));
      });
      behavior = evaluated.result?.result?.value === true;
      ws.close();
    }
    await fetch('http://127.0.0.1:9333/json/close/' + tab.id).catch(() => {});
    const expectedText = Array.isArray(expected) ? expected : [expected];
    if (result.exceptions.length) failures.push(page + ' exception: ' + result.exceptions[0]);
    if (!expectedText.some((item) => result.text.includes(item))) failures.push(page + ' missing expected text');
    if (!behavior) failures.push(page + ' behavior check failed');
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log('smoke-pages: ' + pages.length + ' pages loaded');
} finally {
  chrome.kill('SIGTERM');
  await new Promise((resolve) => server.close(resolve));
}
