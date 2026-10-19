// Headless load of the main ASC pages. Fails on an uncaught exception or
// when the expected heading is missing. Supabase is stubbed so the check
// does not touch production and does not need a session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
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
  loadMyProfile: 'export const loadMyProfile=async()=>({full_name:"Smoke",role:"employee",email:"smoke@example.com",onboarded_at:null});',
  createStorageSet: 'export const createStorageSet=async()=>"ASC-2026-0099";',
  countLocations: 'export const countLocations=async()=>location.pathname.endsWith("/place.html")?1:0;',
  listLocationSeats: `export const listLocationSeats=async()=>{
    const tour=new URLSearchParams(location.search).get("tour");
    if (tour==="zone") return [{warehouse:"main",zone:"1",rack:"A",shelf:"",slot:"01",status:"occupied"},{warehouse:"main",zone:"2.1",rack:"A",shelf:"",slot:"03",status:"free"}];
    if (tour==="next") return [{warehouse:"main",zone:"1",rack:"A",shelf:"",slot:"01",status:"occupied"},{warehouse:"main",zone:"2.1",rack:"A",shelf:"",slot:"01",status:"occupied"},{warehouse:"main",zone:"2.2",rack:"A",shelf:"",slot:"01",status:"free"}];
    return [];
  };`,
  findLocationByQr: 'export const findLocationByQr=async()=>null;',
  loadStorageSet: 'export const loadStorageSet=async()=>({id:"1",public_code:"ASC-2026-0003",status:"in_storage",vehicle:{plate:"DU100AA",customer:{name:"Ana"}}});',
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
  ['/app/dashboard.html', 'Ploča', '() => { const root=document.getElementById("asc-onboard"); return Boolean(root && root.querySelector("[data-next]") && !root.querySelector("[data-skip]") && root.innerText.includes("Najprije stvori mjesto")); }'],
  ['/app/dashboard.html?tour=zone', 'Ploča', '() => { const root=document.getElementById("asc-onboard"); const text=root?root.innerText:""; return Boolean(root && text.includes("Zona 2.1") && !text.includes("Najprije stvori mjesto")); }'],
  ['/app/dashboard.html?tour=next', 'Ploča', '() => { const root=document.getElementById("asc-onboard"); const text=root?root.innerText:""; return Boolean(root && text.includes("Zona 2.2") && !text.includes("Zona 1") && !text.includes("Najprije stvori mjesto")); }'],
  ['/app/checkin.html', 'Spremi gume', `async () => {
    const loc=document.getElementById("locField");
    const steps=document.getElementById("flowSteps");
    if (!(loc && loc.hidden && steps && steps.children.length===3)) return false;
    if (window.__ascSmoke && window.__ascSmoke.done) return true;
    if (window.__ascSmoke && window.__ascSmoke.started) return false;
    window.__ascSmoke = { started: true, done: false };
    const name=document.getElementById("c_name");
    const plate=document.getElementById("v_plate");
    if (!name || !plate) return false;
    name.value = "Ana Horvat";
    plate.value = "DU100AA";
    document.getElementById("ci").requestSubmit();
    document.getElementById("ci").requestSubmit();
    for (let i = 0; i < 40; i++) {
      const link = document.getElementById("slot-block-go");
      const href = link ? (link.getAttribute("href") || "") : "";
      let back = "";
      try { back = decodeURIComponent(href.split("return=")[1] || ""); } catch (e) { back = ""; }
      if (href.startsWith("locations.html?return=") && back === "checkin.html?place=ASC-2026-0099") {
        window.__ascSmoke.done = true;
        return true;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }`],
  ['/app/scan.html', 'Skeniraj naljepnicu'],
  ['/app/place.html', 'Smjesti komplet', '() => Boolean(document.getElementById("flow-reader"))'],
  ['/app/place.html?set=ASC-2026-0003#/slot/LOC-DEADBEEF0001', 'Smjesti komplet', `async () => {
    for (let i = 0; i < 40; i++) {
      const link = document.getElementById("slot-block-go");
      const href = link ? (link.getAttribute("href") || "") : "";
      let back = "";
      try { back = decodeURIComponent(href.split("return=")[1] || ""); } catch (e) { back = ""; }
      const title = document.getElementById("slotBlock");
      if (title && title.innerText.includes("Nepoznata naljepnica") && back === "place.html?set=ASC-2026-0003") return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }`],
  ['/app/checkout.html', 'Preuzmi komplet', '() => Boolean(document.getElementById("flow-reader"))'],
  ['/app/locate.html', 'Pronađi komplet', '() => Boolean(document.querySelector("#flow-root input"))'],
  ['/app/locations.html', 'Naljepnice mjesta', '() => Boolean(document.getElementById("loc-zone"))'],
  ['/app/locations.html?return=' + encodeURIComponent('checkin.html?place=ASC-2026-0099'), 'Natrag na zaprimanje', '() => { const a=document.getElementById("back-to-intake"); return Boolean(a && a.getAttribute("href")==="checkin.html?place=ASC-2026-0099"); }'],
  ['/app/warehouse-preview/index.html', 'Prostorni pregled', '() => document.querySelectorAll("#asc-navigation a").length===11'],
];

function which(name) {
  try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function isSnapShim(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(180);
    const n = fs.readSync(fd, buf, 0, 180, 0);
    fs.closeSync(fd);
    const head = buf.subarray(0, n).toString('utf8');
    if (head.includes('\0')) return false;
    return head.includes('snap');
  } catch {
    return false;
  }
}

function chromeBin() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    which('google-chrome-stable'),
    which('google-chrome'),
    which('chrome'),
    which('chromium'),
    which('chromium-browser'),
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file) && !isSnapShim(file));
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
if (!bin) { console.error('smoke-pages: no Chrome/Chromium binary (snap shims are ignored)'); process.exit(1); }

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
fs.rmSync('/tmp/asc-smoke-chrome', { recursive: true, force: true });
const chrome = spawn(bin, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9333',
  '--remote-allow-origins=*', '--user-data-dir=/tmp/asc-smoke-chrome', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeLog = '';
chrome.stderr.on('data', (chunk) => { chromeLog = (chromeLog + chunk.toString()).slice(-1500); });
try {
  let version;
  for (let i = 0; i < 50; i++) {
    try { version = await (await fetch('http://127.0.0.1:9333/json/version')).json(); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  if (!version?.webSocketDebuggerUrl) {
    throw new Error('Chrome DevTools did not start (' + bin + '): ' + chromeLog.replace(/\s+/g, ' ').slice(0, 400));
  }
  const failures = [];
  for (const [page, expected, check] of pages) {
    const tab = await (await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent(origin + page), { method: 'PUT' })).json();
    const result = await cdp(tab.webSocketDebuggerUrl, 'document.body ? document.body.innerText : ""');
    let behavior = true;
    if (check) {
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
      let id = 0;
      const pending = new Map();
      ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) pending.get(message.id)(message);
      });
      const send = (method, params = {}) => new Promise((resolve) => {
        const next = ++id;
        pending.set(next, resolve);
        ws.send(JSON.stringify({ id: next, method, params }));
      });
      const started = Date.now();
      behavior = false;
      while (Date.now() - started < 8000) {
        const evaluated = await send('Runtime.evaluate', {
          expression: `(${check})()`,
          returnByValue: true,
          awaitPromise: true,
        });
        if (evaluated.result?.result?.value === true) { behavior = true; break; }
        if (evaluated.result?.exceptionDetails) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
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
