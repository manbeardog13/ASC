/* ============================================================================
   layout-edit.js — "Uredi raspored", the workspace editor (v1).
   Design decisions (EDITING-MODE brief, senior-HIG read):
   · STRUCTURED grid editing, not freeform pixels — cards SWAP places (drag one
     onto another) so the composition is always valid, layouts never break when
     content grows, and the saved layout is deterministic on every reload
     (the brief's "responsive lock" falls out for free).
   · No jiggle — desktop Apple enters editing with a calm state change: a dot
     field, dimmed chrome, visible affordances.
   · Widgets can be hidden (⊖) and restored from a tray; the workspace can be
     emptied entirely and rebuilt (custom dashboards).
   · Global width personalization: a slider drives --shell-max, applied on
     every page (app.js reads asc.layout.width at boot).
   · Layouts persist PER DEVICE PROFILE (auto-named à la "win-chrome-desktop"),
     so each machine keeps its own workspace — the brief's Layout Profiles,
     minus the management UI (v2: rename/duplicate/export).
   · Plugin architecture: WIDGETS is the registry — a future widget ships as
     {id, title, mount(el)} and appears in the tray; nothing else changes.
   ============================================================================ */
(() => {
  'use strict';
  if (!document.querySelector('.hero')) return;   // dashboard only

  const root = document.documentElement;
  const KEY = (() => {
    const p = navigator.platform || '';
    const os = /Win/i.test(p) ? 'win' : /Mac/i.test(p) ? 'mac' : /iP(hone|ad)/i.test(p) ? 'ios' : 'other';
    const br = /Edg/i.test(navigator.userAgent) ? 'edge' : /Chrome/i.test(navigator.userAgent) ? 'chrome' : /Safari/i.test(navigator.userAgent) ? 'safari' : 'browser';
    return os + '-' + br + '-' + (innerWidth >= 1021 ? 'desktop' : 'mobile');
  })();
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem('asc.layout.' + k + '.' + KEY)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('asc.layout.' + k + '.' + KEY, JSON.stringify(v)); } catch (e) {} },
  };

  // The editable widgets: stable id → element (registry doubles as the plugin seam)
  const WIDGETS = [
    { id: 'stage', title: 'Pregled skladišta', el: document.querySelector('.stage') },
    { id: 'act-green', title: 'Zaprimi novi set', el: document.querySelector('.act.green') },
    { id: 'act-red', title: 'Preuzmi komplet', el: document.querySelector('.act.red') },
    { id: 'agent', title: 'ASC Agent', el: document.getElementById('agentShell') },
    { id: 'notes', title: 'Prijedlozi', el: document.getElementById('notesShell') },
    { id: 'profile', title: 'Smjena', el: document.querySelector('.card.profile') },
    { id: 'zauzece', title: 'Po sezoni', el: [...document.querySelectorAll('.card')].find(c => c.querySelector('h3') && /Po sezoni/.test(c.textContent)) },
    { id: 'reminders', title: 'Preuzimanja', el: document.querySelector('.card.dark') },
  ].filter(w => w.el);
  const byId = Object.fromEntries(WIDGETS.map(w => [w.id, w]));

  // ---- apply persisted state at load (hidden set + swapped areas + width) ----
  const hidden = new Set(store.get('hidden', []));
  hidden.forEach(id => { if (byId[id]) byId[id].el.style.display = 'none'; });
  const areas = store.get('areas', {});           // id → {c,r} inline grid placement
  for (const id in areas) {
    if (byId[id] && areas[id]) { byId[id].el.style.gridColumn = areas[id].c; byId[id].el.style.gridRow = areas[id].r; }
  }

  const saveHidden = () => store.set('hidden', [...hidden]);
  const saveAreas = () => {
    const out = {};
    WIDGETS.forEach(w => { if (w.el.style.gridColumn || w.el.style.gridRow) out[w.id] = { c: w.el.style.gridColumn, r: w.el.style.gridRow }; });
    store.set('areas', out);
  };

  // ---- edit mode chrome --------------------------------------------------------
  let editing = false, bar = null, tray = null;
  const enter = () => {
    if (editing) return; editing = true;
    root.classList.add('layout-edit');
    // toolbar: Done + width slider + reset
    bar = document.createElement('div');
    bar.className = 'edit-bar';
    const w0 = store.get('width', 1180);
    bar.innerHTML =
      '<span class="eb-t">Uređivanje rasporeda</span>' +
      '<label class="eb-w">Širina <input type="range" min="980" max="1560" step="20" value="' + w0 + '"><b>' + w0 + 'px</b></label>' +
      '<button class="eb-reset" type="button">Vrati zadano</button>' +
      '<button class="eb-done" type="button">Gotovo</button>';
    document.body.appendChild(bar);
    bar.querySelector('input').addEventListener('input', (e) => {
      const v = +e.target.value;
      bar.querySelector('.eb-w b').textContent = v + 'px';
      root.style.setProperty('--shell-max', v + 'px');
      store.set('width', v);
    });
    bar.querySelector('.eb-reset').addEventListener('click', () => {
      hidden.clear(); saveHidden(); store.set('areas', {}); store.set('width', 1180);
      location.reload();
    });
    bar.querySelector('.eb-done').addEventListener('click', exit);
    // per-widget hide affordance
    WIDGETS.forEach(w => {
      if (hidden.has(w.id)) return;
      w.el.classList.add('editable');
      const x = document.createElement('button');
      x.className = 'edit-x'; x.type = 'button'; x.setAttribute('aria-label', 'Sakrij ' + w.title);
      x.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>';
      x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hideWidget(w.id); });
      w.el.appendChild(x);
    });
    renderTray();
    document.addEventListener('keydown', escClose);
  };
  const exit = () => {
    if (!editing) return; editing = false;
    root.classList.remove('layout-edit');
    if (bar) bar.remove(); bar = null;
    if (tray) tray.remove(); tray = null;
    document.querySelectorAll('.edit-x').forEach(x => x.remove());
    WIDGETS.forEach(w => w.el.classList.remove('editable', 'drag-over', 'lifting'));
    document.removeEventListener('keydown', escClose);
  };
  const escClose = (e) => { if (e.key === 'Escape') exit(); };

  const hideWidget = (id) => {
    const w = byId[id]; if (!w) return;
    w.el.style.opacity = '0'; w.el.style.transform = 'scale(.96)';
    w.el.style.transition = 'opacity 220ms var(--smooth), transform 220ms var(--smooth)';
    setTimeout(() => { w.el.style.display = 'none'; w.el.style.opacity = ''; w.el.style.transform = ''; w.el.style.transition = ''; }, 230);
    hidden.add(id); saveHidden(); renderTray();
  };
  const showWidget = (id) => {
    const w = byId[id]; if (!w) return;
    hidden.delete(id); saveHidden();
    w.el.style.display = ''; w.el.classList.add('editable');
    if (editing && !w.el.querySelector('.edit-x')) {
      const x = document.createElement('button');
      x.className = 'edit-x'; x.type = 'button';
      x.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg>';
      x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hideWidget(id); });
      w.el.appendChild(x);
    }
    renderTray();
  };
  const renderTray = () => {
    if (tray) tray.remove(); tray = null;
    if (!editing || !hidden.size) return;
    tray = document.createElement('div');
    tray.className = 'edit-tray';
    tray.innerHTML = '<span class="et-t">Skriveno</span>' +
      [...hidden].map(id => byId[id] ? '<button type="button" data-id="' + id + '">+ ' + byId[id].title + '</button>' : '').join('');
    tray.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) showWidget(b.dataset.id); });
    document.body.appendChild(tray);
  };

  // ---- swap-drag: pick a card up, drop it on another — they trade places ------
  let dragW = null, ghost = null;
  document.addEventListener('pointerdown', (e) => {
    if (!editing) return;
    const el = e.target.closest('.editable');
    if (!el || e.target.closest('.edit-x')) return;
    const w = WIDGETS.find(x => x.el === el); if (!w) return;
    e.preventDefault();
    dragW = w;
    el.classList.add('lifting');
    ghost = el.cloneNode(true);
    ghost.className = 'edit-ghost';
    const r = el.getBoundingClientRect();
    ghost.style.cssText = 'position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;z-index:130;pointer-events:none;opacity:.85;transform:scale(1.02);border-radius:24px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(2,3,5,.5);transition:transform 160ms var(--snap)';
    document.body.appendChild(ghost);
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = (ev) => {
      ghost.style.left = (ev.clientX - ox) + 'px';
      ghost.style.top = (ev.clientY - oy) + 'px';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = under && under.closest('.editable');
      WIDGETS.forEach(x => x.el.classList.toggle('drag-over', target === x.el && x !== dragW));
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tEl = under && under.closest('.editable');
      const tW = WIDGETS.find(x => x.el === tEl);
      if (tW && tW !== dragW) swap(dragW, tW);
      el.classList.remove('lifting');
      WIDGETS.forEach(x => x.el.classList.remove('drag-over'));
      if (ghost) { ghost.remove(); ghost = null; }
      dragW = null;
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });

  // FLIP swap: exchange explicit grid placement (or DOM order for auto-placed)
  const swap = (a, b) => {
    const firstA = a.el.getBoundingClientRect(), firstB = b.el.getBoundingClientRect();
    const csA = getComputedStyle(a.el), csB = getComputedStyle(b.el);
    const areaA = { c: csA.gridColumn, r: csA.gridRow }, areaB = { c: csB.gridColumn, r: csB.gridRow };
    const explicit = (x) => x.c && x.c !== 'auto / auto' && !/^auto/.test(x.c);
    if (explicit(areaA) || explicit(areaB)) {
      a.el.style.gridColumn = areaB.c; a.el.style.gridRow = areaB.r;
      b.el.style.gridColumn = areaA.c; b.el.style.gridRow = areaA.r;
    } else {
      const marker = document.createComment('swap');
      a.el.parentNode.insertBefore(marker, a.el);
      b.el.parentNode.insertBefore(a.el, b.el);
      marker.parentNode.insertBefore(b.el, marker); marker.remove();
    }
    // FLIP: play both cards from their old rects into the new layout
    [[a.el, firstA], [b.el, firstB]].forEach(([el, first]) => {
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left, dy = first.top - last.top;
      if (!dx && !dy) return;
      el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }],
        { duration: 380, easing: 'cubic-bezier(.3,1.2,.4,1)' });
    });
    saveAreas();
  };

  // ---- entry point: the account menu (and a fallback keyboard chord) ----------
  document.addEventListener('asc:edit-layout', enter);
  document.addEventListener('keydown', (e) => { if (e.key === 'e' && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); enter(); } });
})();
