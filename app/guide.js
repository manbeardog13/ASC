// Each step opens a real ASC screen. Guide navigation has no inventory side effects.
const steps = [
  {
    id: 'obilazak', hint: 'Odaberite prostor koji želite obići.', name: 'Upoznajte prostor', title: 'Prođite kroz skladište.',
    lead: 'Odaberite prostor pa uključite obilazak iz razine poda. Za pregled odozgo vratite se na tlocrt.',
    detail: 'Usporedite prolaze i položaj regala sa stvarnim prostorom. Oznaka „Shematski prikaz” znači da mjere još nisu potvrđene.',
    action: 'Uđi u obilazak', path: 'spatial-studio/index.html?view=walk', target: '.room-button',
    glyph: 'M3 16l6-11 6 3 6-2v13l-6 2-6-3-6 2z M9 5v13m6-10v13',
  },
  {
    id: 'mjesto', hint: 'Unesite zonu, regal, policu i mjesto s fizičke oznake.', name: 'Označite mjesto', title: 'Svako mjesto ima adresu.',
    lead: 'Unesite zonu, regal, policu i mjesto prema oznakama u skladištu. Ako su mjesta već označena, prijeđite na prijem.',
    detail: 'Nakon izrade mjesta otvorit će se naljepnice. Ispišite ih i pričvrstite svaku na odgovarajuće fizičko mjesto. QR mjesta ostaje na regalu.',
    action: 'Izradi oznake mjesta', path: 'locations.html', target: '#loc-zone',
    glyph: 'M3 4v16m18-16v16M3 7h18M3 15h18M6 10h5v5m3-5h4v5',
  },
  {
    id: 'regal', hint: 'Odaberite prostor pa pritisnite „Dodaj stupac” na tlocrtu.', name: 'Ucrtajte regal', title: 'Povežite regal s tlocrtom.',
    lead: 'Odaberite prostor i „Dodaj stupac”. Odaberite položaj na dostupnom podu, oznaku stvarnog regala i njegov kapacitet.',
    detail: 'Spremite položaj i provjerite stanje sinkronizacije. Ako nema regala za odabir, najprije evidentirajte njegova mjesta u odgovarajućoj zoni.',
    action: 'Otvori tlocrt', path: 'spatial-studio/index.html?view=plan', target: '.room-button',
    glyph: 'M3 4h18v16H3z M13 4v7h8M6 15h4m-2-2v4',
  },
  {
    id: 'prijem', hint: 'Počnite imenom kupca ili podacima vozila.', name: 'Zaprimite komplet', title: 'Naljepnica prati komplet.',
    lead: 'Pronađite kupca ili vozilo, upišite broj i podatke guma te spremite prijem. Ispišite QR naljepnicu za taj komplet.',
    detail: 'Usporedite oznaku s otvorenim prijemom i pričvrstite je na komplet. Ako aplikacija traži potvrdu ispisa, potvrdite tek kada imate naljepnicu u ruci.',
    action: 'Otvori prijem', path: 'checkin.html', target: '#c_name',
    glyph: 'M3 4h9l9 9-8 8-10-10z M8 8h.1',
  },
  {
    id: 'smjestaj', hint: 'Očitajte QR kompleta pa QR njegova mjesta.', name: 'Smjestite gume', title: 'Spojite komplet i mjesto.',
    lead: 'Očitajte QR kompleta pa QR fizičkog mjesta. Provjerite adresu i slobodan kapacitet prije odlaganja.',
    detail: 'Odložite komplet na označeno mjesto, zatim potvrdite smještaj. Pri premještanju očitajte novu lokaciju i potvrdite promjenu. Prolazi moraju ostati prohodni.',
    action: 'Otvori smještaj', path: 'place.html', target: '#typed-code',
    glyph: 'M3 5h7v7H3zM14 13h7v7h-7z M14 5h4v4m0-4-6 6',
  },
  {
    id: 'pronalazak', hint: 'Upišite registraciju, ime kupca ili oznaku kompleta.', name: 'Pronađite komplet', title: 'Od upita do točne police.',
    lead: 'Upišite registraciju, kupca ili oznaku kompleta. Otvorite rezultat i pročitajte zonu, regal, policu i mjesto.',
    detail: 'Na regalu usporedite QR kompleta s evidencijom. Ako položaj nedostaje, provjerite gdje se komplet nalazi i evidentirajte smještaj.',
    action: 'Pronađi komplet', path: 'locate.html', target: '#locate-query',
    glyph: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z M15 15l6 6',
  },
];

