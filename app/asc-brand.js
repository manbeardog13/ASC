/* ASC's original silhouette, with a black lacquer / red underglow treatment.
   The splash is a presentation layer only: it never reveals the auth gate. */
(function () {
  'use strict';
  if (window.ASCBrand) return;
  var root = document.documentElement;
  var source = document.currentScript && document.currentScript.src;
  var base = new URL('.', source || new URL('asc-brand.js', location.href));
  var logoURL = new URL('assets/logo.png', base).href;
  var entry = /\/(?:login|dashboard)\.html$/.test(location.pathname);
  var media = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = function () { return !!(media && media.matches); };
  root.style.setProperty('--asc-brand-mask', 'url("' + logoURL + '")');

  function enhance(scope) {
    var images = scope.querySelectorAll('img.logo, img.auth-logo, img.sp-mark, img[data-asc-brand]');
    images.forEach(function (img) {
      if (img.closest('.asc-brand-frame')) return;
      var frame = document.createElement('span');
      frame.className = 'asc-brand-frame';
      if (img.classList.contains('sp-mark')) frame.classList.add('asc-brand-frame--entry');
      img.parentNode.insertBefore(frame, img);
      frame.appendChild(img);
      img.classList.add('asc-brandmark');
    });
  }
  window.ASCBrand = { logoURL: logoURL, enhance: enhance };

  function read(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } }
  function write(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} }
  var handoffAt = Number(read('asc.splash.handoff'));
  try { sessionStorage.removeItem('asc.splash.handoff'); } catch (_) {}
  var recentHandoff = handoffAt > 0 && Date.now() - handoffAt >= 0 && Date.now() - handoffAt < 8000;
  var oauth = /(?:access_token|refresh_token|error|error_description)=/.test(location.hash);
  var warm = read('asc.splash.warm') === '1';
  var mode = entry ? (recentHandoff ? 'handoff' : oauth ? 'oauth' : warm ? null : 'cold') : null;
  var active = !!mode;
  var started = performance.now();
  var finishTimer = 0;
  var hideTimer = 0;
  var watchdog = 0;
  var navigationTimer = 0;
  var overlay;

  function paintState() {
    root.classList.toggle('splashing', active);
    ['cold', 'oauth', 'handoff'].forEach(function (name) {
      root.classList.toggle('splash-' + name, active && mode === name);
    });
  }
  // This runs in the head, so cold entries cannot flash the application first.
  paintState();

  function ensureOverlay() {
    if (!document.body) return null;
    overlay = document.getElementById('splash');
    if (!overlay && active) {
      overlay = document.createElement('div');
      overlay.id = 'splash';
      overlay.innerHTML = '<div class="sp-core"><img class="sp-mark" alt="ASC" width="488" height="92"></div>';
      overlay.querySelector('img').src = logoURL;
      document.body.insertBefore(overlay, document.body.firstChild);
    }
    if (!overlay) return null;
    overlay.classList.add('asc-entry');
    overlay.setAttribute('aria-label', 'ASC');
    var mark = overlay.querySelector('.sp-mark');
    if (mark) mark.alt = 'ASC';
    var skip = overlay.querySelector('.asc-entry-skip');
    if (!skip) {
      skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'asc-entry-skip';
      skip.textContent = 'Preskoči uvod';
      skip.addEventListener('click', abort);
      overlay.appendChild(skip);
    }
    overlay.hidden = !active;
    overlay.setAttribute('aria-hidden', String(!active));
    overlay.classList.toggle('out', !active);
    enhance(overlay);
    return overlay;
  }

  function finish(immediate) {
    clearTimeout(finishTimer);
    clearTimeout(watchdog);
    if (!active) return;
    active = false;
    paintState();
    write('asc.splash.warm', '1');
    if (overlay) {
      overlay.classList.add('out');
      overlay.setAttribute('aria-hidden', 'true');
      // Never leave focus on a control inside the dismissed introduction.
      if (overlay.contains(document.activeElement)) document.activeElement.blur();
      clearTimeout(hideTimer);
      if (immediate || reduced()) overlay.hidden = true;
      else hideTimer = setTimeout(function () { if (!active) overlay.hidden = true; }, 240);
    }
    window.dispatchEvent(new Event('asc:reveal'));
  }

  function done() {
    if (!active) return;
    var minimum = reduced() ? 0 : mode === 'cold' ? 2200 : mode === 'oauth' ? 450 : 180;
    clearTimeout(finishTimer);
    finishTimer = setTimeout(function () { finish(false); }, Math.max(0, minimum - (performance.now() - started)));
  }
  function abort() { finish(true); }
  function armWatchdog() {
    clearTimeout(watchdog);
    // Auth/asset/network failures must never turn an introduction into a lock screen.
    // The independent auth gate retains its own visibility and redirect behavior.
    watchdog = setTimeout(function () { finish(true); }, 6000);
  }
  function bloom(callback) {
    var alreadyCovered = active;
    clearTimeout(finishTimer);
    clearTimeout(hideTimer);
    clearTimeout(navigationTimer);
    mode = 'handoff';
    api.mode = mode;
    started = performance.now();
    active = true;
    paintState();
    ensureOverlay();
    armWatchdog();
    // Dismissing the visual must not cancel an authentication redirect.
    if (typeof callback === 'function') {
      navigationTimer = setTimeout(callback, reduced() || alreadyCovered ? 0 : 180);
    }
  }
  function handoff(url) {
    var next = new URL(url, location.href);
    if (next.origin !== location.origin) throw new Error('ASC handoff must stay on this origin');
    write('asc.splash.handoff', String(Date.now()));
    write('asc.splash.warm', '1');
    location.replace(next.href);
  }
  var api = window.ASCSplash = { mode: mode, done: done, bloom: bloom, handoff: handoff, abort: abort };
  if (active) armWatchdog();

  function ready() {
    ensureOverlay();
    enhance(document);
    document.addEventListener('keydown', function (event) {
      if (active && event.key === 'Escape') { event.preventDefault(); abort(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();

  function pause() { root.classList.toggle('asc-brand-paused', document.hidden); }
  document.addEventListener('visibilitychange', pause);
  pause();
  function motionChanged() { if (reduced() && active) finish(true); }
  if (media && media.addEventListener) media.addEventListener('change', motionChanged);
  window.addEventListener('pagehide', function () {
    clearTimeout(navigationTimer);
    clearTimeout(finishTimer);
    clearTimeout(hideTimer);
    clearTimeout(watchdog);
  });
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      finish(true);
      if (overlay) { overlay.hidden = true; overlay.classList.add('out'); }
      paintState();
    }
  });
})();
