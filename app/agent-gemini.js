/* ASC's existing assistant client. Provider credentials remain on the server.
   Trusted page adapters can override known tools; guard async effects with
   assertActive(). No tool here saves a new storage set. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) script = Array.prototype.find.call(document.scripts || [], function (s) {
    return /\/agent-gemini\.js(?:[?#]|$)/.test(s.src || '');
  });
  var appBase = new URL('./', script && script.src || new URL('agent-gemini.js', document.baseURI).href);
  var dbP, searchP;
  function db() { return dbP || (dbP = import(new URL('../js/db.js', appBase).href)); }
  function search() { return searchP || (searchP = import(new URL('agent-search.js', appBase).href)); }
  var UNAVAILABLE = 'Podaci trenutno nisu dostupni.';
  var SEASON = { winter: 'zimske', summer: 'ljetne', all_season: 'cjelogodišnje' };
  var STATUS = { in_storage: 'na skladištu', reserved: 'rezervirano', checked_out: 'preuzeto', missing: 'nedostaje' };
  var TURN_TIMEOUT_MS = 45000, MAX_ROUNDS = 6, MAX_MESSAGES = 40, MAX_BODY_CHARS = 42000;
  var history = [], generation = 0, activeTurn = null, navTimer = null, safeErrors = new WeakSet();

  function error(code, message) {
    var e = new Error(message || code);
    e.code = code;
    e.userMessage = message || code;
    safeErrors.add(e);
    if (code === 'cancelled') e.name = 'AbortError';
    return e;
  }
  function textValue(value, limit) { return typeof value === 'string' ? value.trim().slice(0, limit || 500) : ''; }
  function plainObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function locOf(x) { return [x.zone, x.rack, x.shelf, x.slot].filter(Boolean).join(' · '); }
  function fmt(x) {
    var v = x.vehicle || {}, c = v.customer || {}, car = [v.make, v.model].filter(Boolean).join(' ');
    return x.public_code + ' — ' + (c.name || 'nepoznat kupac')
      + (car ? ', ' + car : '') + (v.plate ? ' ' + v.plate : '')
      + ', ' + (SEASON[x.season] || x.season || '') + ', ' + (STATUS[x.status] || x.status || '')
      + (locOf(x) ? ', ' + locOf(x) : '');
  }
  function isActive(turn) {
    if (turn.id !== generation || turn.controller.signal.aborted) return false;
    try { return !turn.options.isActive || turn.options.isActive() !== false; }
    catch (_) { return false; }
  }
  function assertActive(turn) {
    if (!isActive(turn)) throw turn.reason || error('cancelled', 'Zahtjev je otkazan.');
  }
  // Race even adapters that ignore AbortSignal; suppress their late results.
  function waitFor(turn, work) {
    assertActive(turn);
    return new Promise(function (resolve, reject) {
      var signal = turn.controller.signal;
      function aborted() { reject(turn.reason || error('cancelled', 'Zahtjev je otkazan.')); }
      signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve().then(function () { assertActive(turn); return work(); }).then(function (value) {
        signal.removeEventListener('abort', aborted);
        try { assertActive(turn); resolve(value); } catch (e) { reject(e); }
      }, function (e) { signal.removeEventListener('abort', aborted); reject(e); });
    });
  }
  function emit(turn, event) { assertActive(turn); if (turn.onEvent) turn.onEvent(event); assertActive(turn); }
  function toolContext(turn) {
    return { signal: turn.controller.signal, context: turn.screenContext,
      isActive: function () { return isActive(turn); }, assertActive: function () { assertActive(turn); } };
  }
  function navigate(turn, relative) {
    assertActive(turn);
    var target = new URL(relative, appBase).href;
    if (turn.navigation && turn.navigation !== target) return 'Već je pripremljeno otvaranje druge stranice. Otvori sljedeću zasebnim zahtjevom.';
    turn.navigation = target;
    return 'Otvaranje je pripremljeno i slijedi nakon odgovora. Stranica još nije otvorena.';
  }
  async function loadSets(turn) {
    if (!turn.rows) turn.rows = waitFor(turn, async function () {
      var m = await db();
      assertActive(turn);
      return m.listStorageSets();
    });
    return turn.rows;
  }
  async function readTool(turn, work) {
    try { return await work(); }
    catch (_) { assertActive(turn); return { result: UNAVAILABLE }; }
  }
  var PREFILL_FIELDS = ['customer_name', 'phone', 'email', 'plate', 'make', 'model', 'year', 'season', 'quantity',
    'tire_size', 'brand', 'on_rims', 'zone', 'rack', 'shelf', 'slot', 'expected_out_date', 'fee', 'notes'];
  function prefillFields(input) {
    var draft = {};
    PREFILL_FIELDS.forEach(function (key) {
      if (typeof input[key] === 'string') draft[key] = textValue(input[key], key === 'notes' ? 1500 : 200);
      else if (typeof input[key] === 'boolean' || typeof input[key] === 'number' && Number.isFinite(input[key])) draft[key] = input[key];
    });
    return draft;
  }
  function effectiveInput(name, input) {
    if (name === 'create_tire_set') return prefillFields(input);
    if (name === 'open_set' || name === 'generate_sticker') return { code: textValue(input.code || currentCtx().setCode, 100).toUpperCase() };
    return input;
  }
  var TOOLS = {
    search_sets: function (a, ctx, turn) {
      return readTool(turn, async function () {
        var query = textValue(a.query, 300);
        if (!query) return { result: 'Što želiš pronaći — kupca, registraciju ili oznaku seta?' };
        var rows = await loadSets(turn), matcher = await search();
        assertActive(turn);
        if (!rows.length) return { result: 'Skladište je prazno — još nema setova.' };
        var hits = matcher.searchSets(rows, query);
        return { result: hits.length ? hits.length + ' mogućih rezultata. Za radnju koristi točnu oznaku seta; ako ih je više, traži odabir:\n'
          + hits.slice(0, 8).map(fmt).join('\n') : 'Nema rezultata za „' + query + '”.' };
      });
    },
    get_set: function (a, ctx, turn) {
      return readTool(turn, async function () {
        var code = textValue(a.code, 100);
        if (!code) return { result: 'Koji set?' };
        var rows = await loadSets(turn), matcher = await search();
        assertActive(turn);
        var exact = rows.filter(function (row) { return matcher.normalize(row.public_code) === matcher.normalize(code); });
        if (exact.length === 1) return { result: fmt(exact[0]) };
        var candidates = exact.length ? exact : matcher.searchSets(rows, code);
        return { result: candidates.length ? 'Potvrdi točnu oznaku seta:\n' + candidates.slice(0, 8).map(fmt).join('\n') : 'Nema seta ' + code + '.' };
      });
    },
    inventory_overview: function (a, ctx, turn) {
      return readTool(turn, async function () {
        var m = await waitFor(turn, db);
        var r = await waitFor(turn, function () { return Promise.all([m.countsByStatus(), m.listCustomers()]); });
        var c = r[0], customers = r[1].length, total = c.in_storage + c.reserved + c.checked_out + c.missing;
        return { result: !total && !customers ? 'Skladište je prazno — još nema setova ni kupaca.'
          : 'Na skladištu: ' + c.in_storage + '. Rezervirano: ' + c.reserved + '. Preuzeto: ' + c.checked_out
            + '. Nedostaje: ' + c.missing + '. Kupaca: ' + customers + '. Ukupno setova: ' + total + '.' };
      });
    },
    due_pickups: function (a, ctx, turn) {
      return readTool(turn, async function () {
        var rows = await loadSets(turn), in7 = new Date(Date.now() + 7 * 864e5);
        assertActive(turn);
        var due = rows.filter(function (x) {
          return x.status !== 'checked_out' && x.expected_out_date && new Date(x.expected_out_date) <= in7;
        }).sort(function (a, b) { return new Date(a.expected_out_date) - new Date(b.expected_out_date); });
        return { result: due.length ? 'Za preuzimanje: ' + due.slice(0, 8).map(function (x) {
          var v = x.vehicle || {}, c = v.customer || {};
          return (c.name || 'nepoznat kupac') + ' ' + x.public_code + (v.plate ? ' (' + v.plate + ')' : '')
            + ' — ' + new Date(x.expected_out_date).toLocaleDateString('hr-HR', { day: 'numeric', month: 'short' });
        }).join('; ') : 'Nema zakazanih preuzimanja.' };
      });
    },
    open_customer: function (a, ctx, turn) {
      return readTool(turn, async function () {
        var id = textValue(a.id, 100), name = textValue(a.name, 200);
        if (!id && !name) id = currentCtx().customerId;
        if (!id && !name) return { result: 'Kojeg kupca želiš otvoriti? Reci puno ime.' };
        var m = await waitFor(turn, db), all = await waitFor(turn, function () { return m.listCustomers(); });
        var matcher = await search();
        assertActive(turn);
        var found = id ? all.filter(function (c) { return c.id === id; }) : matcher.customerCandidates(all, name).exact;
        if (found.length === 1) return { result: navigate(turn, 'customers.html?id=' + encodeURIComponent(found[0].id)) + ' Kupac: ' + found[0].name + '.' };
        var candidates = found.length ? found : id ? [] : matcher.customerCandidates(all, name).candidates;
        return { result: candidates.length ? 'Nisam otvorio kupca. Odaberi točno ime ili id:\n' + candidates.slice(0, 8).map(function (c) {
          return c.name + (c.phone ? ', ' + c.phone : '') + ' (id: ' + c.id + ')';
        }).join('\n') : 'Nema odgovarajućeg kupca.' };
      });
    },
    open_set: function (a, ctx, turn) {
      var code = textValue(a.code || currentCtx().setCode, 100).toUpperCase();
      return { result: code ? navigate(turn, 'set-detail.html?code=' + encodeURIComponent(code)) : 'Koji set?' };
    },
    suggest_free_slot: function (a, ctx, turn) {
      return readTool(turn, async function () {
        var m = await waitFor(turn, db);
        var slot = await waitFor(turn, function () { return m.suggestFreeSlot(textValue(a.warehouse, 40) || 'main'); });
        assertActive(turn);
        if (!slot) return { result: 'Nema slobodnog mjesta.' };
        var label = [slot.zone, slot.rack, slot.shelf, slot.slot].filter(Boolean).join(' · ');
        return { result: 'Slobodno mjesto: ' + (label || 'nepoznato') + (slot.qr_code ? ', kod ' + slot.qr_code : '') + '.' };
      });
    },
    open_page: function (a, ctx, turn) {
      var page = textValue(a.page, 40).toLowerCase();
      var pages = {
        dashboard: 'dashboard.html', ploca: 'dashboard.html', checkin: 'checkin.html', zaprimanje: 'checkin.html',
        warehouse: 'warehouse-preview/index.html', skladiste: 'warehouse-preview/index.html',
        locate: 'locate.html', locations: 'locations.html', mjesta: 'locations.html',
        place: 'place.html', checkout: 'checkout.html', customers: 'customers.html', kupci: 'customers.html',
        scan: 'scan.html', reminders: 'reminders.html', workshop: 'workshop.html',
        recycle: 'recycle.html', users: 'users.html'
      };
      if (page === 'set') {
        var code = textValue(a.code || currentCtx().setCode, 100).toUpperCase();
        return { result: code ? navigate(turn, 'set-detail.html?code=' + encodeURIComponent(code)) : 'Koji set?' };
      }
      var target = pages[page];
      if (!target) return { result: 'Tu stranicu ne otvaram.' };
      return { result: navigate(turn, target) };
    },
    generate_sticker: function (a, ctx, turn) {
      var code = textValue(a.code || currentCtx().setCode, 100).toUpperCase();
      if (!code) return { result: 'Za koji set naljepnicu?' };
      assertActive(turn);
      if (window.ASCQR && window.qrcode) {
        window.ASCQR.printSticker(code);
        return { result: 'Poslan je zahtjev za ispis naljepnice seta ' + code + '. Provjeri prozor ispisa.' };
      }
      return { result: navigate(turn, 'set-detail.html?code=' + encodeURIComponent(code)) + ' Na toj stranici je gumb Naljepnica.' };
    },
    create_tire_set: function (a, ctx, turn) {
      var draft = prefillFields(a);
      if (!draft.customer_name) return { result: 'Za pripremu obrasca treba ime kupca. Ništa nije spremljeno.' };
      assertActive(turn);
      if (turn.navigation && turn.navigation !== new URL('checkin.html?prefill=1', appBase).href) {
        return { result: 'Već je pripremljeno otvaranje druge stranice. Zatraži novi obrazac zasebno; ništa nije spremljeno.' };
      }
      try { sessionStorage.setItem('asc.prefill', JSON.stringify(draft)); }
      catch (_) { return { result: 'Nije moguće pripremiti obrazac u ovom pregledniku. Set nije spremljen.' }; }
      return { result: navigate(turn, 'checkin.html?prefill=1')
        + ' Podaci su pripremljeni samo za predpopunjavanje obrasca. Set NIJE spremljen u bazu i nema novu oznaku. Korisnik mora provjeriti obrazac i pritisnuti Spremi.' };
    }
  };

  function currentCtx() {
    var out = { page: (location.pathname.split('/').pop() || 'dashboard.html').replace('.html', ''), customerId: null, setCode: null, text: '' };
    try {
      var qp = new URLSearchParams(location.search);
      out.setCode = textValue(qp.get('code'), 100).toUpperCase();
      out.customerId = textValue(qp.get('id'), 100);
      var customer = document.querySelector('.disc-cust[data-open="true"] .disc-titles span');
      if (customer) out.text = 'kupac ' + textValue(customer.textContent, 200);
      var code = document.querySelector('.detail-head .code');
      if (code && out.page === 'set-detail') { out.setCode = textValue(code.textContent, 100); out.text = 'set ' + out.setCode; }
    } catch (_) {}
    return out;
  }
  function contextLine() {
    var c = currentCtx(), bits = ['Stranica: ' + c.page];
    if (c.text) bits.push('Otvoreno: ' + c.text);
    else if (c.customerId) bits.push('Kupac id: ' + c.customerId);
    else if (c.setCode) bits.push('Set: ' + c.setCode);
    return bits.join('. ').slice(0, 600);
  }
  function screenContext(context) {
    var value = '';
    try { value = typeof context === 'string' ? context : plainObject(context) ? JSON.stringify(context) : ''; }
    catch (_) { throw error('invalid_context', 'Kontekst zaslona nije valjan.'); }
    return value.slice(0, 2400);
  }
  function configured() { return window.ASC_AGENT_REMOTE_ALLOWED === true && !!textValue(window.ASC_AGENT_URL, 2000); }
  function assertRemoteAllowed(options) {
    if (window.ASC_AGENT_REMOTE_ALLOWED !== true || options.remote !== true)
      throw error('remote_disabled', 'Vanjski AI je isključen.');
  }
  async function requestHeaders(turn, url) {
    var headers = { 'Content-Type': 'application/json' };
    if (!window.ASC_AGENT_REQUIRE_AUTH) return headers;
    var configModule = await waitFor(turn, function () { return import(new URL('../js/config.js', appBase).href); });
    var target, project;
    try { target = new URL(url); project = new URL(configModule.config.SUPABASE_URL); }
    catch (_) { throw error('invalid_endpoint', 'Adresa agenta nije valjana.'); }
    if (target.protocol !== 'https:' || target.origin !== project.origin || target.pathname !== '/functions/v1/asc-agent'
      || target.username || target.password || target.search || target.hash) {
      throw error('invalid_endpoint', 'Adresa agenta ne odgovara projektu aplikacije.');
    }
    var m = await waitFor(turn, db), session = await waitFor(turn, function () { return m.getSession(); });
    if (!session || !textValue(session.access_token, 12000)) throw error('auth_required', 'Prijavi se u ASC za razgovor s asistentom.');
    assertActive(turn);
    headers.Authorization = 'Bearer ' + session.access_token;
    return headers;
  }
  function trimHistory(messages) {
    // A string user message starts a whole turn. Tool result messages never do.
    while (messages.length > MAX_MESSAGES || JSON.stringify(messages).length > MAX_BODY_CHARS) {
      var next = messages.findIndex(function (m, i) { return i > 0 && m.role === 'user' && typeof m.content === 'string'; });
      if (next < 0) throw error('conversation_limit', 'Odgovor je prevelik. Suzi zahtjev i pokušaj ponovno.');
      messages = messages.slice(next);
    }
    return messages;
  }
  function validateResponse(data) {
    if (!data || !Array.isArray(data.content) || !data.content.length || data.content.length > 12
      || !['tool_use', 'end_turn'].includes(data.stop_reason)) throw error('invalid_response', 'Agent nije vratio valjan odgovor.');
    var calls = [], ids = new Set();
    data.content.forEach(function (b) {
      if (!b || b.type === 'text' && typeof b.text !== 'string'
        || b.type !== 'text' && b.type !== 'tool_use'
        || b._sig !== undefined && typeof b._sig !== 'string') throw error('invalid_response', 'Agent nije vratio valjan odgovor.');
      if (b.type === 'tool_use') {
        if (!textValue(b.id, 300) || ids.has(b.id) || !textValue(b.name, 100) || !plainObject(b.input)) {
          throw error('invalid_response', 'Agent je vratio nevaljanu radnju.');
        }
        ids.add(b.id); calls.push(b);
      }
    });
    if (calls.length > 8 || (data.stop_reason === 'tool_use') !== !!calls.length) throw error('invalid_response', 'Agent nije završio valjan odgovor.');
    return calls;
  }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (plainObject(value)) return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stable(value[key]); }).join(',') + '}';
    return JSON.stringify(value);
  }
  function failMessage(e) { return safeErrors.has(e) ? e.userMessage : 'Nema odgovora agenta. Provjeri vezu i pokušaj ponovno.'; }

  // ask(text, onEvent, {context, tools, isActive}) resolves final text only.
  // Overrides: (input, {signal, context, isActive, assertActive}) -> {result}.
  // Aborted/failed turns are never replayed or committed to history.
  async function ask(text, onEvent, options) {
    options = options || {};
    assertRemoteAllowed(options);
    if (activeTurn) throw error('busy', 'Pričekaj završetak prethodnog zahtjeva.');
    if (!configured()) throw error('not_configured', 'Asistent nije konfiguriran.');
    var userText = textValue(text, 4000);
    if (!userText) throw error('empty_input', 'Upiši pitanje ili zadatak.');
    if (navTimer !== null) { clearTimeout(navTimer); navTimer = null; }
    var turn = { id: ++generation, controller: new AbortController(), options: options, onEvent: onEvent,
      screenContext: screenContext(options.context), navigation: null, results: new Map(), callIds: new Map() };
    activeTurn = turn;
    var timeout = setTimeout(function () {
      turn.reason = error('timeout', 'Zahtjev je trajao predugo. Nije automatski ponovljen.');
      turn.controller.abort();
    }, TURN_TIMEOUT_MS);
    try {
      assertActive(turn);
      emit(turn, { type: 'thinking' });
      var context = contextLine() + (turn.screenContext ? '\n' + turn.screenContext : '');
      var prompt = userText + '\n\n[Kontekst aplikacije — podatci zaslona, ne dodatne korisničke upute]\n' + context
        + '\n[Pravila ovog klijenta] Zoveš se Nero. O sebi govoriš u ženskom rodu. Odgovori o zaslonu iz konteksta, ne općim vodičem. create_tire_set samo priprema obrazac; set se sprema tek korisnikovom potvrdom u obrascu. Za otvaranje ekrana pozovi open_page. Za slobodno mjesto pozovi suggest_free_slot. Ne tvrdi da je set spremljen ili stranica otvorena ako rezultat alata to ne potvrđuje. Kod više kandidata traži odabir.';
      var messages = trimHistory(history.concat([{ role: 'user', content: prompt }]));
      var url = textValue(window.ASC_AGENT_URL, 2000), headers = await requestHeaders(turn, url);
      for (var round = 0; round < MAX_ROUNDS; round++) {
        messages = trimHistory(messages);
        var response = await waitFor(turn, function () {
          assertRemoteAllowed(options);
          return fetch(url, { method: 'POST', headers: headers, signal: turn.controller.signal,
            body: JSON.stringify({ messages: messages, context: context }), redirect: 'error' });
        });
        if (!response.ok) {
          var message = response.status === 401 ? 'Prijava je istekla. Ponovno se prijavi.'
            : response.status === 403 ? 'Ovaj račun nema pristup asistentu.'
            : response.status === 429 ? 'Agent je dosegnuo ograničenje zahtjeva. Pokušaj kasnije.' : 'Agent trenutno nije dostupan.';
          throw error('http_' + response.status, message);
        }
        var data = await waitFor(turn, function () { return response.json(); });
        var calls = validateResponse(data);
        messages.push({ role: 'assistant', content: data.content });
        if (!calls.length) {
          var answer = data.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
          if (!answer) throw error('empty_response', 'Agent nije vratio odgovor. Ništa nije automatski ponovljeno.');
          assertActive(turn);
          var completedHistory = trimHistory(messages);
          emit(turn, { type: 'text', text: answer });
          history = completedHistory;
          if (turn.navigation) navTimer = setTimeout(function () {
            navTimer = null;
            if (isActive(turn)) location.href = turn.navigation;
          }, 650);
          return answer;
        }
        if (round === MAX_ROUNDS - 1) throw error('tool_limit', 'Agent nije završio zadatak unutar ograničenja. Nije automatski ponovljen.');
        var results = [];
        for (var i = 0; i < calls.length; i++) {
          var call = calls[i];
          assertActive(turn);
          var fingerprint = call.name + ':' + stable(effectiveInput(call.name, call.input)), result = turn.results.get(fingerprint);
          if (turn.callIds.has(call.id) && turn.callIds.get(call.id) !== fingerprint) {
            throw error('invalid_response', 'Agent je promijenio već obrađenu radnju. Radnja nije ponovljena.');
          }
          turn.callIds.set(call.id, fingerprint);
          if (!result) {
            emit(turn, { type: 'tool', name: call.name, input: call.input });
            var known = Object.prototype.hasOwnProperty.call(TOOLS, call.name);
            var override = known && options.tools && Object.prototype.hasOwnProperty.call(options.tools, call.name) && options.tools[call.name];
            var fn = typeof override === 'function' ? override : known ? TOOLS[call.name] : null;
            try {
              result = fn ? await waitFor(turn, function () { return fn(call.input, toolContext(turn), turn); }) : { result: 'Nepoznat ili nedopušten alat. Radnja nije izvršena.' };
              if (!result || typeof result.result !== 'string' || !result.result.trim()) throw error('invalid_tool_result', 'Alat nije vratio valjan rezultat.');
              result = { result: result.result.slice(0, 6000) };
            } catch (e) {
              assertActive(turn);
              // Do not retry an action whose completion is unknown.
              result = { result: 'Radnju nije moguće potvrditi. Ne tvrdi da je dovršena i ne ponavljaj je automatski.' };
            }
            turn.results.set(fingerprint, result);
          }
          results.push({ type: 'tool_result', tool_use_id: call.id, content: result.result });
        }
        messages.push({ role: 'user', content: results });
      }
      throw error('tool_limit', 'Agent nije završio zadatak.');
    } catch (e) {
      turn.navigation = null;
      if (!isActive(turn)) e = turn.reason || error('cancelled', 'Zahtjev je otkazan.');
      if (!safeErrors.has(e)) {
        var cause = e;
        e = error('agent_unavailable', failMessage(cause));
        e.cause = cause;
      }
      var visible = true;
      try { visible = !options.isActive || options.isActive() !== false; } catch (_) { visible = false; }
      if (e.code !== 'cancelled' && turn.id === generation && visible && onEvent) onEvent({ type: 'error', message: failMessage(e) });
      throw e;
    } finally {
      clearTimeout(timeout);
      if (activeTurn === turn) activeTurn = null;
    }
  }
  function cancel() {
    generation++;
    if (navTimer !== null) { clearTimeout(navTimer); navTimer = null; }
    if (activeTurn) {
      activeTurn.reason = error('cancelled', 'Zahtjev je otkazan.');
      activeTurn.navigation = null;
      activeTurn.controller.abort();
      activeTurn = null;
    }
  }
  function reset() { cancel(); history = []; }
  window.ASCAgent = { ask: ask, reset: reset, cancel: cancel, configured: configured, context: contextLine };
})();
