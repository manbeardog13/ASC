/* ============================================================================
   agent-gemini.js — the LIVE staging Gemini brain (client half).
   Talks to the asc-agent-demo edge function (which holds the key + calls Gemini),
   runs the model's tool calls HERE against the REAL Supabase data (../js/db.js)
   + real page actions, and feeds results back until Gemini gives a final answer.
   Also tells Gemini what's ON SCREEN (open customer / set) so "generate a
   sticker / everything about this user" acts on what you're doing.
   Exposes window.ASCAgent.
   ============================================================================ */
(function () {
  'use strict';

  // ---- live data (Supabase via ../js/db.js — lazy, briefly cached) -----------
  var dbP = null;
  function db(){ return dbP || (dbP = import('../js/db.js')); }
  var setsCache = { t: 0, rows: null };
  async function loadSets(){
    if (setsCache.rows && Date.now() - setsCache.t < 15000) return setsCache.rows;
    var m = await db();
    var rows = await m.listStorageSets();
    setsCache = { t: Date.now(), rows: rows };
    return rows;
  }
  var UNAVAILABLE = 'Podaci trenutno nisu dostupni.';
  var SEASON = { winter:'zimske', summer:'ljetne', all_season:'cjelogodišnje' };
  var STATUS = { in_storage:'na skladištu', reserved:'rezervirano', checked_out:'preuzeto', missing:'nedostaje' };
  function locOf(x){ return [x.zone, x.rack, x.shelf, x.slot].filter(Boolean).join(' · '); }
  function fmt(x){
    var v = x.vehicle || {}, c = v.customer || {};
    var car = [v.make, v.model].filter(Boolean).join(' ');
    return x.public_code + ' — ' + (c.name || 'nepoznat kupac')
      + (car ? ', ' + car : '') + (v.plate ? ' ' + v.plate : '')
      + ', ' + (SEASON[x.season] || x.season || '')
      + ', ' + (STATUS[x.status] || x.status || '')
      + (locOf(x) ? ', ' + locOf(x) : '');
  }

  // ---- tool executors (return {result, after?}; may be async) -----------------
  var pendingNav = null, navTimer = null;                  // navigations run AFTER the reply shows (cancellable)
  function nav(url){ pendingNav = url; return 'Otvaram: ' + url; }
  var TOOLS = {
    search_sets: async function (a) {
      var rows;
      try { rows = await loadSets(); } catch (e) { console.warn('[live] agent search_sets failed:', e); return { result: UNAVAILABLE }; }
      if (!rows.length) return { result: 'Skladište je prazno — još nema setova.' };
      var q = (a.query || '').toLowerCase().trim();
      var hits = rows.filter(function (x) {
        var v = x.vehicle || {}, c = v.customer || {};
        var hay = [x.public_code, c.name, c.phone, v.plate, v.make, v.model, SEASON[x.season], locOf(x)]
          .concat((x.tires || []).map(function (t) { return (t.size || '') + ' ' + (t.brand || ''); }))
          .join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
      return { result: hits.length ? (hits.length + ' rezultata:\n' + hits.slice(0, 8).map(fmt).join('\n')) : ('Ništa za "' + a.query + '".') };
    },
    get_set: async function (a) {
      var code = (a.code || '').toUpperCase().trim();
      if (!code) return { result: 'Koji set?' };
      var rows;
      try { rows = await loadSets(); } catch (e) { console.warn('[live] agent get_set failed:', e); return { result: UNAVAILABLE }; }
      var x = rows.filter(function (r) { return String(r.public_code || '').toUpperCase() === code; })[0];
      return { result: x ? fmt(x) : ('Nema seta ' + code + '.') };
    },
    inventory_overview: async function () {
      try {
        var m = await db();
        var r = await Promise.all([m.countsByStatus(), m.listCustomers()]);
        var c = r[0], cust = r[1].length, total = c.in_storage + c.reserved + c.checked_out + c.missing;
        if (!total && !cust) return { result: 'Skladište je prazno — još nema setova ni kupaca.' };
        return { result: 'Na skladištu: ' + c.in_storage + '. Rezervirano: ' + c.reserved + '. Preuzeto: ' + c.checked_out + '. Kupaca: ' + cust + '. Ukupno setova: ' + total + '.' };
      } catch (e) { console.warn('[live] agent inventory_overview failed:', e); return { result: UNAVAILABLE }; }
    },
    due_pickups: async function () {
      var rows;
      try { rows = await loadSets(); } catch (e) { console.warn('[live] agent due_pickups failed:', e); return { result: UNAVAILABLE }; }
      var in7 = new Date(Date.now() + 7 * 864e5);
      var due = rows
        .filter(function (x) { return x.status !== 'checked_out' && x.expected_out_date && new Date(x.expected_out_date) <= in7; })
        .sort(function (a, b) { return new Date(a.expected_out_date) - new Date(b.expected_out_date); });
      return { result: due.length ? ('Za preuzimanje: ' + due.slice(0, 8).map(function (x) {
        var v = x.vehicle || {}, c = v.customer || {};
        return (c.name || 'nepoznat kupac') + ' ' + x.public_code + (v.plate ? ' (' + v.plate + ')' : '')
          + ' — ' + new Date(x.expected_out_date).toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
      }).join('; ')) : 'Nema zakazanih preuzimanja.' };
    },
    open_customer: async function (a) {
      var id = a.id || null, label = '';
      if (!id) {
        var name = (a.name || '').trim();
        if (name) {
          var all;
          try { all = await (await db()).listCustomers(); } catch (e) { console.warn('[live] agent open_customer failed:', e); return { result: UNAVAILABLE }; }
          if (!all.length) return { result: 'Još nema kupaca u bazi.' };
          var low = name.toLowerCase();
          var hit = all.filter(function (c) { return (c.name || '').toLowerCase() === low; })[0]
                 || all.filter(function (c) { return (c.name || '').toLowerCase().indexOf(low) !== -1; })[0];
          if (!hit) return { result: 'Nema kupca "' + name + '".' };
          id = hit.id; label = hit.name;
        } else id = currentCtx().customerId;
      }
      if (!id) return { result: 'Ne znam kojeg kupca — reci ime.' };
      return { result: nav('customers.html?id=' + encodeURIComponent(id)) + (label ? ' (' + label + ')' : '') };
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
      if (openCust) out.text = 'kupac ' + openCust.textContent.trim();
      var codeEl = document.querySelector('.detail-head .code');
      if (codeEl && out.page === 'set-detail') { out.setCode = codeEl.textContent.trim(); out.text = 'set ' + out.setCode; }
    } catch (e) {}
    return out;
  }
  function contextLine() {
    var c = currentCtx(), bits = ['Stranica: ' + c.page];
    if (c.text) bits.push('Otvoreno: ' + c.text);
    else if (c.customerId) bits.push('Kupac id: ' + c.customerId);
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
      // run each tool call (data tools are async — real Supabase), feed results back
      var calls = content.filter(function (b) { return b.type === 'tool_use'; });
      var results = [];
      for (var i = 0; i < calls.length; i++) {
        var b = calls[i];
        onEvent && onEvent({ type: 'tool', name: b.name, input: b.input });
        var fn = TOOLS[b.name], out;
        try { out = fn ? await fn(b.input || {}) : { result: 'Nepoznat alat.' }; }
        catch (e) { console.warn('[live] agent tool failed:', e); out = { result: 'Greška u alatu.' }; }
        results.push({ type: 'tool_result', tool_use_id: b.id, content: out.result });
      }
      history.push({ role: 'user', content: results });
    }
    if (pendingNav) { var go = pendingNav; pendingNav = null; navTimer = setTimeout(function () { navTimer = null; location.href = go; }, 650); }   // navigate after the reply shows
    return finalText;
  }
  // dismissing the agent (or editing beneath it) cancels a queued navigation.
  function cancel() { if (navTimer) { clearTimeout(navTimer); navTimer = null; } pendingNav = null; }

  window.ASCAgent = { ask: ask, reset: reset, cancel: cancel, configured: configured, context: contextLine };
})();
