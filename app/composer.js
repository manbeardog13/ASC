/* Nero, outside the dashboard card. Compact glass pill while browsing,
   expanded only while someone is typing. Push-to-talk, history, attachments,
   and the admin tailnet relay live here. */
(function () {
  'use strict';
  if (document.getElementById('agentCard') || document.getElementById('neroComposer')) return;
  if (/\/login\.html$/.test(location.pathname)) return;

  var script = document.currentScript;
  var base = new URL('./', script && script.src || new URL('composer.js', document.baseURI).href);

  function ensure(src, asModule) {
    var url = new URL(src, base).href;
    if ([].some.call(document.scripts, function (s) { return s.src === url; })) return;
    var el = document.createElement('script');
    el.src = url;
    el.async = false;
    if (asModule) el.type = 'module';
    document.head.appendChild(el);
  }
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('composer.css', base).href;
  document.head.appendChild(css);
  ensure('concierge.js', true);
  ensure('agent-config.js', false);
  ensure('qr.js', false);
  ensure('agent-gemini.js', false);
  ensure('builder-queue.js', false);

  document.documentElement.classList.add('has-composer');

  var root = document.createElement('form');
  root.className = 'nero-composer is-compact';
  root.id = 'neroComposer';
  root.setAttribute('role', 'search');
  root.setAttribute('aria-label', 'Nero');
  root.innerHTML =
    '<div class="nero-log" hidden></div>' +
    '<p class="nero-connect" hidden></p>' +
    '<div class="nero-queue" hidden></div>' +
    '<div class="nero-sheet">' +
      '<div class="nero-files" hidden></div>' +
      '<textarea class="nero-input" rows="1" enterkeyhint="send" placeholder="Pitaj Nero…" aria-label="Pitaj Nero"></textarea>' +
      '<div class="nero-tools">' +
        '<button class="nero-plus" type="button" aria-label="Priloži">+</button>' +
        '<input class="nero-file" type="file" accept="image/*,application/pdf" hidden>' +
        '<span class="nero-rec" hidden role="status">Slušam…</span>' +
        '<button class="nero-mic" type="button" hidden aria-label="Govori Nero" aria-pressed="false">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0012 0M12 17v3"/></svg>' +
        '</button>' +
        '<button class="nero-send" type="submit" aria-label="Pošalji">' +
          '<svg class="nero-go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>' +
          '<svg class="nero-stop" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="nero-pills">' +
      '<button class="nero-pill" type="button" data-act="new">Novi razgovor</button>' +
      '<button class="nero-pill" type="button" data-act="history">Povijest</button>' +
      '<button class="nero-pill" type="button" data-act="relay" hidden aria-pressed="false" aria-label="Send to Toni &amp; Nero">Toni &amp; Nero</button>' +
      '<button class="nero-pill" type="button" data-q="Nađi gume za DU 123-AB">nađi set</button>' +
      '<button class="nero-pill" type="button" data-q="Koliko je slobodno u skladištu?">koliko je slobodno</button>' +
      '<button class="nero-pill" type="button" data-q="Tko čeka na preuzimanje danas?">tko čeka</button>' +
    '</div>' +
    '<div class="nero-history" hidden></div>';
  document.body.appendChild(root);

  var input = root.querySelector('.nero-input');
  var log = root.querySelector('.nero-log');
  var queueBox = root.querySelector('.nero-queue');
  var connectBox = root.querySelector('.nero-connect');
  connectBox.textContent = 'Connect to Tailscale to reach Toni & Nero';
  var filesBox = root.querySelector('.nero-files');
  var fileInput = root.querySelector('.nero-file');
  var send = root.querySelector('.nero-send');
  var mic = root.querySelector('.nero-mic');
  var recLabel = root.querySelector('.nero-rec');
  var historyBox = root.querySelector('.nero-history');
  var relayPill = root.querySelector('[data-act="relay"]');
  var plus = root.querySelector('.nero-plus');
  var busy = false;
  var chatId = null;
  var pending = [];
  var stick = true;
  var relayMode = false;
  var relayReady = false;
  var voiceMode = 'idle';
  var voiceSource = '';
  var voiceStarted = 0;
  var voiceRestart = 0;
  var recognition = null;
  var voiceStop = false;
  var voiceStream = null;
  var recorder = null;
  var audioChunks = [];
  var flushTimer = 0;
  var flushing = false;
  var offlineNote = false;
  var sbPromise = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function href(rel) { return new URL(rel, base).href; }
  function stamp() { return new Date().toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' }); }
  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function queueApi() { return window.ASCBuilderQueue || null; }
  function libs() {
    if (!sbPromise) sbPromise = Promise.all([
      import(new URL('../js/supabaseClient.js', base).href),
      import(new URL('../js/db.js', base).href),
      import(new URL('../js/config.js', base).href)
    ]).then(function (mods) { return { supabase: mods[0].supabase, db: mods[1], config: mods[2].config }; });
    return sbPromise;
  }
  function relayUrl() {
    var raw = String(globalThis.BUILDER_RELAY_URL || '').trim();
    if (!raw) return '';
    try {
      var u = new URL(raw);
      if (u.protocol !== 'https:') return '';
      if (/supabase\.co$/i.test(u.hostname)) return '';
      return u.origin + u.pathname.replace(/\/$/, '');
    } catch (e) { return ''; }
  }

  function fit() {
    var foot = document.querySelector('.nero-mark') || document.querySelector('.spatial-footer');
    var h = foot ? Math.ceil(foot.getBoundingClientRect().height) : 36;
    root.style.setProperty('--nero-foot', Math.max(36, h) + 'px');
    document.documentElement.style.setProperty('--nero-stack', Math.ceil(root.getBoundingClientRect().height + h + 18) + 'px');
  }
  function openComposer(focus) {
    root.classList.remove('is-compact');
    root.classList.add('is-open');
    document.documentElement.classList.add('nero-open');
    if (focus) input.focus();
    fit();
  }
  function maybeCollapse() {
    if (busy || voiceMode !== 'idle') return;
    if (input.value.trim() || pending.length) return;
    root.classList.add('is-compact');
    root.classList.remove('is-open');
    document.documentElement.classList.remove('nero-open');
    historyBox.hidden = true;
    fit();
  }
  function scrollLog() {
    if (!stick) return;
    log.scrollTop = log.scrollHeight;
  }
  log.addEventListener('scroll', function () {
    stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
  });

  function rich(text) {
    return String(text || '').split('\n').map(function (line) {
      var code = line.match(/ASC-\d{4}-\d+/);
      var loc = line.match(/[0-9A-Za-z]+(?:\s·\s[0-9A-Za-z]+){1,3}/);
      if (!code) {
        return esc(line).replace(/ASC-\d{4}-\d+/g, function (c) {
          return '<a class="nero-chip" href="' + esc(href('set-detail.html?code=' + encodeURIComponent(c))) + '">' + c + '</a>';
        });
      }
      var rest = line.replace(code[0], '');
      if (loc) rest = rest.replace(loc[0], '');
      var slot = loc
        ? '<a class="nero-slot" href="' + esc(href('locate.html?q=' + encodeURIComponent(loc[0]))) + '">' + esc(loc[0]) + '</a>'
        : '';
      return '<a class="nero-set" href="' + esc(href('set-detail.html?code=' + encodeURIComponent(code[0]))) + '">' +
        '<span class="nero-thumb" data-thumb="' + esc(code[0]) + '"></span>' +
        '<span class="nero-set-copy"><b>' + esc(code[0]) + '</b>' + slot +
        '<span class="nero-set-rest">' + esc(rest.replace(/^[\s,—-]+/, '')) + '</span></span></a>';
    }).join('<br>');
  }
  function loadThumbs(scope) {
    var nodes = scope.querySelectorAll('[data-thumb]');
    if (!nodes.length) return;
    libs().then(function (lib) {
      nodes.forEach(function (el) {
        if (el.dataset.loaded) return;
        el.dataset.loaded = '1';
        var code = el.getAttribute('data-thumb');
        lib.supabase.from('storage_sets').select('id, photos(path)').eq('public_code', code).maybeSingle()
          .then(function (res) {
            var path = res.data && res.data.photos && res.data.photos[0] && res.data.photos[0].path;
            if (!path) return null;
            return lib.db.signedPhotoUrls([path]).then(function (urls) { return urls[path]; });
          })
          .then(function (url) { if (url) el.style.backgroundImage = 'url(' + JSON.stringify(String(url)) + ')'; })
          .catch(function () {});
      });
    }).catch(function () {});
  }
  function card(role, text, extra) {
    var el = document.createElement('article');
    el.className = 'nero-card nero-card-' + role;
    el.dataset.raw = text || '';
    var actions = '<div class="nero-meta"><time>' + esc(stamp()) + '</time>' +
      '<button type="button" class="nero-act" data-copy>Kopiraj</button>' +
      (role === 'user' ? '<button type="button" class="nero-act" data-retry>Ponovi</button>' : '') +
      '</div>';
    if (role === 'user') el.innerHTML = '<div class="nero-body"></div>' + actions;
    else el.innerHTML = '<div class="nero-avatar" aria-hidden="true">N</div><div><div class="nero-body"></div>' + actions + '</div>';
    paint(el, text, false);
    if (extra) el.querySelector('.nero-body').insertAdjacentHTML('beforeend', extra);
    log.hidden = false;
    log.appendChild(el);
    openComposer(false);
    scrollLog();
    loadThumbs(el);
    fit();
    return el;
  }
  function paint(el, text, streaming) {
    el.dataset.raw = text || '';
    var body = el.querySelector('.nero-body');
    body.innerHTML = rich(text) + (streaming ? '<span class="nero-caret">▍</span>' : '');
    el.classList.toggle('is-stream', !!streaming);
    loadThumbs(el);
    scrollLog();
  }
  function setBusy(on) {
    busy = on;
    root.classList.toggle('is-busy', on);
    send.setAttribute('aria-label', on ? 'Stani' : 'Pošalji');
  }

  function saveMessage(role, body, attachments) {
    if (!body) return;
    libs().then(function (lib) {
      return lib.db.getSession().then(function (session) {
        if (!session) return;
        var write = chatId
          ? Promise.resolve(chatId)
          : lib.supabase.from('nero_chats').insert({ title: body.slice(0, 80) }).select('id').single()
            .then(function (res) { if (res.error || !res.data) return null; chatId = res.data.id; return chatId; });
        return write.then(function (id) {
          if (!id) return;
          return lib.supabase.from('nero_messages').insert({
            chat_id: id, role: role, body: body, attachments: attachments || []
          }).then(function () {
            return lib.supabase.from('nero_chats').update({ updated_at: new Date().toISOString() }).eq('id', id);
          });
        });
      });
    }).catch(function () {});
  }

  function askGemini(text, attachments) {
    if (!(window.ASCAgent && ASCAgent.configured && ASCAgent.configured())) {
      location.href = href('workshop.html?q=' + encodeURIComponent(text));
      return;
    }
    setBusy(true);
    var bubble = null;
    var acc = '';
    function bubbleFor() {
      if (!bubble) bubble = card('assistant', '');
      return bubble;
    }
    ASCAgent.ask(text, function (ev) {
      if (ev.type === 'delta') {
        acc += ev.text;
        paint(bubbleFor(), acc, true);
      } else if (ev.type === 'tool') {
        if (bubble) { bubble.classList.remove('is-stream'); bubble = null; acc = ''; }
        card('assistant', 'Nero provjerava…');
      } else if (ev.type === 'tool_result') {
        card('assistant', ev.text || '');
      } else if (ev.type === 'text') {
        paint(bubbleFor(), ev.text, false);
        saveMessage('assistant', ev.text, []);
        bubble = null;
        acc = '';
      } else if (ev.type === 'error') {
        paint(bubbleFor(), ev.message || 'Greška.', false);
        bubble = null;
      }
    }, { remote: true, stream: true, attachments: attachments }).then(function () {
      setBusy(false);
    }).catch(function (err) {
      setBusy(false);
      if (err && err.code === 'cancelled') return;
      paint(bubbleFor(), 'Veza je pukla — pokušaj ponovno.', false);
    });
  }

  function showConnect(on) {
    offlineNote = !!on;
    connectBox.hidden = !on;
    fit();
  }
  function renderQueue(items) {
    queueBox.innerHTML = '';
    if (!items || !items.length) { queueBox.hidden = true; fit(); return; }
    queueBox.hidden = false;
    items.forEach(function (item) {
      var waiting = relayUrl() ? 'queued, sends when Tailscale reconnects' : 'Poruka čeka vezu.';
      var row = document.createElement('div');
      row.className = 'nero-q';
      row.innerHTML = '<span>' + esc(item.text.slice(0, 80)) + ' — ' + waiting + '</span>' +
        '<button type="button" data-cancel="' + esc(item.id) + '">Odustani</button>';
      queueBox.appendChild(row);
    });
    fit();
  }
  function refreshQueue() {
    var q = queueApi();
    if (!q) return;
    q.list().then(renderQueue).catch(function () {});
  }
  function arm(attempts) {
    var q = queueApi();
    if (!q) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(tryFlush, q.backoffMs(attempts));
  }
  function projectFunction(lib, name) {
    try {
      var root = new URL(lib.config.SUPABASE_URL);
      var target = new URL('/functions/v1/' + name, root);
      if (target.origin !== root.origin || target.pathname !== '/functions/v1/' + name) return '';
      return target.href;
    } catch (e) { return ''; }
  }
  function postRelay(item) {
    return libs().then(function (lib) {
      return lib.db.getSession().then(function (session) {
        var token = session && session.access_token;
        var url = relayUrl();
        if (!token || !url) return 'http';
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({
            id: item.id,
            text: item.text,
            page: item.page,
            timestamp: item.ts,
            attachments: item.attachments || []
          })
        }).then(function (res) { return res.ok ? 'ok' : 'http'; }, function () { return 'offline'; });
      });
    });
  }
  function postFunction(item) {
    return libs().then(function (lib) {
      return lib.db.getSession().then(function (session) {
        var token = session && session.access_token;
        var url = projectFunction(lib, 'asc-builder-relay');
        if (!token || !url) return 'http';
        return fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
            apikey: lib.config.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            text: item.text,
            pageUrl: location.href,
            appVersion: globalThis.ASC_APP_VERSION || '',
            attachments: item.attachments || []
          })
        }).then(function (res) {
          if (res.ok) return 'ok';
          if (res.status === 404 || res.status === 503) return 'unconfigured';
          return 'http';
        }, function () { return 'offline'; });
      });
    });
  }
  function postBuilder(item) {
    return postFunction(item).then(function (outcome) {
      if (outcome === 'ok' || outcome === 'http') return outcome;
      if (relayUrl()) return postRelay(item);
      return outcome;
    });
  }
  function tryFlush() {
    var q = queueApi();
    if (!q || flushing || (!relayUrl() && !relayReady)) return;
    flushing = true;
    q.list().then(function (items) {
      var chain = Promise.resolve();
      items.forEach(function (item) {
        chain = chain.then(function (stop) {
          if (stop) return true;
          return postBuilder(item).then(function (outcome) {
            if (outcome === 'offline') {
              showConnect(true);
              return q.bump(item.id).then(function (row) { arm(row ? row.attempts : 1); return true; });
            }
            return q.remove(item.id).then(function () {
              if (outcome === 'ok') showConnect(false);
              return false;
            });
          });
        });
      });
      return chain;
    }).then(function () { flushing = false; refreshQueue(); }).catch(function () { flushing = false; });
  }
  function sendRelay(text, refs) {
    var q = queueApi();
    var item = {
      id: makeId(),
      text: text,
      page: (location.pathname + location.search).slice(0, 200),
      ts: Date.now(),
      attachments: refs,
      attempts: 0
    };
    var el = card('user', text);
    function mark(line) {
      var p = document.createElement('p');
      p.className = 'nero-set-rest';
      p.textContent = line;
      el.querySelector('.nero-body').appendChild(p);
    }
    setBusy(true);
    postBuilder(item).then(function (outcome) {
      setBusy(false);
      if (outcome === 'ok') { showConnect(false); mark('sent to Toni & Nero'); return; }
      if (outcome === 'http') { mark('Toni & Nero nisu primili poruku.'); return; }
      if (outcome === 'unconfigured') { mark('Toni & Nero još nisu spojeni.'); return; }
      if (relayUrl()) showConnect(true);
      mark(relayUrl() ? 'queued, sends when Tailscale reconnects' : 'Poruka čeka vezu.');
      if (!q) return;
      return q.enqueue(item).then(function () { refreshQueue(); arm(0); });
    }).catch(function () { setBusy(false); });
  }

  function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    if (voiceMode !== 'idle') stopVoice();
    var refs = pending.map(function (f) { return { path: f.path, mime: f.mime, name: f.name }; });
    input.value = '';
    grow();
    pending = [];
    renderFiles();
    if (relayMode) {
      sendRelay(text, refs);
      return;
    }
    card('user', text);
    saveMessage('user', text, refs);
    var ready = window.ASCConcierge
      ? Promise.resolve(window.ASCConcierge.answer(text))
      : import(new URL('concierge.js', base).href).then(function (mod) { return mod.answer(text); }).catch(function () { return null; });
    setBusy(true);
    ready.then(function (fast) {
      if (fast && !refs.length) {
        card('assistant', fast);
        saveMessage('assistant', fast, []);
        setBusy(false);
      } else askGemini(text, refs);
    });
  }

  function renderFiles() {
    filesBox.innerHTML = '';
    filesBox.hidden = !pending.length;
    pending.forEach(function (f, i) {
      var chip = document.createElement('span');
      chip.className = 'nero-filechip';
      chip.innerHTML = (f.preview ? '<img alt="" src="' + esc(f.preview) + '">' : '') +
        '<span>' + esc(f.name) + '</span><button type="button" data-drop="' + i + '" aria-label="Ukloni">×</button>';
      filesBox.appendChild(chip);
    });
    fit();
  }
  filesBox.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-drop]');
    if (!btn) return;
    pending.splice(Number(btn.getAttribute('data-drop')), 1);
    renderFiles();
  });
  plus.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { card('assistant', 'Datoteka je prevelika (najviše 8 MB).'); return; }
    var mime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : '');
    if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(mime)) {
      card('assistant', 'Mogu priložiti sliku ili PDF.');
      return;
    }
    openComposer(true);
    libs().then(function (lib) {
      return lib.db.getSession().then(function (session) {
        if (!session) throw new Error('auth');
        var safe = String(file.name || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
        var path = session.user.id + '/' + makeId() + '-' + safe;
        return lib.supabase.storage.from('nero-attachments').upload(path, file, { contentType: mime, upsert: false })
          .then(function (res) {
            if (res.error) throw res.error;
            pending.push({
              path: path, mime: mime, name: file.name || safe,
              preview: mime.indexOf('image/') === 0 ? URL.createObjectURL(file) : ''
            });
            renderFiles();
          });
      });
    }).catch(function () { card('assistant', 'Prilog nije spremljen. Prijavi se i pokušaj ponovno.'); });
  });

  root.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) {
      if (window.ASCAgent && ASCAgent.cancel) ASCAgent.cancel();
      setBusy(false);
      return;
    }
    ask(input.value);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
    else if (e.key === 'Escape' && !input.value.trim() && !pending.length && voiceMode === 'idle') {
      input.blur();
      maybeCollapse();
    }
  });
  input.addEventListener('input', function () { grow(); if (input.value.trim()) openComposer(false); });
  function grow() {
    if (root.classList.contains('is-compact')) { input.style.height = ''; return; }
    input.style.height = 'auto';
    input.style.height = Math.min(160, input.scrollHeight) + 'px';
    fit();
  }
  root.addEventListener('pointerdown', function (e) {
    if (root.classList.contains('is-compact') && !e.target.closest('.nero-mic')) openComposer(true);
  });
  root.addEventListener('focusin', function () { openComposer(false); });
  root.addEventListener('focusout', function () {
    setTimeout(function () { if (!root.contains(document.activeElement)) maybeCollapse(); }, 0);
  });
  log.addEventListener('click', function (e) {
    var copy = e.target.closest('[data-copy]');
    var retry = e.target.closest('[data-retry]');
    var article = e.target.closest('.nero-card');
    if (!article) return;
    if (copy && navigator.clipboard) navigator.clipboard.writeText(article.dataset.raw || '');
    if (retry) ask(article.dataset.raw || '');
  });
  queueBox.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-cancel]');
    if (!btn) return;
    var q = queueApi();
    if (!q) return;
    q.remove(btn.getAttribute('data-cancel')).then(refreshQueue);
  });
  root.addEventListener('click', function (e) {
    var pill = e.target.closest('.nero-pill');
    if (!pill) return;
    var act = pill.getAttribute('data-act');
    var q = pill.getAttribute('data-q');
    if (q) { openComposer(true); input.value = q; ask(q); return; }
    if (act === 'new') {
      chatId = null;
      log.innerHTML = '';
      log.hidden = true;
      historyBox.hidden = true;
      if (window.ASCAgent && ASCAgent.reset) ASCAgent.reset();
      openComposer(true);
      return;
    }
    if (act === 'history') { historyBox.hidden = !historyBox.hidden; if (!historyBox.hidden) loadHistory(); openComposer(false); return; }
    if (act === 'relay' && relayReady) {
      relayMode = !relayMode;
      pill.setAttribute('aria-pressed', relayMode ? 'true' : 'false');
      if (relayMode) tryFlush();
    }
  });

  function loadHistory() {
    historyBox.innerHTML = '<p class="nero-empty">Učitavam…</p>';
    libs().then(function (lib) {
      return lib.supabase.from('nero_chats').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(30);
    }).then(function (res) {
      historyBox.innerHTML = '';
      if (!res || res.error || !res.data) {
        historyBox.innerHTML = '<p class="nero-empty">Povijest još nije spremna.</p>';
        return;
      }
      if (!res.data.length) historyBox.innerHTML = '<p class="nero-empty">Nema starih razgovora.</p>';
      res.data.forEach(function (row) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = row.title || 'Razgovor';
        btn.addEventListener('click', function () { reopen(row.id); });
        historyBox.appendChild(btn);
      });
    }).catch(function () {
      historyBox.innerHTML = '<p class="nero-empty">Povijest još nije spremna.</p>';
    });
  }
  function reopen(id) {
    libs().then(function (lib) {
      return lib.supabase.from('nero_messages').select('role, body, created_at').eq('chat_id', id).order('created_at', { ascending: true });
    }).then(function (res) {
      if (!res || res.error || !res.data) return;
      chatId = id;
      log.innerHTML = '';
      res.data.forEach(function (row) { card(row.role === 'user' ? 'user' : 'assistant', row.body || ''); });
      if (window.ASCAgent && ASCAgent.recall) ASCAgent.recall(res.data);
      historyBox.hidden = true;
      log.hidden = !res.data.length;
    }).catch(function () {});
  }

  function speechLang() {
    var code = 'hr';
    try {
      var saved = localStorage.getItem('asc.lang');
      if (saved === 'en' || saved === 'hr') code = saved;
    } catch (e) {}
    return code === 'en' ? 'en-US' : 'hr-HR';
  }
  function setVoice(mode) {
    voiceMode = mode;
    var on = mode !== 'idle';
    root.classList.toggle('is-recording', on);
    mic.setAttribute('aria-pressed', on ? 'true' : 'false');
    recLabel.hidden = !on;
    if (on) recLabel.textContent = mode === 'locked' ? 'Slušam… zaključano' : 'Slušam…';
    fit();
  }
  function stopTracks() {
    if (!voiceStream) return;
    voiceStream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) {} });
    voiceStream = null;
  }
  function stopVoice() {
    voiceStop = true;
    var recorderWasLive = recorder && recorder.state === 'recording';
    setVoice('idle');
    if (recognition) { try { recognition.stop(); } catch (e) {} }
    if (recorderWasLive) { try { recorder.stop(); } catch (e) { stopTracks(); } }
    else stopTracks();
  }
  function applyTranscript(ev) {
    var finals = '';
    var interim = '';
    for (var i = 0; i < ev.results.length; i++) {
      var bit = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finals += bit + ' ';
      else interim += bit;
    }
    input.value = (finals + interim).trim();
    if (interim) recLabel.textContent = interim;
    else recLabel.textContent = voiceMode === 'locked' ? 'Slušam… zaključano' : 'Slušam…';
    grow();
    openComposer(false);
  }
  function startVoice(mode, source) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR && !(navigator.mediaDevices && window.MediaRecorder)) return;
    if (voiceMode === 'locked') { stopVoice(); return; }
    if (voiceMode === 'holding') return;
    voiceStop = false;
    voiceSource = source || 'pointer';
    if (!SR) { setVoice(mode); startRecording(); return; }
    if (!recognition) {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = applyTranscript;
      recognition.onerror = function () { if (voiceMode !== 'idle') stopVoice(); };
      recognition.onend = function () {
        if (voiceStop || voiceMode === 'idle') { recognition = null; setVoice('idle'); return; }
        if (Date.now() - voiceRestart < 400) { stopVoice(); return; }
        voiceRestart = Date.now();
        try { recognition.lang = speechLang(); recognition.start(); } catch (e) { setVoice('idle'); }
      };
    }
    recognition.lang = speechLang();
    setVoice(mode);
    try { recognition.start(); } catch (e) { setVoice('idle'); }
  }
  function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (voiceStop || voiceMode === 'idle') {
        stream.getTracks().forEach(function (track) { try { track.stop(); } catch (e) {} });
        return;
      }
      voiceStream = stream;
      var mime = window.MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      audioChunks = [];
      recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size) audioChunks.push(ev.data); };
      recorder.onstop = function () {
        var type = (recorder && recorder.mimeType) || mime || 'audio/webm';
        var blob = new Blob(audioChunks, { type: type });
        recorder = null;
        stopTracks();
        if (blob.size) transcribeAudio(blob);
      };
      recorder.start();
    }).catch(function () {
      setVoice('idle');
      card('assistant', 'Mikrofon nije dopušten.');
    });
  }
  function transcribeAudio(blob) {
    var mime = String(blob.type || 'audio/webm').split(';')[0];
    recLabel.hidden = false;
    recLabel.textContent = 'Prepisujem…';
    libs().then(function (lib) {
      return lib.db.getSession().then(function (session) {
        if (!session) throw new Error('auth');
        var url = projectFunction(lib, 'asc-agent');
        if (!url) throw new Error('url');
        var path = session.user.id + '/' + makeId() + '.webm';
        return lib.supabase.storage.from('nero-attachments').upload(path, blob, { contentType: mime, upsert: false })
          .then(function (res) {
            if (res.error) throw res.error;
            return fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + session.access_token,
                apikey: lib.config.SUPABASE_ANON_KEY
              },
              body: JSON.stringify({ transcribe: true, audio: { path: path, mime: mime }, lang: speechLang() })
            });
          });
      });
    }).then(function (res) { return res && res.json ? res.json() : null; }).then(function (data) {
      recLabel.hidden = true;
      var text = data && data.text ? String(data.text).trim() : '';
      if (!text) { card('assistant', 'Nisam čula govor. Pokušaj ponovno.'); return; }
      input.value = text;
      grow();
      openComposer(true);
    }).catch(function () {
      recLabel.hidden = true;
      card('assistant', 'Prijepis nije uspio. Možeš upisati poruku.');
    });
  }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR || (navigator.mediaDevices && window.MediaRecorder)) {
    mic.hidden = false;
    mic.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      try { mic.setPointerCapture(e.pointerId); } catch (err) {}
      if (voiceMode === 'locked') { stopVoice(); return; }
      voiceStarted = performance.now();
      startVoice('holding', 'pointer');
    });
    mic.addEventListener('pointerup', function () {
      if (voiceMode !== 'holding' || voiceSource !== 'pointer') return;
      if (performance.now() - voiceStarted < 280) setVoice('locked');
      else stopVoice();
    });
    mic.addEventListener('pointercancel', function () { if (voiceMode === 'holding') stopVoice(); });
    mic.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.repeat) return;
      e.preventDefault();
      startVoice('holding', 'key');
    });
    mic.addEventListener('keyup', function (e) {
      if ((e.key === ' ' || e.key === 'Spacebar') && voiceMode === 'holding' && voiceSource === 'key') stopVoice();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || e.repeat || voiceMode !== 'idle') return;
    var t = e.target;
    if (!t || t === mic) return;
    var tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || t.isContentEditable) return;
    if (!SR && !(navigator.mediaDevices && window.MediaRecorder)) return;
    e.preventDefault();
    startVoice('holding', 'key');
  });
  document.addEventListener('keyup', function (e) {
    if (e.code === 'Space' && voiceMode === 'holding' && voiceSource === 'key') stopVoice();
  });

  document.addEventListener('asc:sign-out', function () {
    var q = queueApi();
    relayMode = false;
    relayPill.setAttribute('aria-pressed', 'false');
    showConnect(false);
    if (q) q.clear().then(function () { renderQueue([]); });
    else renderQueue([]);
  });
  addEventListener('online', tryFlush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') tryFlush();
  });
  addEventListener('resize', fit);
  fit();

  libs().then(function (lib) {
    var fromConfig = lib.config && lib.config.BUILDER_RELAY_URL;
    if (!globalThis.BUILDER_RELAY_URL && fromConfig) globalThis.BUILDER_RELAY_URL = fromConfig;
    return lib.db.loadMyProfile();
  }).then(function (profile) {
    var role = profile && profile.role;
    if (role === 'admin' || role === 'manager') {
      relayReady = true;
      relayPill.hidden = false;
      refreshQueue();
      tryFlush();
    }
  }).catch(function () {});
})();
