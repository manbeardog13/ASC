/* ============================================================================
   agent-gemini.js — the PREVIEW's Gemini brain (client half).
   Talks to the asc-agent-demo edge function (which holds the key + calls Gemini),
   runs the model's tool calls HERE against the demo dataset + real page actions,
   and feeds results back until Gemini gives a final answer. Also tells Gemini
   what's ON SCREEN (open customer / set) so "generate a sticker / everything
   about this user" acts on what you're doing. Exposes window.ASCAgent.
   ============================================================================ */
(function () {
  'use strict';

  // ---- demo dataset (mirrors customers.html + qr.js) --------------------------
  var OWN = { marko:'Marko Babić', ana:'Ana Kovačević', ivan:'Ivan Perić', petra:'Petra Novak', luka:'Luka Marić', josip:'Josip Horvat', ivana:'Ivana Jurić' };
  var PHONE = { marko:'095 455 6677', ana:'098 881 2244', ivan:'091 234 5678', petra:'091 662 1180', luka:'099 733 2091', josip:'098 234 7788', ivana:'' };
  function s(code, uid, plate, vehicle, season, status, loc){ return { code:code, uid:uid, who:OWN[uid], plate:plate, vehicle:vehicle, season:season, status:status, loc:loc||'' }; }
  var SETS = [
    s('ASC-2026-0248','ivan','DU-234-AB','VW Golf VII','winter','in_storage','Zona A · Regal 4 · Polica 2 · Mjesto 12'),
    s('ASC-2026-0247','ana','DU-881-KL','Škoda Octavia','summer','in_storage','Zona B · Regal 1 · Polica 4'),
    s('ASC-2026-0250','ana','DU-410-AK','BMW X1','winter','in_storage','Zona B · Regal 3 · Polica 1'),
    s('ASC-2026-0251','ana','DU-233-AN','Fiat 500','all_season','reserved',''),
    s('ASC-2026-0246','marko','DU-455-MN','Audi A4','winter','in_storage','Zona A · Regal 3 · Polica 2'),
    s('ASC-2026-0231','marko','DU-902-MB','VW Passat','summer','in_storage','Zona A · Regal 2'),
    s('ASC-2026-0245','petra','DU-662-PP','Renault Clio','all_season','in_storage','Zona C · Regal 2 · Polica 1'),
    s('ASC-2026-0244','luka','DU-733-XY','BMW 320d','summer','in_storage','Zona B · Regal 4 · Polica 3'),
    s('ASC-2026-0243','josip','DU-118-JH','Mercedes C220','winter','in_storage','Zona A · Regal 5 · Mjesto 7'),
    s('ASC-2026-0239','ivana','DU-509-IJ','Toyota RAV4','summer','in_storage','Zona B · Regal 2'),
    s('ASC-2026-0142','ivan','DU-234-AB','VW Golf VII','summer','checked_out',''),
    s('ASC-2026-0121','ivana','DU-509-IJ','Toyota RAV4','winter','reserved','')
  ];
  var SEASON = { winter:'zimske', summer:'ljetne', all_season:'cjelogodišnje' };
  var STATUS = { in_storage:'na skladištu', reserved:'rezervirano', checked_out:'preuzeto' };
  var byCode = {}; SETS.forEach(function(x){ byCode[x.code] = x; });
  function uidByName(name){ name = (name||'').toLowerCase().trim(); for (var k in OWN) if (OWN[k].toLowerCase() === name) return k; for (var k2 in OWN) if (OWN[k2].toLowerCase().indexOf(name) !== -1) return k2; return null; }
  function fmt(x){ return x.code + ' — ' + x.who + ', ' + x.vehicle + ' ' + x.plate + ', ' + SEASON[x.season] + ', ' + STATUS[x.status] + (x.loc ? ', ' + x.loc : ''); }

  // ---- tool executors (return {result, after?}) -------------------------------
  var pendingNav = null, navTimer = null;                  // navigations run AFTER the reply shows (cancellable)
  function nav(url){ pendingNav = url; return 'Otvaram: ' + url; }
  var TOOLS = {
    search_sets: function (a) {
      var q = (a.query || '').toLowerCase().trim();
      var hits = SETS.filter(function (x) { return (x.code + ' ' + x.who + ' ' + x.plate + ' ' + x.vehicle + ' ' + SEASON[x.season] + ' ' + x.loc).toLowerCase().indexOf(q) !== -1; });
      return { result: hits.length ? (hits.length + ' rezultata:\n' + hits.slice(0, 8).map(fmt).join('\n')) : ('Ništa za "' + a.query + '".') };
    },
    get_set: function (a) { var x = byCode[(a.code || '').toUpperCase().trim()]; return { result: x ? fmt(x) : ('Nema seta ' + a.code + '.') }; },
    inventory_overview: function () {
      var st = SETS.filter(function (x){return x.status==='in_storage';}).length, rs = SETS.filter(function (x){return x.status==='reserved';}).length, co = SETS.filter(function (x){return x.status==='checked_out';}).length;
      var cust = Object.keys(OWN).length;
      return { result: 'Na skladištu: ' + st + '. Rezervirano: ' + rs + '. Preuzeto: ' + co + '. Kupaca: ' + cust + '. Ukupno setova: ' + SETS.length + '.' };
    },
    due_pickups: function () {
      var due = SETS.filter(function (x){return x.status==='reserved';});
      return { result: due.length ? ('Za preuzimanje: ' + due.map(function(x){return x.who+' '+x.code+' ('+x.plate+')';}).join('; ')) : 'Nema zakazanih preuzimanja.' };
    },
    open_customer: function (a) {
      var uid = a.id || uidByName(a.name) || (currentCtx().customerId) || null;
      if (!uid) return { result: 'Ne znam kojeg kupca — reci ime.' };
      return { result: nav('customers.html?id=' + encodeURIComponent(uid)) + ' (' + (OWN[uid] || uid) + ')' };
    },
    open_set: function (a) { var c = (a.code || currentCtx().setCode || '').toUpperCase().trim(); if (!c) return { result: 'Koji set?' }; return { result: nav('set-detail.html?code=' + encodeURIComponent(c)) }; },
    generate_sticker: function (a) {
      var c = (a.code || currentCtx().setCode || '').toUpperCase().trim();
      if (!c) return { result: 'Za koji set naljepnicu?' };
      if (window.ASCQR && window.qrcode) { window.ASCQR.printSticker(c); return { result: 'Naljepnica za ' + c + ' je generirana (otvara se ispis).' }; }
      return { result: nav('set-detail.html?code=' + encodeURIComponent(c)) + ' — tamo je gumb Naljepnica.' };
    },
    create_tire_set: function (a) {
      try { sessionStorage.setItem('asc.prefill', JSON.stringify(a)); } catch (e) {}
      return { result: nav('checkin.html?prefill=1') + ' — obrazac za zaprimanje otvoren i popunjen: ' + (a.customer_name || '') + (a.plate ? ', ' + a.plate : '') + (a.season ? ', ' + SEASON[a.season] : '') + (a.quantity ? ', ' + a.quantity + ' kom' : '') + '. Provjeri i potvrdi.' };
    }
  };

  // ---- what's on screen -------------------------------------------------------
  function currentCtx() {
    var out = { page: (location.pathname.split('/').pop() || 'dashboard.html').replace('.html', ''), customerId: null, setCode: null, text: '' };
    try {
      var qp = new URLSearchParams(location.search);
      if (qp.get('code')) out.setCode = (qp.get('code') || '').toUpperCase();
      if (qp.get('id')) out.customerId = qp.get('id');
      var openCust = document.querySelector('.disc-cust[data-open="true"] .disc-titles span');
      if (openCust) { out.text = 'kupac ' + openCust.textContent.trim(); var uid = uidByName(openCust.textContent.trim()); if (uid) out.customerId = uid; }
      var codeEl = document.querySelector('.detail-head .code');
      if (codeEl && out.page === 'set-detail') { out.setCode = codeEl.textContent.trim(); var st = byCode[out.setCode]; out.text = 'set ' + out.setCode + (st ? ' (' + st.who + ')' : ''); }
      if (!out.text && out.customerId) out.text = 'kupac ' + (OWN[out.customerId] || out.customerId);
    } catch (e) {}
    return out;
  }
  function contextLine() {
    var c = currentCtx(), bits = ['Stranica: ' + c.page];
    if (c.text) bits.push('Otvoreno: ' + c.text);
    else if (c.customerId) bits.push('Kupac: ' + (OWN[c.customerId] || c.customerId) + ' (id ' + c.customerId + ')');
    else if (c.setCode) bits.push('Set: ' + c.setCode);
    return bits.join('. ');
  }

  // ---- conversation loop ------------------------------------------------------
  var history = [];
  function reset() { history = []; }
  function configured() { return !!(window.ASC_AGENT_URL && String(window.ASC_AGENT_URL).trim()); }

  // ask(text, onEvent): onEvent({type:'thinking'|'tool'|'text'|'error', ...}).
  // Resolves with the final assistant text (also runs any deferred navigation).
  async function ask(text, onEvent) {
    if (!configured()) throw new Error('not_configured');
    onEvent && onEvent({ type: 'thinking' });
    history.push({ role: 'user', content: String(text) });
    pendingNav = null;
    var url = String(window.ASC_AGENT_URL).trim(), guard = 0, finalText = '';
    while (guard++ < 6) {
      var res;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history.slice(-40), context: contextLine() }) });
      } catch (e) { onEvent && onEvent({ type: 'error', message: 'Nema veze s agentom.' }); throw e; }
      if (!res.ok) {
        var em = res.status === 429 ? 'Gemini je zauzet — pokušaj za koji tren.' : (res.status === 503 ? 'Agent nije konfiguriran (nedostaje ključ).' : 'Agent trenutno ne radi.');
        onEvent && onEvent({ type: 'error', message: em }); throw new Error('http_' + res.status);
      }
      var data = await res.json();
      var content = data.content || [];
      history.push({ role: 'assistant', content: content });
      var textParts = content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; });
      if (textParts.length) { finalText = textParts.join(' ').trim(); onEvent && onEvent({ type: 'text', text: finalText }); }
      if (data.stop_reason !== 'tool_use') break;
      // run each tool call, feed results back
      var results = [];
      content.filter(function (b) { return b.type === 'tool_use'; }).forEach(function (b) {
        onEvent && onEvent({ type: 'tool', name: b.name, input: b.input });
        var fn = TOOLS[b.name], out;
        try { out = fn ? fn(b.input || {}) : { result: 'Nepoznat alat.' }; } catch (e) { out = { result: 'Greška u alatu.' }; }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: out.result });
      });
      history.push({ role: 'user', content: results });
    }
    if (pendingNav) { var go = pendingNav; pendingNav = null; navTimer = setTimeout(function () { navTimer = null; location.href = go; }, 650); }   // navigate after the reply shows
    return finalText;
  }
  // dismissing the agent (or editing beneath it) cancels a queued navigation.
  function cancel() { if (navTimer) { clearTimeout(navTimer); navTimer = null; } pendingNav = null; }

  window.ASCAgent = { ask: ask, reset: reset, cancel: cancel, configured: configured, context: contextLine };
})();
