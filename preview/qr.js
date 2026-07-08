/* ============================================================================
   preview/qr.js — shared QR layer for the ASC preview. Makes three things real:
     • click a user  → their card (a small set→owner registry powers the links)
     • click a sticker → a printable QR label, instantly (no network on click)
     • scan a sticker  → opens the set (real camera decode → set-detail.html?code=)
   Deps are loaded (CDN) only by the pages that need them:
     qrcode-generator → global `qrcode` (SVG QR)   ·   html5-qrcode → `Html5Qrcode`.
   Ported from the SPA's js/qr.js + qrlabel.js + scanner.js. Croatian copy. $0.
   ============================================================================ */
(function () {
  'use strict';

  // ---- Set registry (code → set), compiled from the customers/warehouse data --
  var OWNERS = {
    marko: 'Marko Babić', ana: 'Ana Kovačević', ivan: 'Ivan Perić', petra: 'Petra Novak',
    luka: 'Luka Marić', josip: 'Josip Horvat', ivana: 'Ivana Jurić'
  };
  function S(code, owner, plate, vehicle, season, status, loc) {
    return { code: code, owner: owner, who: OWNERS[owner], plate: plate, vehicle: vehicle,
             season: season, status: status, loc: loc || '' };
  }
  var LIST = [
    S('ASC-2026-0248', 'ivan',  'DU-234-AB', 'VW Golf VII',    'winter',     'in_storage',  'Zona A · Regal 4 · Polica 2 · Mjesto 12'),
    S('ASC-2026-0247', 'ana',   'DU-881-KL', 'Škoda Octavia',  'summer',     'in_storage',  'Zona B · Regal 1 · Polica 4'),
    S('ASC-2026-0250', 'ana',   'DU-410-AK', 'BMW X1',         'winter',     'in_storage',  'Zona B · Regal 3 · Polica 1'),
    S('ASC-2026-0251', 'ana',   'DU-233-AN', 'Fiat 500',       'all_season', 'reserved',    ''),
    S('ASC-2026-0246', 'marko', 'DU-455-MN', 'Audi A4',        'winter',     'in_storage',  'Zona A · Regal 3 · Polica 2'),
    S('ASC-2026-0245', 'petra', 'DU-662-PP', 'Renault Clio',   'all_season', 'in_storage',  'Zona C · Regal 2 · Polica 1'),
    S('ASC-2026-0244', 'luka',  'DU-733-XY', 'BMW 320d',       'summer',     'in_storage',  'Zona B · Regal 4 · Polica 3'),
    S('ASC-2026-0243', 'josip', 'DU-118-JH', 'Mercedes C220',  'winter',     'in_storage',  'Zona A · Regal 5 · Mjesto 7'),
    S('ASC-2026-0239', 'ivana', 'DU-509-IJ', 'Toyota RAV4',    'summer',     'in_storage',  'Zona B · Regal 2'),
    S('ASC-2026-0231', 'marko', 'DU-902-MB', 'VW Passat',      'summer',     'in_storage',  'Zona A · Regal 2'),
    S('ASC-2026-0155', 'marko', 'DU-455-MN', 'Audi A4',        'all_season', 'reserved',    ''),
    S('ASC-2026-0142', 'ivan',  'DU-234-AB', 'VW Golf VII',    'summer',     'checked_out', ''),
    S('ASC-2026-0121', 'ivana', 'DU-509-IJ', 'Toyota RAV4',    'winter',     'reserved',    ''),
    S('ASC-2026-0187', 'luka',  'DU-733-XY', 'BMW 320d',       'winter',     'checked_out', '')
  ];
  var BY_CODE = {};
  LIST.forEach(function (s) { BY_CODE[s.code] = s; });

  var SEASON = { winter: 'Zimske', summer: 'Ljetne', all_season: 'Cjelogodišnje' };
  var STATUS = { in_storage: 'Spremljeno', reserved: 'Rezervirano', checked_out: 'Preuzeto' };

  // ---- code format + parsing (ported from js/qr.js) ---------------------------
  function checksum(code) {
    var hash = 0x811c9dc5, s = String(code).toUpperCase();
    for (var i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return (hash >>> 0).toString(36).toUpperCase().slice(-4).padStart(4, '0');
  }
  function normalize(raw, typed) {
    if (raw == null) return null;
    var s = String(raw).trim().toUpperCase().replace(/\s+/g, '').split(/[?#]/)[0];
    if (!s) return null;
    var pad = function (seq) { return seq.padStart(4, '0'); };
    var m = s.match(/^ASC-(\d{4})-(\d{1,6})$/); if (m) return 'ASC-' + m[1] + '-' + pad(m[2]);
    m = s.match(/ASC-(\d{4})-(\d{1,6})/);       if (m) return 'ASC-' + m[1] + '-' + pad(m[2]);
    if (typed) {
      m = s.match(/^(\d{4})-(\d{1,6})$/); if (m) return 'ASC-' + m[1] + '-' + pad(m[2]);
      m = s.match(/^(\d{1,6})$/);         if (m) return 'ASC-2026-' + pad(m[1]);
    }
    return null;
  }
  // Pull a code out of anything a scan yields (?code=, #/set/CODE, or a bare code).
  function extractCode(text, typed) {
    if (text == null) return null;
    var s = String(text).trim(); if (!s) return null;
    var qm = s.match(/[?&]code=([^&#]+)/i);
    if (qm) { try { return normalize(decodeURIComponent(qm[1]), typed); } catch (e) { return normalize(qm[1], typed); } }
    var marker = '#/set/', i = s.indexOf(marker);
    var head = (i !== -1 ? s.slice(i + marker.length) : s).split('?')[0];
    try { head = decodeURIComponent(head); } catch (e) { /* keep raw */ }
    return normalize(head, typed);
  }
  // Absolute URL so a plain phone-camera scan opens the preview record.
  function deepLink(code) {
    var dir = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    return dir + 'set-detail.html?code=' + encodeURIComponent(code) + '&k=' + checksum(code);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- QR SVG (needs global `qrcode`) -----------------------------------------
  function svg(code, cellSize) {
    if (!window.qrcode) return '';
    var qr = window.qrcode(0, 'H');          // H = 30% error correction (rugged tire label)
    qr.addData(deepLink(code));
    qr.make();
    return qr.createSvgTag({ cellSize: cellSize || 6, margin: 2, scalable: true });
  }

  // ---- sticker → in-app overlay (iPhone-safe: always a way back) --------------
  // The old version did window.open()+auto window.print(): on iOS that spawns a
  // new tab with the print sheet and NO way back into the app (you had to kill it).
  // Now the label renders as a full-screen sheet INSIDE the page, with a top-left
  // Back button (also ESC / backdrop tap / OS back-swipe). Printing is an explicit
  // button; scoped @media print rules in app.css show only the label. Shape + which
  // rows to show come from the Postavke menu (localStorage), read here.
  var stickerPushed = false, stickerPop = null, stickerPrev = null, stickerBg = null;
  function stickerPref(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch(e){ return d; } }
  function stickerKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSticker(); return; }
    if (e.key === 'Tab') {                                   // keep focus inside the sheet
      var m = document.querySelector('.sticker-modal'); if (!m) return;
      var f = m.querySelectorAll('button'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  function closeSticker(fromPop) {
    var m = document.querySelector('.sticker-modal'); if (!m) return;
    document.removeEventListener('keydown', stickerKey, true);
    if (stickerPop) { window.removeEventListener('popstate', stickerPop); stickerPop = null; }
    if (stickerBg) { stickerBg.forEach(function (el) { try { el.inert = false; } catch(e){} }); stickerBg = null; }  // un-inert the background
    if (m.parentNode) m.parentNode.removeChild(m);
    document.documentElement.classList.remove('sticker-lock');
    try { if (stickerPrev && stickerPrev.focus) stickerPrev.focus({ preventScroll: true }); } catch(e){}   // return focus to the trigger
    stickerPrev = null;
    if (stickerPushed && !fromPop) { stickerPushed = false; try { history.back(); } catch(e){} }
    else stickerPushed = false;
  }
  function printSticker(code) {
    var set = BY_CODE[code] || { code: code, who: '', vehicle: '', plate: '', season: '', loc: '' };
    var qrMarkup = svg(code, 8) || ('<div style="font:900 20px monospace">' + esc(code) + '</div>');
    var season = SEASON[set.season] || '';
    var shape = String(stickerPref('asc.stickerShape', 'rounded')).replace(/[^a-z]/g, '') || 'rounded';
    var showOwner = stickerPref('asc.stickerOwner', '1') !== '0';
    var showLoc = stickerPref('asc.stickerLoc', '1') !== '0';
    var trigger = document.activeElement;    // restore focus here on close
    var hadPush = stickerPushed;             // reuse our history entry instead of stacking a new one
    closeSticker(true);                      // tear down any sheet already open WITHOUT touching history

    var m = document.createElement('div');
    m.className = 'sticker-modal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Naljepnica ' + code);
    m.innerHTML =
      '<div class="sm-chrome">' +
        '<button class="sm-back" type="button" aria-label="Natrag">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg><span>Natrag</span></button>' +
        '<button class="sm-print" type="button">' +
          '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z"/></svg><span>Ispiši</span></button>' +
      '</div>' +
      '<div class="sm-scroll">' +
        '<div class="sm-label sm-shape-' + esc(shape) + '">' +
          '<div class="sm-top"><span class="sm-brand">ASC</span>' + (season ? '<span class="sm-season">' + esc(season) + '</span>' : '') + '</div>' +
          '<div class="sm-qr">' + qrMarkup + '</div>' +
          '<div class="sm-code">' + esc(code) + '</div>' +
          (showOwner && set.who ? '<div class="sm-who">' + esc(set.who) + '</div>' : '') +
          (showOwner ? '<div class="sm-sub">' + esc([set.vehicle, set.plate].filter(Boolean).join(' · ')) + '</div>' : '') +
          (showLoc && set.loc ? '<div class="sm-loc"><span class="sm-lk">Lokacija</span>' + esc(set.loc) + '</div>' : '') +
          '<div class="sm-foot">Skenirajte kamerom telefona · ' + esc(code) + '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    document.documentElement.classList.add('sticker-lock');
    stickerPrev = (trigger && trigger !== document.body) ? trigger : null;
    stickerBg = [].filter.call(document.body.children, function (el) { return el !== m; });   // background goes inert (real modal trap)
    stickerBg.forEach(function (el) { try { el.inert = true; } catch(e){} });

    m.querySelector('.sm-back').addEventListener('click', function () { closeSticker(); });
    m.querySelector('.sm-print').addEventListener('click', function () { try { window.print(); } catch(e){} });
    m.addEventListener('click', function (e) { if (e.target === m || e.target.className === 'sm-scroll') closeSticker(); });
    document.addEventListener('keydown', stickerKey, true);
    setTimeout(function () { try { m.querySelector('.sm-back').focus({ preventScroll: true }); } catch(e){} }, 30);  // move focus INTO the dialog
    // history: reuse the entry we already own (replace case), else push a fresh one, so the
    // iOS back-swipe / Android back closes the sheet without stacking dead entries.
    if (hadPush) { stickerPushed = true; }
    else { try { history.pushState({ ascSticker: 1 }, ''); stickerPushed = true; } catch(e) { stickerPushed = false; } }
    if (stickerPushed) { stickerPop = function () { closeSticker(true); }; window.addEventListener('popstate', stickerPop); }
    return true;
  }

  // ---- camera scanning (needs global Html5Qrcode) -----------------------------
  var active = null, starting = null;
  function stopScan() {
    var p = starting ? starting.catch(function () {}) : Promise.resolve();
    return p.then(function () {
      if (!active) return;
      var inst = active; active = null;
      return inst.stop().then(function () { return inst.clear(); }).catch(function () {});
    });
  }
  function scanInto(elId, onResult, onError) {
    return stopScan().then(function () {
      var H = window.Html5Qrcode;
      if (!H) { if (onError) onError(new Error('nolib')); return; }
      var inst = new H(elId, { verbose: false }); active = inst;
      var handled = false;
      starting = inst.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 240, height: 240 } },
        function (text) { if (handled) return; handled = true; var code = extractCode(text); stopScan(); onResult(code, text); },
        function () { /* per-frame misses are normal */ }
      ).catch(function (err) { if (onError) onError(err); });
      return starting.then(function () { starting = null; }, function () { starting = null; });
    });
  }
  function scanFile(file) {
    var H = window.Html5Qrcode;
    if (!H) return Promise.reject(new Error('nolib'));
    var tmp = document.createElement('div'); tmp.style.display = 'none';
    tmp.id = 'fs-' + Math.floor(performance.now());
    document.body.appendChild(tmp);
    var inst = new H(tmp.id);
    var cleanup = function () { try { inst.clear(); } catch (e) {} tmp.remove(); };
    return inst.scanFile(file, false).then(
      function (text) { cleanup(); return extractCode(text); },
      function (err) { cleanup(); throw err; }
    );
  }

  window.ASCQR = {
    normalize: normalize, extractCode: extractCode, deepLink: deepLink, checksum: checksum,
    svg: svg, printSticker: printSticker,
    scanInto: scanInto, stopScan: stopScan, scanFile: scanFile,
    lookup: function (code) { return BY_CODE[code] || null; },
    ownerId: function (code) { var s = BY_CODE[code]; return s ? s.owner : null; },
    SEASON: SEASON, STATUS: STATUS
  };
})();
