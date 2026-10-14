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
const session = '{user:{id:"smoke",email:"smoke@example.com"},expires_at:Math.floor(Date.now()/1000)+3600}';
const auth = `const session=${session};export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({}),signOut:async()=>{}}};`;
const db = `const session=${session};
const ok=async()=>[];
export const getSession=async()=>session;
export const loadMyProfile=async()=>({full_name:'Smoke',role:'employee',email:'smoke@example.com'});
export const signOut=async()=>{};
export const onAuthChange=()=>({data:{subscription:{unsubscribe(){}}}});
export const healthStats=async()=>({inventory:0,todayCheckIns:0,todayPickups:0,lastBackup:null});
export const countsByStatus=async()=>({in_storage:0,reserved:0,checked_out:0,missing:0});
export const listStorageSets=${'async()=>[]'};
export const listCustomers=ok;
export const listRecycleBin=ok;
export const subscribeToChanges=()=>null;
export const unsubscribe=()=>{};
export const countPendingApprovals=async()=>0;
export const loadStorageSet=async()=>{const error=new Error('missing');throw error;};
export const suggestFreeSlot=async()=>null;
export const createLocations=async()=>[];
export const placeSet=async()=>({ok:true});
export const moveSet=async()=>({ok:true});
export const checkoutSet=async()=>({ok:true});
export const setMyAvatar=async()=> '';
export const findLocationByQr=async()=>null;
export const locationLabel=()=>'';
`;

const pages = [
  ['/app/login.html', 'Dobrodošli natrag'],
  ['/app/dashboard.html', 'Ploča'],
  ['/app/checkin.html', 'Spremi gume'],
  ['/app/scan.html', 'Skeniraj naljepnicu'],
  ['/app/place.html', 'Smjesti komplet'],
  ['/app/checkout.html', 'Preuzmi komplet'],
  ['/app/locate.html', 'Pronađi komplet'],
  ['/app/locations.html', 'Naljepnice mjesta'],
  ['/app/warehouse-preview/index.html', 'Prostorni pregled'],
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
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(redact(message.params?.exceptionDetails?.text || message.params?.exceptionDetails?.exception?.description));
  });
  const send = (method, params = {}) => new Promise((resolve) => { const next = ++id; pending.set(next, resolve); ws.send(JSON.stringify({ id: next, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise((resolve) => setTimeout(resolve, 1600));
  const evaluated = await send('Runtime.evaluate', { expression, returnByValue: true });
  ws.close();
  return { text: evaluated.result?.result?.value || '', exceptions };
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
  for (const [page, expected] of pages) {
    const tab = await (await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent(origin + page))).json();
    const result = await cdp(tab.webSocketDebuggerUrl, 'document.body ? document.body.innerText : ""');
    await fetch('http://127.0.0.1:9333/json/close/' + tab.id).catch(() => {});
    if (result.exceptions.length) failures.push(page + ' exception: ' + result.exceptions[0]);
    if (!result.text.includes(expected)) failures.push(page + ' missing expected text');
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log('smoke-pages: ' + pages.length + ' pages loaded');
} finally {
  chrome.kill('SIGTERM');
  await new Promise((resolve) => server.close(resolve));
}
