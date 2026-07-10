/* ============================================================================
   app/qr.js — shared QR layer for the ASC live staging app. Makes three things
   real:
     • click a sticker → a printable QR label, instantly (no network on click);
       callers pass live data (who/vehicle/plate/season/loc) — the old mock
       registry is empty so no fake person can ever surface
     • print a report  → the A4 "Potvrda o pohrani guma" (printReport(code, data))
     • scan a sticker  → opens the set (real camera decode → set-detail.html?code=)
   Deps are loaded (CDN) only by the pages that need them:
     qrcode-generator → global `qrcode` (SVG QR)   ·   html5-qrcode → `Html5Qrcode`.
   Ported from the SPA's js/qr.js + qrlabel.js + scanner.js. Croatian copy. $0.
   ============================================================================ */
(function () {
  'use strict';

  // ---- Set registry (code → set) — LIVE staging: the mock registry is EMPTY.
  // Real data lives in Supabase; pages pass what they know into printSticker /
  // printReport via the optional `data` argument. BY_CODE lookups return null.
  var LIST = [];
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
    a4Lock(false);                                           // drop the report's @page A4 lock
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
  // Shared sheet scaffolding used by BOTH the sticker and the customer report:
  // creates the full-screen iPhone-safe overlay (Back + Ispiši chrome, inert
  // background, focus trap, history entry) and drops `inner` into the scroller.
  function openSheet(inner, ariaLabel, scrollClass) {
    var trigger = document.activeElement;    // restore focus here on close
    var hadPush = stickerPushed;             // reuse our history entry instead of stacking a new one
    closeSticker(true);                      // tear down any sheet already open WITHOUT touching history

    var m = document.createElement('div');
    m.className = 'sticker-modal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', ariaLabel);
    m.innerHTML =
      '<div class="sm-chrome">' +
        '<button class="sm-back" type="button" aria-label="Natrag">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg><span>Natrag</span></button>' +
        '<button class="sm-print" type="button">' +
          '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z"/></svg><span>Ispiši</span></button>' +
      '</div>' +
      '<div class="sm-scroll' + (scrollClass ? ' ' + scrollClass : '') + '">' + inner + '</div>';
    document.body.appendChild(m);
    document.documentElement.classList.add('sticker-lock');
    stickerPrev = (trigger && trigger !== document.body) ? trigger : null;
    stickerBg = [].filter.call(document.body.children, function (el) { return el !== m; });   // background goes inert (real modal trap)
    stickerBg.forEach(function (el) { try { el.inert = true; } catch(e){} });

    m.querySelector('.sm-back').addEventListener('click', function () { closeSticker(); });
    m.querySelector('.sm-print').addEventListener('click', function () { try { window.print(); } catch(e){} });
    m.addEventListener('click', function (e) {
      var cls = e.target && e.target.className ? String(e.target.className) : '';
      if (e.target === m || cls.indexOf('sm-scroll') === 0) closeSticker();
    });
    document.addEventListener('keydown', stickerKey, true);
    setTimeout(function () { try { m.querySelector('.sm-back').focus({ preventScroll: true }); } catch(e){} }, 30);  // move focus INTO the dialog
    // history: reuse the entry we already own (replace case), else push a fresh one, so the
    // iOS back-swipe / Android back closes the sheet without stacking dead entries.
    if (hadPush) { stickerPushed = true; }
    else { try { history.pushState({ ascSticker: 1 }, ''); stickerPushed = true; } catch(e) { stickerPushed = false; } }
    if (stickerPushed) { stickerPop = function () { closeSticker(true); }; window.addEventListener('popstate', stickerPop); }
    return m;
  }

  // `data` (optional, like printReport's) carries the live fields the caller
  // knows — who / vehicle / plate / season / loc — and wins over the registry.
  function printSticker(code, data) {
    data = data || {};
    var reg = BY_CODE[code] || {};
    var set = {
      code: code,
      who: data.who || reg.who || '',
      vehicle: data.vehicle || reg.vehicle || '',
      plate: data.plate || reg.plate || '',
      season: data.season || reg.season || '',
      loc: data.loc || data.location || reg.loc || ''
    };
    var qrMarkup = svg(code, 8) || ('<div style="font:900 20px monospace">' + esc(code) + '</div>');
    var season = SEASON[set.season] || set.season || '';
    var shape = String(stickerPref('asc.stickerShape', 'rounded')).replace(/[^a-z]/g, '') || 'rounded';
    var showOwner = stickerPref('asc.stickerOwner', '1') !== '0';
    var showLoc = stickerPref('asc.stickerLoc', '1') !== '0';
    var inner =
      '<div class="sm-label sm-shape-' + esc(shape) + '">' +
        '<div class="sm-top"><span class="sm-brand">ASC</span>' + (season ? '<span class="sm-season">' + esc(season) + '</span>' : '') + '</div>' +
        '<div class="sm-qr">' + qrMarkup + '</div>' +
        '<div class="sm-code">' + esc(code) + '</div>' +
        (showOwner && set.who ? '<div class="sm-who">' + esc(set.who) + '</div>' : '') +
        (showOwner ? '<div class="sm-sub">' + esc([set.vehicle, set.plate].filter(Boolean).join(' · ')) + '</div>' : '') +
        (showLoc && set.loc ? '<div class="sm-loc"><span class="sm-lk">Lokacija</span>' + esc(set.loc) + '</div>' : '') +
        '<div class="sm-foot">Skenirajte kamerom telefona · ' + esc(code) + '</div>' +
      '</div>';
    openSheet(inner, 'Naljepnica ' + code);
    return true;
  }

  // ---- customer report → A4-locked ledger "Potvrda o pohrani guma" ------------
  // Given to the customer alongside the QR label. `data` (optional) carries the
  // rich fields set-detail scrapes from the page; anything missing falls back to
  // the registry set or a neutral "—" so the ledger rhythm never collapses.
  // Layout: continuous ledger (invoice register) — labeled section rules + full-
  // width label→value rows on one shared right rail; no boxed containers.
  function todayHr() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + '.';
  }
  var BOLTS = [{ v: 'in_trunk', t: 'U prtljažniku kupca' }, { v: 'stored', t: 'Uskladišteno' }];
  var HUBS = [{ v: 'in_trunk', t: 'U prtljažniku kupca' }, { v: 'stored', t: 'Uskladišteno' }, { v: 'none', t: 'Ne postoje' }];
  function optRow(k, opts, chosen) {
    return '<div class="rp-f"><span class="rp-k">' + esc(k) + '</span><span class="rp-v rp-opts">' +
      opts.map(function (o) { return '<span class="rp-opt' + (o.v === chosen ? ' sel' : '') + '"><i></i>' + esc(o.t) + '</span>'; }).join('') +
      '</span></div>';
  }
  function rline(k, v, tab, cls) {
    return '<div class="rp-f' + (cls ? ' ' + cls : '') + '"><span class="rp-k">' + esc(k) +
           '</span><span class="rp-v' + (tab ? ' tab' : '') + '">' + esc(v || '—') + '</span></div>';
  }
  function rsec(title, meta, body) {
    return '<section class="rp-sec"><div class="rp-sh"><span class="rp-st">' + esc(title) + '</span>' +
           (meta ? '<span class="rp-shm">' + esc(meta) + '</span>' : '') + '</div>' + body + '</section>';
  }
  // @page can't be scoped by CSS selector, so the A4 lock is injected only while
  // the report sheet is open (removed in closeSticker) — sticker printing keeps
  // the browser's default page setup.
  function a4Lock(on) {
    var el = document.getElementById('ascA4Page');
    if (on && !el) {
      el = document.createElement('style'); el.id = 'ascA4Page';
      el.textContent = '@media print{@page{size:A4;margin:0}}';
      document.head.appendChild(el);
    } else if (!on && el) el.remove();
  }
  function printReport(code, data) {
    data = data || {};
    var set = BY_CODE[code] || {};
    var who = data.who || set.who || '';
    var vehicle = data.vehicle || set.vehicle || '';
    var plate = data.plate || set.plate || '';
    var season = SEASON[data.season || set.season] || data.season || '';
    var status = STATUS[data.status || set.status] || data.status || '';
    var loc = data.location || set.loc || '';
    // Legacy boolean compat: true means stored; false/unset means UNRECORDED —
    // never fabricate 'in_trunk' (a blackened square on a signed document).
    if (data.hubcaps === true || data.hubcaps === '1') data.hubcaps = 'stored';
    else if (data.hubcaps === false || data.hubcaps === '0') data.hubcaps = '';
    var qrMarkup = svg(code, 3) || '';
    var tires = Array.isArray(data.tires) ? data.tires : [];
    var tRows = tires.length
      ? tires.map(function (t) {
          return '<tr><td class="tab">' + esc(t.pos || '') + '</td><td class="tab">' + esc(t.size || '') + '</td><td>' +
                 esc(t.brand || '') + '</td><td class="num tab">' + esc(t.tread || '') + '</td><td class="num tab">' + esc(t.dot || '') + '</td></tr>';
        }).join('')
      : '<tr><td colspan="5" style="color:#9aa0a8;padding:10px 0">Bez upisanih guma</td></tr>';

    var inner =
      '<div class="rp-fit"><div class="report-doc">' +
        '<header class="rp-head">' +
          '<div><div class="rp-logo">ASC</div>' +
            '<div class="rp-org">Auto Servisni Centar · Dubrovnik</div>' +
            '<h1 class="rp-title">Potvrda o pohrani guma</h1></div>' +
          '<div class="rp-meta">' +
            '<div class="rp-meta-grid">' +
              '<div><div class="rp-ml">Šifra dokumenta</div><div class="rp-mv tab">' + esc(code) + '</div></div>' +
              '<div><div class="rp-ml">Datum izdavanja</div><div class="rp-mv tab">' + esc(todayHr()) + '</div></div>' +
            '</div>' +
            (qrMarkup ? '<div class="rp-qr">' + qrMarkup + '</div>' : '') +
          '</div>' +
        '</header>' +
        rsec('Kupac', '',
          rline('Ime', who) + rline('Adresa', data.address) + rline('Telefon', data.phone, true)) +
        rsec('Vozilo', '',
          rline('Marka i model', vehicle) + rline('Registracija', plate, true)) +
        rsec('Pohrana', '',
          rline('Sezona', season) + rline('Status', status) + rline('Lokacija', loc) +
          rline('Broj guma', data.quantity, true) + rline('Naplatci', data.rims) +
          rline('Zaprimljeno', data.checkIn, true) + rline('Očekivano preuzimanje', data.expectedOut, true)) +
        rsec('Gume i profil', tires.length ? tires.length + (tires.length === 1 ? ' guma' : ' gume') : '',
          '<table class="rp-table"><colgroup><col style="width:6%"><col style="width:22%"><col style="width:42%"><col style="width:14%"><col style="width:16%"></colgroup>' +
          '<thead><tr><th>Poz.</th><th>Dimenzija</th><th>Marka i model</th><th class="num">Profil</th><th class="num">DOT</th></tr></thead>' +
          '<tbody>' + tRows + '</tbody></table>') +
        rsec('Dodatci', '',
          optRow('Vijci kotača', BOLTS, data.bolts || '') + optRow('Poklopci kotača', HUBS, data.hubcaps || '')) +
        rsec('Plaćanje', '',
          rline('Status plaćanja', data.paid ? 'Plaćeno ✓' : 'Neplaćeno') +
          rline('Cijena čuvanja', data.fee, true, 'rp-total')) +
        rsec('Napomene', '', '<div class="rp-prose">' + (data.notes ? esc(data.notes) : '—') + '</div>') +
        '<div class="rp-spacer"></div>' +
        '<div class="rp-sign">' +
          '<div class="rp-sig"><div class="rp-sig-cap">Potpis djelatnika (ASC)</div><div class="rp-sig-date">Datum: ____________</div></div>' +
          '<div class="rp-sig"><div class="rp-sig-cap">Potpis kupca</div><div class="rp-sig-date">Datum: ____________</div></div>' +
        '</div>' +
        '<footer class="rp-foot"><span>Ova potvrda služi kao dokaz o pohrani guma. Komplet se izdaje uz predočenje potvrde.</span>' +
          '<span class="tab">' + esc(code) + '</span></footer>' +
      '</div></div>';

    var m = openSheet(inner, 'Nalog ' + code, 'sm-scroll-doc');
    a4Lock(true);
    // Scale-to-fit on screens narrower than A4 (phones): transform the doc and
    // size .rp-fit to the scaled box so the scroller's geometry stays honest.
    // Print resets both (app.css) and uses the real 210mm width.
    var doc = m.querySelector('.report-doc'), fitBox = m.querySelector('.rp-fit');
    var fit = function () {
      if (!document.body.contains(doc)) { window.removeEventListener('resize', fit); return; }
      var scroller = m.querySelector('.sm-scroll');
      var avail = scroller.clientWidth - 24;
      var s = Math.min(1, avail / doc.offsetWidth);
      if (s < 1) {
        doc.style.transform = 'scale(' + s + ')';
        fitBox.style.width = Math.floor(doc.offsetWidth * s) + 'px';
        fitBox.style.height = Math.ceil(doc.offsetHeight * s) + 'px';
      } else { doc.style.transform = ''; fitBox.style.width = ''; fitBox.style.height = ''; }
    };
    fit();
    window.addEventListener('resize', fit);
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
    svg: svg, printSticker: printSticker, printReport: printReport,
    scanInto: scanInto, stopScan: stopScan, scanFile: scanFile,
    lookup: function (code) { return BY_CODE[code] || null; },
    ownerId: function (code) { var s = BY_CODE[code]; return s ? s.owner : null; },
    SEASON: SEASON, STATUS: STATUS
  };
})();
