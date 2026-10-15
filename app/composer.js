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
    '</div>' +
    '<div class="nero-history" hidden></div>';
  // Docked inside the page column, after the content — never floating over it.
  // One layer above everything; the page reserves its height at the end so
  // nothing is ever hidden beneath it.
  document.body.appendChild(root);
  var grab = document.createElement('div');
  grab.className = 'nero-grab'; grab.setAttribute('role', 'button'); grab.setAttribute('aria-label', 'Spusti razgovor'); grab.tabIndex = 0;
  root.insertBefore(grab, root.firstChild);
  (function () {
    var y0 = 0, dy = 0, pid = null;
    function collapse() { log.hidden = true; root.classList.remove('has-convo'); openComposer(false); }
    grab.addEventListener('pointerdown', function (e) { pid = e.pointerId; y0 = e.clientY; dy = 0; grab.setPointerCapture(pid); });
    grab.addEventListener('pointermove', function (e) { if (e.pointerId !== pid) return; dy = Math.max(0, e.clientY - y0); log.style.transform = 'translate3d(0,' + dy + 'px,0)'; });
    function end(e) { if (e.pointerId !== pid) return; pid = null; log.style.transform = ''; if (dy > 48) collapse(); }
    grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
    grab.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); collapse(); } });
  })();
  var suggest = document.createElement('div');
  suggest.className = 'nero-suggest';
  suggest.setAttribute('aria-label', 'Prijedlozi');
  suggest.inert = true;
  root.insertBefore(suggest, root.querySelector('.nero-sheet'));
  var shellEl = document.querySelector('main.shell') || document.querySelector('.shell');
  if (shellEl && !document.querySelector('.nero-mark')) {
    var mark = document.createElement('p');
    mark.className = 'nero-mark';
    mark.innerHTML = 'Powered by <a href="https://nerosummit.com">Nero Summit</a>';
    shellEl.insertAdjacentElement('afterend', mark);
  }

  // Conversation controls live inside the sheet's tool row — nothing below the composer.
  root.querySelector('.nero-tools').insertBefore(root.querySelector('.nero-pills'), root.querySelector('.nero-mic'));
  root.insertBefore(root.querySelector('.nero-history'), suggest);
  // Docked to the bottom edge; on phones it rides the on-screen keyboard.
  function dock() {
    var vv = window.visualViewport;
    var lift = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--kb', lift + 'px');
    root.style.setProperty('--nero-viewport', (vv ? vv.height : innerHeight) + 'px');
  }
  if (window.visualViewport) { visualViewport.addEventListener('resize', dock); visualViewport.addEventListener('scroll', dock); }
  dock();
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
  var requestGeneration = 0;
  var chatGeneration = 0;
  var saveQueue = Promise.resolve();
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
    document.documentElement.style.setProperty('--nero-stack', Math.ceil(root.getBoundingClientRect().height + 20) + 'px');
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
    root.classList.add('has-convo');
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
  function stopRequest() {
    requestGeneration += 1;
    if (window.ASCAgent && ASCAgent.cancel) ASCAgent.cancel();
    log.querySelectorAll('.is-stream').forEach(function (el) {
      paint(el, el.dataset.raw || '', false);
    });
    setBusy(false);
  }

  function saveMessage(role, body, attachments) {
    if (!body) return;
    var conversation = chatGeneration;
    saveQueue = saveQueue.then(function () { return libs(); }).then(function (lib) {
      if (conversation !== chatGeneration) return;
      return lib.db.getSession().then(function (session) {
        if (!session || conversation !== chatGeneration) return;
        var write = chatId
          ? Promise.resolve(chatId)
          : lib.supabase.from('nero_chats').insert({ title: body.slice(0, 80) }).select('id').single()
            .then(function (res) {
              if (res.error || !res.data || conversation !== chatGeneration) return null;
              chatId = res.data.id; return chatId;
            });
        return write.then(function (id) {
          if (!id || conversation !== chatGeneration) return;
          return lib.supabase.from('nero_messages').insert({
            chat_id: id, role: role, body: body, attachments: attachments || []
          }).then(function () {
            return lib.supabase.from('nero_chats').update({ updated_at: new Date().toISOString() }).eq('id', id);
          });
        });
      });
    }).catch(function () {});
  }

  function askGemini(text, attachments, request) {
    if (request !== requestGeneration) return;
    if (!(window.ASCAgent && ASCAgent.configured && ASCAgent.configured())) {
      setBusy(false);
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
    Promise.resolve().then(function () {
      if (request !== requestGeneration) return;
      return ASCAgent.ask(text, function (ev) {
      if (request !== requestGeneration) return;
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
      }, { remote: true, stream: true, attachments: attachments });
    }).then(function () {
      if (request !== requestGeneration) return;
      setBusy(false);
    }).catch(function (err) {
      if (request !== requestGeneration) return;
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
  function sendRelay(text, refs, request) {
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
      if (request !== requestGeneration) return;
      setBusy(false);
      if (outcome === 'ok') { showConnect(false); mark('sent to Toni & Nero'); return; }
      if (outcome === 'http') { mark('Toni & Nero nisu primili poruku.'); return; }
      if (outcome === 'unconfigured') { mark('Toni & Nero još nisu spojeni.'); return; }
      if (relayUrl()) showConnect(true);
      mark(relayUrl() ? 'queued, sends when Tailscale reconnects' : 'Poruka čeka vezu.');
      if (!q) return;
      return q.enqueue(item).then(function () { refreshQueue(); arm(0); });
    }).catch(function () { if (request === requestGeneration) setBusy(false); });
  }

  function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    var request = ++requestGeneration;
    if (voiceMode !== 'idle') stopVoice();
    var refs = pending.map(function (f) { return { path: f.path, mime: f.mime, name: f.name }; });
    input.value = '';
    grow();
    pending = [];
    renderFiles();
    if (relayMode) {
      sendRelay(text, refs, request);
      return;
    }
    card('user', text);
    saveMessage('user', text, refs);
    setBusy(true);
    var ready = Promise.resolve().then(function () {
      if (request !== requestGeneration) return null;
      return window.ASCConcierge
        ? window.ASCConcierge.answer(text)
        : import(new URL('concierge.js', base).href).then(function (mod) { return mod.answer(text); });
    }).catch(function () { return null; });
    ready.then(function (fast) {
      if (request !== requestGeneration) return;
      if (fast && !refs.length) {
        card('assistant', fast);
        saveMessage('assistant', fast, []);
        setBusy(false);
      } else askGemini(text, refs, request);
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
    if (file.size > 7_000_000) { card('assistant', 'Datoteka je prevelika (najviše 7 MB).'); return; }
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
      stopRequest();
      return;
    }
    ask(input.value);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
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
    if (root.classList.contains('is-compact') && !e.target.closest('button, a, [role="button"]')) openComposer(true);
  });
  root.addEventListener('focusin', function (e) {
    if (e.target === input || !root.classList.contains('is-compact')) openComposer(false);
    if (e.target === input && log.children.length) {
      log.hidden = false;
      root.classList.add('has-convo');
      fit();
    }
  });
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
      stopRequest();
      if (voiceMode !== 'idle') stopVoice();
      chatGeneration += 1;
      chatId = null;
      log.innerHTML = '';
      log.hidden = true;
      root.classList.remove('has-convo');
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
    stopRequest();
    var conversation = ++chatGeneration;
    libs().then(function (lib) {
      return lib.supabase.from('nero_messages').select('role, body, created_at').eq('chat_id', id).order('created_at', { ascending: true });
    }).then(function (res) {
      if (conversation !== chatGeneration) return;
      if (!res || res.error || !res.data) return;
      chatId = id;
      log.innerHTML = '';
      res.data.forEach(function (row) { card(row.role === 'user' ? 'user' : 'assistant', row.body || ''); });
      if (window.ASCAgent && ASCAgent.recall) ASCAgent.recall(res.data);
      historyBox.hidden = true;
      log.hidden = !res.data.length;
      root.classList.toggle('has-convo', !!res.data.length);
      fit();
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
    input.value = (finals + interim).replace(/\s+/g, ' ').trim();
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

  // ---- Night-lamp caret ---------------------------------------------------
  // Text stays plain white. A mirrored, invisible copy of the text measures
  // where the native caret sits; a small lamp glow is placed there, lighting
  // the ~2.5 letters to its left, strongest at the baseline and nothing above
  // the caret top. Follows typing, clicks and arrow keys. No timed fading.
  (function () {
    var field = document.createElement('div');
    field.className = 'nero-field';
    input.parentNode.insertBefore(field, input);
    var mirror = document.createElement('div');
    mirror.className = 'nero-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    var lamp = document.createElement('i');
    lamp.className = 'nero-lamp';
    lamp.setAttribute('aria-hidden', 'true');
    field.appendChild(mirror);
    field.appendChild(input);
    field.appendChild(lamp);
    var raf = 0;
    function place() {
      raf = 0;
      var focused = document.activeElement === input;
      var pos = input.selectionStart, collapsed = pos === input.selectionEnd;
      if (!focused || !collapsed) { field.classList.remove('lamp-on'); return; }
      var v = input.value;
      mirror.innerHTML = esc(v.slice(0, pos)) + '<b class="nero-mark-caret">\u200b</b>' + esc(v.slice(pos)) + '\u200b';
      var m = mirror.querySelector('.nero-mark-caret');
      var x = m.offsetLeft - input.scrollLeft, y = m.offsetTop - input.scrollTop;
      field.style.setProperty('--cx', x + 'px');
      field.style.setProperty('--cy', y + 'px');
      field.style.setProperty('--ch', (m.offsetHeight || 20) + 'px');
      field.classList.add('lamp-on');
    }
    function queue() { if (!raf) raf = requestAnimationFrame(place); }
    ['input', 'keyup', 'keydown', 'click', 'focus', 'blur', 'select', 'scroll', 'mouseup'].forEach(function (t) { input.addEventListener(t, queue); });
    document.addEventListener('selectionchange', function () { if (document.activeElement === input) queue(); });
    addEventListener('resize', queue);
  })();
  // ---- Scroll merge ------------------------------------------------------
  // While the minimized composer passes over a card it melts into that card's
  // border (tinted from the card's accent), the card gets a quiet ring, and
  // the card's own actions surface as suggestion bubbles. Leaving a card
  // plays a short recoil wave and the bubbles fade 1.2s later.
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var active = null, fadeTimer = 0, scrollTimer = 0;
  function accentOf(card) {
    var cs = getComputedStyle(card);
    var v = cs.getPropertyValue('--acc').trim() || getComputedStyle(document.documentElement).getPropertyValue('--acc').trim();
    if (v) return v;
    var m = document.documentElement.getAttribute('data-module') || '';
    return ({ checkin: '#2fbf5b', scan: '#547898', warehouse: '#f0c052', customers: '#5A63E8', reminders: '#e0a33a', workshop: '#8b5cf6', users: '#63676f' })[m] || '#ff4e1b';
  }
  function labelOf(el) {
    return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  }
  function actionsOf(card) {
    var seen = {}, out = [];
    // Secondary actions that left the cards (data-nero-move) come first.
    var moved = [].slice.call(card.querySelectorAll('a[href][data-nero-move], button[data-nero-move]:not([disabled])'))
      .concat([].filter.call(document.querySelectorAll('a[href][data-nero-move], button[data-nero-move]:not([disabled])'), function (el) { return !el.closest('.card'); }));
    moved.forEach(function (el) {
      var t = labelOf(el); if (out.length >= 3 || !t || seen[t]) return;
      seen[t] = 1; out.push({ el: el, text: t });
    });
    [].forEach.call(card.querySelectorAll('a[href], button:not([disabled])'), function (el) {
      if (out.length >= 3 || el.closest('.nero-composer') || el.offsetParent === null) return;
      var t = labelOf(el); if (!t || t.length < 2 || seen[t]) return;
      seen[t] = 1; out.push({ el: el, text: t });
    });
    // Forms: offer the next empty field as the step to take.
    if (out.length < 3) [].forEach.call(card.querySelectorAll('input:not([type=hidden]), select, textarea'), function (el) {
      if (out.length >= 3 || el.value || el.offsetParent === null || el.closest('.nero-composer')) return;
      var lab = (el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('aria-label') || el.placeholder || '';
      lab = lab.replace(/\s+/g, ' ').trim().slice(0, 28);
      if (!lab || seen[lab]) return;
      seen[lab] = 1; out.push({ el: el, text: '→ ' + lab });
    });
    return out;
  }
  var lastCard = null;
  function runAction(a) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(a.el.tagName)) { a.el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); a.el.focus({ preventScroll: true }); }
    else { a.el.focus({ preventScroll: true }); a.el.click(); }
  }
  function makeBubble(a, i, tint) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'nero-bubble'; b.textContent = a.text;
    b.style.setProperty('--i', i);
    if (tint) b.style.setProperty('--merge-tint', tint);
    b.addEventListener('click', function () { if (!b.dataset.dragged) runAction(a); delete b.dataset.dragged; });
    b._act = a;
    return b;
  }
  // Bubbles anchor on the right; each next one stacks to the left. The step
  // from the card just left (if any) sits leftmost, half its own colour and
  // half the merge colour, and nudges to say it can be combined.
  function showSuggest(card) {
    clearTimeout(fadeTimer);
    var acts = actionsOf(card), tint = accentOf(card);
    suggest.style.setProperty('--merge-tint', tint);
    suggest.innerHTML = '';
    acts.forEach(function (a, i) { suggest.appendChild(makeBubble(a, i)); });
    if (lastCard && lastCard !== card && document.contains(lastCard)) {
      var prev = actionsOf(lastCard)[0];
      if (prev && acts.length) {
        var link = makeBubble(prev, acts.length, accentOf(lastCard));
        link.classList.add('is-linked');
        link.style.setProperty('--join-tint', tint);
        suggest.appendChild(link);
        armMerge(link);
      }
    }
    suggest.classList.toggle('on', acts.length > 0);
    suggest.inert = acts.length === 0;
    ripple();
  }
  // Swipe the linked (left) bubble into its right neighbour → combined workflow.
  function armMerge(link) {
    var x0 = 0, dx = 0, id = null;
    link.addEventListener('pointerdown', function (e) { id = e.pointerId; x0 = e.clientX; dx = 0; link.setPointerCapture(id); link.classList.add('is-drag'); });
    link.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id) return; dx = Math.max(0, e.clientX - x0);
      link.style.transform = 'translate3d(' + dx + 'px,0,0)';
    });
    function end(e) {
      if (e.pointerId !== id) return; id = null; link.classList.remove('is-drag'); link.style.transform = '';
      var target = link.previousElementSibling;
      if (dx > 6) link.dataset.dragged = '1';
      if (target && dx > Math.min(90, target.offsetWidth * 0.6)) openCombined(link._act, target._act);
    }
    link.addEventListener('pointerup', end); link.addEventListener('pointercancel', end);
  }
  function openCombined(first, second) {
    var old = document.querySelector('.nero-flow'); if (old) old.remove();
    var pop = document.createElement('div');
    pop.className = 'nero-flow'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Spojeni tijek');
    pop.innerHTML = '<div class="nero-flow-card"><b>Spojeni tijek</b><ol>' +
      '<li><button type="button" data-step="0">' + esc(first.text) + '</button></li>' +
      '<li><button type="button" data-step="1">' + esc(second.text) + '</button></li></ol>' +
      '<button type="button" class="nero-flow-close" aria-label="Zatvori">×</button></div>';
    document.body.appendChild(pop);
    var steps = [first, second];
    pop.querySelectorAll('[data-step]').forEach(function (b) { b.addEventListener('click', function () { pop.remove(); runAction(steps[+b.dataset.step]); }); });
    pop.querySelector('.nero-flow-close').addEventListener('click', function () { pop.remove(); });
    openComposer(false);
    if (log.hidden && log.children.length) { log.hidden = false; root.classList.add('has-convo'); }
  }
  function ripple() {
    if (reduce) return;
    suggest.classList.remove('nero-ripple'); void suggest.offsetWidth; suggest.classList.add('nero-ripple');
    setTimeout(function () { suggest.classList.remove('nero-ripple'); }, 500);
  }
  function engage(card) {
    if (active === card) return;
    if (active) disengage(active);
    active = card;
    var tint = accentOf(card);
    card.style.setProperty('--merge-tint', tint);
    root.style.setProperty('--merge-tint', tint);
    card.classList.remove('nero-next');
    card.classList.add('nero-merged');
    root.classList.add('is-merged');
    showSuggest(card);
  }
  function disengage(card) {
    card.classList.remove('nero-merged');
    if (lastCard && lastCard !== card) lastCard.classList.remove('nero-next');
    lastCard = card; card.classList.add('nero-next');
    if (!reduce) {
      card.classList.remove('nero-recoil'); void card.offsetWidth; card.classList.add('nero-recoil');
      setTimeout(function () { card.classList.remove('nero-recoil'); }, 450);
    }
    if (active === card) { active = null; root.classList.remove('is-merged'); }
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(function () { if (!active) { suggest.classList.remove('on'); suggest.inert = true; ripple(); } }, 1200);
  }
  if ('IntersectionObserver' in window) {
    var cards = [].slice.call(document.querySelectorAll('main .card, .shell .card'));
    var band = function () {
      var h = Math.ceil(root.getBoundingClientRect().height || 60);
      return '-' + Math.max(0, innerHeight - h - 24) + 'px 0px 0px 0px';
    };
    var io = null;
    var watch = function () {
      if (io) io.disconnect();
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) engage(e.target);
          else if (active === e.target) disengage(e.target);
        });
      }, { rootMargin: band(), threshold: 0 });
      cards.forEach(function (c) { io.observe(c); });
    };
    watch();
    addEventListener('resize', watch);
  }
  // Minimize while scrolling; rise again only when the person types.
  addEventListener('scroll', function () {
    root.classList.add('is-scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { root.classList.remove('is-scrolling'); }, 220);
    if (!root.contains(document.activeElement)) maybeCollapse();
  }, { passive: true });
  addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(root);
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
