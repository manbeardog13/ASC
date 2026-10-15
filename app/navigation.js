export const navigationIcons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 10.6L12 4l7.8 6.6"/><path d="M5.8 9.4V19a2 2 0 002 2h8.4a2 2 0 002-2V9.4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.4v13.2M5.4 12h13.2"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.2V6.4A2.4 2.4 0 016.4 4h1.8M15.8 4h1.8A2.4 2.4 0 0120 6.4v1.8M20 15.8v1.8a2.4 2.4 0 01-2.4 2.4h-1.8M8.2 20H6.4A2.4 2.4 0 014 17.6v-1.8"/><path d="M7.2 12h9.6"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21.2s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0111 0M15.5 5.6a3.2 3.2 0 010 4.8M17.5 13.8a5.5 5.5 0 013 5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5a6 6 0 0112 0c0 4.2 1.6 5.6 2.2 6.2H3.8C4.4 15.1 6 13.7 6 9.5z"/><path d="M9.8 19a2.4 2.4 0 004.4 0"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.2 6.3a4 4 0 015.3 5.3l-8.4 8.4a2.1 2.1 0 01-3-3l8.4-8.4z"/><path d="M14.2 6.3L17.7 3M6 21l-3-3"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l1.8 4.9 4.9 1.8-4.9 1.8L12 17l-1.8-5-4.9-1.8 4.9-1.8L12 3.5z"/><path d="M18.8 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.6" r="3.4"/><path d="M5 20a7 7 0 0114 0"/></svg>',
    bin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4.5L4 6.5v13l5-2 6 2 5-2v-13l-5 2-6-2z"/><path d="M9 4.5v13M15 6.5v13"/></svg>',
    chev: '<svg class="sb-chev" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9.5l6 6 6-6"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3M15 8l4 4-4 4M19 12H9"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  };

const APP_ROOT = new URL('./', import.meta.url);
const WAREHOUSE_FILES = ['warehouse-preview/index.html', 'locate.html', 'locations.html', 'recycle.html', 'place.html', 'checkout.html', 'set-detail.html'];

function pageFile(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  if (parts[parts.length - 1] === 'warehouse-preview') return 'warehouse-preview/index.html';
  if (parts.slice(-2).join('/') === 'warehouse-preview/index.html') return 'warehouse-preview/index.html';
  return parts[parts.length - 1] || 'dashboard.html';
}

export function renderAppNavigation({warehouseOpen=false, currentPath=location.pathname}={}) {
  const I=navigationIcons, whOpen=warehouseOpen;
  const item=(m,href,icon,label,kid,admin)=>{
    const path=new URL(href,APP_ROOT).pathname;
    const active=currentPath===path || (href==='warehouse-preview/index.html' && currentPath===new URL('warehouse-preview/',APP_ROOT).pathname);
    return '<a class="sb-item'+(kid?' sb-kid':'')+(active?' on':'')+'" data-m="'+m+'"'+(admin?' data-admin="1"':'')+' href="'+path+'"'+(active?' aria-current="page"':'')+' title="'+label+'">'+icon+'<span class="t">'+label+'</span></a>';
  };
  return (
      item('dashboard', 'dashboard.html', I.home, 'Ploča') +
      item('checkin', 'checkin.html', I.plus, 'Zaprimi') +
      item('scan', 'scan.html', I.scan, 'Skeniraj') +
      '<div class="sb-group' + (whOpen ? ' open' : '') + '">' +
        '<button class="sb-item" type="button" data-m="warehouse" aria-expanded="' + whOpen + '">' + I.pin + '<span class="t">Skladište</span>' + I.chev + '</button>' +
        '<div class="sb-group-kids"'+(whOpen?'':' inert')+'><div>' +
          item('warehouse', 'warehouse-preview/index.html', I.map, 'Prostorni pregled', true) +
          item('locate', 'locate.html', I.pin, 'Pronađi', true) +
          item('locations', 'locations.html', I.spark, 'Mjesta', true) +
          item('warehouse', 'recycle.html', I.bin, 'Košarica', true) +
        '</div></div></div>' +
      item('customers', 'customers.html', I.people, 'Kupci') +
      // Offers slot — the offers page inserts its item here. Not a link.
      '<div class="sb-slot" data-nav-slot="offers" hidden></div>' +
      item('reminders', 'reminders.html', I.bell, 'Podsjetnici') +
      item('workshop', 'workshop.html', I.wrench, 'Radionica') +
      '<div class="sb-div" data-admin="1"></div><div class="sb-eyebrow2" data-admin="1">Upravljanje</div>' +
      item('users', 'users.html', I.users, 'Korisnici', false, true) +
      '<button class="sb-item sb-theme" type="button" id="sbTheme" aria-pressed="false">' + I.theme + '<span class="t">Tamna tema</span></button>'
  );
}

// Admin-only rows stay in the DOM (so link counts stay stable) but are hidden
// until the signed-in role is admin or manager. Unknown role fails closed.
export function applyNavAccess(root, role) {
  if (!root) return;
  const admin = role === 'admin' || role === 'manager';
  root.querySelectorAll('[data-admin]').forEach((el) => { el.hidden = !admin; });
}

export function syncThemeButton(button) {
  if (!button) return;
  const dark = document.documentElement.classList.contains('dark');
  button.setAttribute('aria-pressed', String(dark));
  button.classList.toggle('on', dark);
  const label = button.querySelector('.t');
  if (label) label.textContent = dark ? 'Svijetla tema' : 'Tamna tema';
}

// Preserve the source entry, so native Back/swipe restores its menu without
// adding a synthetic history entry or intercepting the browser's gesture.
export function installWarehouseMenuReturn(openMenu) {
  const key='ascWarehouseMenuReturn';
  function restore() {
    if(!history.state?.[key])return;
    const state={...history.state};delete state[key];
    try{history.replaceState(state,'');}catch{}
    openMenu();
  }
  function leaving(event) {
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    const link=event.target.closest?.('a[href]');
    if(!link || link.hasAttribute('download') || (link.target && link.target!=='_self'))return;
    const target=new URL(link.href),preview=new URL('warehouse-preview/index.html',APP_ROOT);
    if(target.origin!==preview.origin || ![preview.pathname,new URL('warehouse-preview/',APP_ROOT).pathname].includes(target.pathname))return;
    try{history.replaceState({...history.state,[key]:true},'');}catch{}
  }
  document.addEventListener('click',leaving);
  window.addEventListener('pageshow',restore);
  restore();
  return ()=>{document.removeEventListener('click',leaving);window.removeEventListener('pageshow',restore);};
}
