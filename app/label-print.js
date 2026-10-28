// label-print.js: mandatory QR label printing at check-in (rebuild brief 07).
// Printers come from the Nero print bridge when one is configured
// (window.ASC_PRINT_BRIDGE, same-origin when Nero Summit serves ASC), else the
// system print dialog. The chosen printer is remembered per site. Check-in is
// complete only once the label printed (bridge OK, or the user confirms the
// system print) or the user explicitly retried after a failure.
//
// Bridge contract: GET  {bridge}/printers -> {printers:[{id,name,online}]}
//                  POST {bridge}/print {printer,code,test,label:{who,plate,season}} -> {ok:true}|{ok:false,error}
import { t } from '../js/i18n.js';

const SYSTEM = 'system';
const siteKey = () => 'asc.printer.' + location.host;
const bridgeUrl = () => (typeof window.ASC_PRINT_BRIDGE === 'string' && window.ASC_PRINT_BRIDGE) || '';

async function withTimeout(promise, ms) {
  let timer; const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer); }
}

export async function discoverPrinters() {
  const list = [{ id: SYSTEM, name: t('print.system'), online: true }];
  const base = bridgeUrl();
  if (!base) return { list, bridge: 'none' };
  try {
    const res = await withTimeout(fetch(base.replace(/\/$/, '') + '/printers', { credentials: 'include' }), 2500);
    if (!res.ok) throw new Error('http ' + res.status);
    const body = await res.json();
    const found = Array.isArray(body.printers) ? body.printers.filter((p) => p && p.id && p.name) : [];
    return { list: found.concat(list), bridge: 'ok' };
  } catch (e) { return { list, bridge: 'offline' }; }
}

function systemPrint(code, label) {
  return new Promise((resolve) => {
    if (!window.ASCQR) { resolve('failed'); return; }
    window.ASCQR.printSticker(code, label);
    let done = false;
    const after = () => { if (done) return; done = true; removeEventListener('afterprint', after); resolve('confirm'); };
    addEventListener('afterprint', after);
    try { window.print(); } catch (e) { after(); }
    setTimeout(after, 60000);
  });
}

async function bridgePrint(printer, code, label, test) {
  try {
    const res = await withTimeout(fetch(bridgeUrl().replace(/\/$/, '') + '/print', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer, code, test: !!test, label }),
    }), 15000);
    const body = await res.json().catch(() => ({}));
    return res.ok && body.ok ? 'printed' : (res.status >= 500 || res.status === 404 ? 'offline' : 'failed');
  } catch (e) { return 'offline'; }
}

// Renders the print block into `host` and calls onComplete(reason) once the
// label printed or the user retried after a problem. Returns nothing.
export function mountLabelPrint(host, { code, label, onComplete }) {
  const box = document.createElement('div');
  box.className = 'lp';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('print.group'));
  const row = document.createElement('div'); row.className = 'lp-row';
  const select = document.createElement('select'); select.className = 'lp-select'; select.setAttribute('aria-label', t('print.printer'));
  const test = document.createElement('button'); test.type = 'button'; test.className = 'btn ghost'; test.textContent = t('print.test');
  const go = document.createElement('button'); go.type = 'button'; go.className = 'btn btn-primary'; go.textContent = t('print.print');
  row.append(select, test, go);
  const status = document.createElement('p'); status.className = 'lp-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'lp-actions';
  box.append(row, status, actions);
  host.append(box);

  let completed = false, hadProblem = false;
  const complete = (reason) => { if (completed) return; completed = true; box.dataset.state = 'done'; onComplete && onComplete(reason); };
  const setState = (state, extra) => {
    box.dataset.state = state;
    status.textContent = t('print.' + state, extra);
    actions.replaceChildren();
    if (state === 'none' || state === 'offline' || state === 'failed') {
      hadProblem = true;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn'; retry.textContent = t('print.retry');
      retry.addEventListener('click', () => { if (hadProblem) complete('retried'); state === 'failed' ? print(false) : refresh(); });
      actions.append(retry);
    }
    if (state === 'confirm') {
      const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'btn btn-primary'; yes.textContent = t('print.confirmYes');
      const no = document.createElement('button'); no.type = 'button'; no.className = 'btn ghost'; no.textContent = t('print.confirmNo');
      yes.addEventListener('click', () => { setState('printed'); complete('printed'); });
      no.addEventListener('click', () => setState('failed'));
      actions.append(yes, no);
    }
    go.disabled = test.disabled = state === 'searching' || state === 'printing';
  };

  async function refresh() {
    setState('searching');
    const { list, bridge } = await discoverPrinters();
    select.replaceChildren(...list.map((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name + (p.online === false ? ' · ' + t('print.offlineTag') : ''); return o; }));
    let saved = null; try { saved = localStorage.getItem(siteKey()); } catch (e) {}
    if (saved && list.some((p) => p.id === saved)) select.value = saved;
    else if (list.length > 1) select.value = list[0].id;
    if (bridge === 'offline') setState('offline');
    else if (bridge === 'ok' && list.length === 1) setState('none');
    else if (select.value === SYSTEM) setState('readySystem');
    else setState('ready', { name: select.selectedOptions[0]?.textContent || '' });
  }

  async function print(isTest) {
    const printer = select.value || SYSTEM;
    try { localStorage.setItem(siteKey(), printer); } catch (e) {}
    setState('printing');
    const result = printer === SYSTEM ? await systemPrint(isTest ? 'TEST' : code, label) : await bridgePrint(printer, isTest ? 'TEST' : code, label, isTest);
    if (isTest) { setState(result === 'printed' || result === 'confirm' ? 'testOk' : result); return; }
    setState(result);
    if (result === 'printed') complete('printed');
  }

  select.addEventListener('change', () => {
    try { localStorage.setItem(siteKey(), select.value); } catch (e) {}
    if (box.dataset.state === 'ready' || box.dataset.state === 'readySystem') select.value === SYSTEM ? setState('readySystem') : setState('ready', { name: select.selectedOptions[0]?.textContent || '' });
  });
  test.addEventListener('click', () => print(true));
  go.addEventListener('click', () => print(false));
  refresh();
}
