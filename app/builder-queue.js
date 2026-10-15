/* Offline queue for "Send to Toni & Nero".
   IndexedDB holds message text, page, timestamp, and attachment refs.
   Tokens and credentials are refused and never written. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ASCBuilderQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DB_NAME = 'asc-nero';
  var STORE = 'builderQueue';
  var FORBIDDEN = /^(token|access_token|refresh_token|authorization|auth|credential|credentials|secret|password|apikey|api_key|bearer)$/i;
  var STEPS = [2000, 4000, 8000, 16000, 60000];

  function assertClean(value, depth) {
    if (!value || typeof value !== 'object' || depth > 5) return;
    Object.keys(value).forEach(function (key) {
      if (FORBIDDEN.test(key)) throw new Error('refused');
      assertClean(value[key], depth + 1);
    });
  }

  function sanitize(item) {
    assertClean(item, 0);
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('bad item');
    var id = String(item.id || '');
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new Error('bad id');
    var attachments = Array.isArray(item.attachments) ? item.attachments.slice(0, 4).map(function (a) {
      return {
        path: String(a && a.path || '').slice(0, 300),
        mime: String(a && a.mime || '').slice(0, 80),
        name: String(a && a.name || '').slice(0, 180)
      };
    }).filter(function (a) { return a.path; }) : [];
    return {
      id: id,
      text: String(item.text || '').slice(0, 4000),
      page: String(item.page || '').slice(0, 200),
      ts: Number(item.ts) || Date.now(),
      attachments: attachments,
      attempts: Math.max(0, Number(item.attempts) || 0)
    };
  }

  function orderDedupe(items) {
    var copy = (items || []).slice().sort(function (a, b) {
      var dt = (Number(a.ts) || 0) - (Number(b.ts) || 0);
      if (dt) return dt;
      return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
    });
    var seen = {};
    var out = [];
    copy.forEach(function (item) {
      if (!item || seen[item.id]) return;
      seen[item.id] = true;
      out.push(item);
    });
    return out;
  }

  function backoffMs(attempts) {
    var n = Math.max(0, Number(attempts) || 0);
    return STEPS[Math.min(n, STEPS.length - 1)];
  }

  function supported() { return typeof indexedDB !== 'undefined'; }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!supported()) { reject(new Error('no indexedDB')); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function enqueue(item) {
    var row = sanitize(item);
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = function () { resolve(row); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function list() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(orderDedupe(req.result || [])); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function remove(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function clear() {
    if (!supported()) return Promise.resolve();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function bump(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var get = store.get(id);
        get.onsuccess = function () {
          var row = get.result;
          if (!row) { resolve(null); return; }
          row.attempts = (Number(row.attempts) || 0) + 1;
          store.put(row);
        };
        get.onerror = function () { reject(get.error); };
        tx.oncomplete = function () { resolve(get.result || null); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  return {
    sanitize: sanitize,
    orderDedupe: orderDedupe,
    backoffMs: backoffMs,
    enqueue: enqueue,
    list: list,
    remove: remove,
    clear: clear,
    bump: bump
  };
});
