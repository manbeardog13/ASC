/* Nero, collapsed. The full purple card stays on the board. On every other
   page she is this one glass row: same violet, same send, semi-transparent
   and only as tall as the line you type. */
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
  ensure('concierge.js', true);
  ensure('agent-config.js', false);
  ensure('qr.js', false);
  ensure('agent-gemini.js', false);

  document.documentElement.classList.add('has-composer');

  var root = document.createElement('form');
  root.className = 'nero-composer';
  root.id = 'neroComposer';
  root.setAttribute('role', 'search');
  root.setAttribute('aria-label', 'Nero');
  root.innerHTML =
    '<p class="nero-reply" hidden></p>' +
    '<div class="nero-bar">' +
      '<input class="nero-input" type="text" enterkeyhint="send" autocomplete="off" placeholder="Pitaj Nero…" aria-label="Pitaj Nero">' +
      '<button class="nero-mic" type="button" hidden aria-label="Govori Nero" aria-pressed="false">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0012 0M12 17v3"/></svg>' +
      '</button>' +
      '<button class="nero-send" type="submit" aria-label="Pošalji">' +
        '<svg class="nero-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>' +
        '<svg class="nero-stop" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>' +
      '</button>' +
    '</div>';
  document.body.appendChild(root);

  var input = root.querySelector('.nero-input');
  var reply = root.querySelector('.nero-reply');
  var send = root.querySelector('.nero-send');
  var mic = root.querySelector('.nero-mic');
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function show(html) {
    reply.innerHTML = html;
    reply.hidden = false;
    root.classList.add('is-live');
  }
  function setBusy(on) {
    busy = on;
    root.classList.toggle('is-busy', on);
    send.setAttribute('aria-label', on ? 'Stani' : 'Pošalji');
  }

  function askGemini(text, me) {
    if (window.ASCAgent && ASCAgent.configured && ASCAgent.configured()) {
      setBusy(true);
      var ans = function (h) { show(me + '<span class="nero-ans">' + h + '</span>'); };
      ans('Razmišljam…');
      ASCAgent.ask(text, function (ev) {
        if (ev.type === 'text') ans(esc(ev.text));
        else if (ev.type === 'tool') ans('Radim…');
        else if (ev.type === 'error') ans(esc(ev.message || 'Greška.'));
      }, { remote: true }).then(function (txt) {
        setBusy(false);
        if (txt) ans(esc(txt));
      }).catch(function (err) {
        setBusy(false);
        if (err && err.code === 'cancelled') return;
        ans('Veza je pukla — pokušaj ponovno.');
      });
    } else {
      show(me + '<span class="nero-ans">Tražim…</span>');
      setTimeout(function () {
        location.href = new URL('workshop.html?q=' + encodeURIComponent(text), base).href;
      }, 120);
    }
  }

  function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    input.value = '';
    var me = '<span class="nero-me">' + esc(text) + '</span>';
    var ready = window.ASCConcierge
      ? Promise.resolve(window.ASCConcierge.answer(text))
      : import(new URL('concierge.js', base).href).then(function (mod) { return mod.answer(text); }).catch(function () { return null; });
    setBusy(true);
    ready.then(function (fast) {
      if (fast) {
        show(me + '<span class="nero-ans">' + esc(fast) + '</span>');
        setBusy(false);
      } else askGemini(text, me);
    });
  }

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
    if (e.key === 'Escape') {
      reply.hidden = true;
      reply.innerHTML = '';
      root.classList.remove('is-live');
      input.blur();
    }
  });

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    mic.hidden = false;
    var rec = null;
    mic.addEventListener('click', function () {
      if (rec) { try { rec.stop(); } catch (e) {} return; }
      rec = new SR();
      rec.lang = 'hr-HR';
      rec.continuous = false;
      rec.interimResults = true;
      mic.setAttribute('aria-pressed', 'true');
      rec.onresult = function (ev) {
        var said = '';
        for (var i = 0; i < ev.results.length; i++) said += ev.results[i][0].transcript;
        input.value = said.trim();
      };
      rec.onend = rec.onerror = function () {
        rec = null;
        mic.setAttribute('aria-pressed', 'false');
      };
      try { rec.start(); } catch (e) { rec = null; mic.setAttribute('aria-pressed', 'false'); }
    });
  }
})();