const base = new URL('.', import.meta.url);
const number = index => String(index + 1).padStart(2, '0');
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}
function link(label, href, className) {
  const element = node('a', className, label);
  element.href = href;
  return element;
}
function stepUrl(step) {
  const url = new URL(step.path, base);
  url.searchParams.set('vodic', step.id);
  return url;
}
function guideLink(step) {
  return new URL('guide.html#' + step.id, base);
}
function symbol(path) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'), line = document.createElementNS(ns, 'path');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  line.setAttribute('d', path);
  svg.append(line);
  return svg;
}
function showGuide() {
  const index = Math.max(0, steps.findIndex(step => '#' + step.id === location.hash));
  const step = steps[index], menu = document.querySelector('#guide-steps'), pane = document.querySelector('#guide-detail');
  if (!menu.childElementCount) {
    steps.forEach((item, n) => {
      const row = link('', '#' + item.id, 'guide-step');
      row.append(node('span', 'guide-num', number(n)), node('span', '', item.name));
      menu.append(row);
    });
  }
  Array.from(menu.children).forEach((el, i) => i === index ? el.setAttribute('aria-current', 'step') : el.removeAttribute('aria-current'));
  const page = node('div', 'guide-sheet');
  const marker = node('div', 'guide-marker');
  marker.append(symbol(step.glyph), node('span', '', number(index) + ' / ' + number(steps.length - 1)));
  const title = node('h2', '', step.title);
  title.id = 'guide-title';
  const actions = node('div', 'guide-actions');
  actions.append(link(step.action + ' ↗', stepUrl(step), 'guide-primary'));
  if (index + 1 < steps.length) actions.append(link('Sljedeća uputa →', '#' + steps[index + 1].id, 'guide-secondary'));
  else actions.append(link('Natrag u studio →', 'spatial-studio/index.html', 'guide-secondary'));
  page.append(marker, title, node('p', 'guide-lead', step.lead), node('p', 'guide-note', step.detail), actions);
  pane.replaceChildren(page);
  if (matchMedia('(max-width: 690px)').matches) menu.children[index].scrollIntoView({block:'nearest', inline:'nearest'});
}
function mountCoach() {
  const id = new URL(location.href).searchParams.get('vodic');
  const index = steps.findIndex(step => step.id === id && new URL(step.path, base).pathname === location.pathname);
  if (index < 0 || document.querySelector('.guide-coach')) return;
  const step = steps[index], studio = location.pathname.includes('/spatial-studio/');
  const host = studio ? document.getElementById('studio-guide-host') : document.querySelector('.flow, #ci') || document.querySelector('main');
  if (!host) return;
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = new URL('guide.css', base); document.head.append(style);
  const coach = node('details', 'guide-coach');
  coach.open = true;
  const summary = node('summary', '', 'Vodič ' + number(index) + ' / ' + steps.length + ' · ' + step.name);
  const controls = node('div', 'guide-controls');
  const locate = node('button', '', 'Pokaži na zaslonu');
  locate.type = 'button';
  locate.addEventListener('click', () => {
    const target = document.querySelector(step.target);
    if (!target) { message.textContent = 'Pričekajte da se radni zaslon učita.'; return; }
    coach.open = false;
    target.scrollIntoView({block:'center', behavior:'instant'});
    target.focus({preventScroll:true});
    target.classList.add('guide-focus');
    setTimeout(() => target.classList.remove('guide-focus'), 1500);
  });
  controls.append(locate, link(index + 1 < steps.length ? 'Sljedeća uputa →' : 'Povratak u vodič', guideLink(steps[index + 1] || steps[0])));
  const message = node('p', '', step.hint); message.setAttribute('role', 'status');
  coach.append(summary, message, controls);
  // The page header keeps its normal position. Help appears next to the work.
  const form = host.querySelector(':scope > #flow-root');
  if (form) form.before(coach); else host.prepend(coach);
}

if (document.getElementById('guide-steps')) {
  showGuide();
  window.addEventListener('hashchange', showGuide);
} else {
  // The studio mounts asynchronously; its dedicated host is outside React-managed content.
  document.addEventListener('asc:studio-guide-ready', mountCoach, {once:true});
  mountCoach();
}
