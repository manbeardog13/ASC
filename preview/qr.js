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

  // ---- print a sticker — opens a clean print window, instantly ----------------
  function printSticker(code) {
    var set = BY_CODE[code] || { code: code, who: '', vehicle: '', plate: '', season: '', loc: '' };
    var qrMarkup = svg(code, 8) || ('<div style="font:900 20px monospace">' + esc(code) + '</div>');
    var season = SEASON[set.season] || '';
    var win = window.open('', '_blank', 'width=440,height=660');
    if (!win) return false;                  // pop-up blocked — caller shows a hint
    win.document.write('<!doctype html><html lang="hr"><head><meta charset="utf-8"><title>' + esc(code) + '</title>'
      + '<style>*{box-sizing:border-box}html,body{margin:0}'
      + 'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px;color:#000;background:#fff;display:flex;flex-direction:column;align-items:center}'
      + '.label{width:2.6in;border:3px solid #000;border-radius:18px;padding:14px 14px 12px;text-align:center}'
      + '.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}'
      + '.brand{font-weight:900;letter-spacing:1px;font-size:15px}'
      + '.season{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;border:1.5px solid #000;border-radius:999px;padding:3px 9px}'
      + '.qr{width:1.9in;height:1.9in;margin:2px auto 8px}.qr svg{width:100%;height:100%;display:block}'
      + '.code{font-size:23px;font-weight:900;letter-spacing:.5px;font-variant-numeric:tabular-nums}'
      + '.who{font-size:14px;font-weight:700;margin-top:8px}.sub{font-size:11px;color:#333;margin-top:2px;line-height:1.35}'
      + '.loc{margin-top:8px;font-size:13px;font-weight:800;letter-spacing:.3px;border-top:2px dashed #000;padding-top:7px}'
      + '.loc .lk{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#333;display:block;margin-bottom:1px}'
      + '.foot{margin-top:8px;font-size:8.5px;color:#555}@media print{body{padding:0}.noprint{display:none}}</style></head><body>'
      + '<div class="label"><div class="top"><span class="brand">ASC</span>' + (season ? '<span class="season">' + esc(season) + '</span>' : '') + '</div>'
      + '<div class="qr">' + qrMarkup + '</div>'
      + '<div class="code">' + esc(code) + '</div>'
      + (set.who ? '<div class="who">' + esc(set.who) + '</div>' : '')
      + '<div class="sub">' + esc([set.vehicle, set.plate].filter(Boolean).join(' · ')) + '</div>'
      + (set.loc ? '<div class="loc"><span class="lk">Lokacija</span>' + esc(set.loc) + '</div>' : '')
      + '<div class="foot">Skenirajte kamerom telefona · ' + esc(code) + '</div></div>'
      + '<div class="noprint" style="margin-top:16px"><button onclick="window.print()" style="padding:11px 22px;font-size:14px;border-radius:12px;border:0;background:#ff4e1b;color:#fff;font-weight:800;cursor:pointer">Ispiši naljepnicu</button></div>'
      + '<scr' + 'ipt>window.onload=function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);};</scr' + 'ipt></body></html>');
    win.document.close();
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
