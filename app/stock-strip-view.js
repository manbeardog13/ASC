/* Read-only previews of actual ASC admissions. No personal records are cached. */
const PAUSE = '<path d="M9 6v12M15 6v12"/>';
const PLAY = '<path d="m9 5 10 7-10 7Z"/>';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function tyreCount(count) {
  const last = count % 10, lastTwo = count % 100;
  const word = last === 1 && lastTwo !== 11 ? 'guma' : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'gume' : 'guma';
  return `${count} ${word}`;
}

export function summarize(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => row?.public_code && ['in_storage','reserved'].includes(row.status) && !row.picked_up_at && !row.deleted_at).slice(0,6).map(row => ({
    key: row.public_code, firstTireId:row.public_code, count:Math.max(0,Number(row.quantity)||0),
    customer:row.vehicle?.customer?.name || 'Kupac nije upisan', plate:row.vehicle?.plate || 'Bez registracije',
    size:[...new Set((row.tires||[]).map(t=>t.size).filter(Boolean))].join(' / ') || 'Dimenzija nije upisana',
    locations:[[row.zone,row.rack,row.shelf,row.slot].filter(Boolean).join(' · ')].filter(Boolean)
  }));
}

function tyreShape() {
  const tyre = element('span', 'asc-original-tyre');
  tyre.setAttribute('aria-hidden', 'true');
  return tyre;
}

function setCard(group, onOpen) {
  const item = element('li', 'asc-stream-item');
  const button = element('button', 'asc-stream-card');
  button.type = 'button';
  button.dataset.tyreId = group.firstTireId;
  const location = group.locations.length ? group.locations.join(' / ') : 'Položaj nije upisan';
  const description = `${group.customer}, ${group.plate}, ${group.size}, ${tyreCount(group.count)}, ${location}. Otvori detalje i QR oznaku.`;
  button.setAttribute('aria-label', description);
  button.title = description;
  const art = element('span', 'asc-stream-tyres');
  art.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < Math.min(group.count, 4); i += 1) art.append(tyreShape());
  const info = element('span', 'asc-stream-info');
  info.append(
    element('strong', 'asc-stream-name', group.customer),
    element('span', 'asc-stream-detail', `${group.plate} · ${group.size}`),
    element('span', 'asc-stream-location', `${tyreCount(group.count)} · ${location}`),
  );
  button.append(art, info);
  button.addEventListener('click', () => onOpen(group.firstTireId));
  item.append(button);
  return item;
}

function visualCopy(node) {
  const copy = node.cloneNode(true);
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  copy.querySelectorAll('button').forEach(button => { button.tabIndex = -1; });
  return copy;
}

export function createTyreStream({ host, onOpen }) {
  if (!host || typeof onOpen !== 'function') throw new TypeError('Tyre stream requires a host and onOpen callback.');
  const root = element('section', 'asc-tyre-stream');
  root.setAttribute('aria-label', 'Posljednji zaprimljeni kompleti');
  const heading = element('div', 'asc-stream-heading');
  heading.append(element('span', '', 'Posljednji zaprimljeni kompleti'));
  const row = element('div', 'asc-stream-row');
  const viewport = element('div', 'asc-stream-viewport');
  const track = element('div', 'asc-stream-track');
  const empty = element('p', 'asc-stream-empty', 'Nema kompleta u prikazu.');
  empty.hidden = true;
  const pause = element('button', 'asc-stream-pause');
  pause.type = 'button';
  pause.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>';
  viewport.append(track, empty);
  row.append(viewport, pause);
  root.append(heading, row);
  host.append(root);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let groups = [], signature = '', repeats = 0, userPaused = false;
  let focusAnimation = null, focusTime = null;

  function syncPlayback() {
    root.classList.toggle('is-paused', userPaused);
    root.classList.toggle('is-reduced', reduced.matches);
    pause.hidden = reduced.matches || !groups.length;
    pause.setAttribute('aria-pressed', String(userPaused));
    const label = userPaused ? 'Pokreni pomicanje kompleta' : 'Zaustavi pomicanje kompleta';
    pause.setAttribute('aria-label', label);
    pause.title = label;
    pause.querySelector('svg').innerHTML = userPaused ? PLAY : PAUSE;
  }

  function paint(force = false) {
    if (!groups.length) return;
    const cardWidth = window.matchMedia('(max-width: 640px)').matches ? 244 : 280;
    const groupWidth = groups.length * (cardWidth + 8);
    const nextRepeats = reduced.matches ? 1 : Math.max(1, Math.ceil((viewport.clientWidth || groupWidth) / groupWidth));
    if (!force && repeats === nextRepeats) return;
    repeats = nextRepeats;
    const focusedId = viewport.contains(document.activeElement) ? document.activeElement.dataset.tyreId : null;
    const first = element('ul', 'asc-stream-group');
    first.setAttribute('aria-label', 'Zaprimljeni kompleti guma');
    const originals = groups.map(group => setCard(group, onOpen));
    first.append(...originals);
    for (let i = 1; i < repeats; i += 1) originals.forEach(item => first.append(visualCopy(item)));
    track.replaceChildren(first, visualCopy(first));
    if (focusedId) [...first.querySelectorAll('button')].find(button => !button.closest('[inert]') && button.dataset.tyreId === focusedId)?.focus({ preventScroll: true });
  }

  pause.addEventListener('click', () => { userPaused = !userPaused; syncPlayback(); });
  // Keyboard focus must reach the real, accessible half even while that half
  // is outside the moving viewport. Restore the prior phase after focus leaves.
  viewport.addEventListener('focusin', event => {
    if (reduced.matches || !event.target.matches(':focus-visible')) return;
    const animation = track.getAnimations?.().find(item => item.animationName === 'ascSetStream');
    if (animation && focusTime === null) {
      focusAnimation = animation; focusTime = animation.currentTime || 0;
      animation.currentTime = 0;
    }
    requestAnimationFrame(() => {
      if (!viewport.contains(document.activeElement)) return;
      const item = document.activeElement.getBoundingClientRect(), box = viewport.getBoundingClientRect();
      if (item.left < box.left) viewport.scrollLeft += item.left - box.left;
      else if (item.right > box.right) viewport.scrollLeft += item.right - box.right;
    });
  });
  viewport.addEventListener('focusout', () => requestAnimationFrame(() => {
    if (viewport.contains(document.activeElement) || focusTime === null) return;
    viewport.scrollLeft = 0;
    if (focusAnimation && focusAnimation.playState !== 'idle') focusAnimation.currentTime = focusTime;
    focusAnimation = null; focusTime = null;
  }));
  // Repeated visual copies stay out of keyboard/AT navigation. A pointer on a
  // visible inert copy resolves through the viewport to its original record.
  viewport.addEventListener('click', event => {
    if (event.target.closest('.asc-stream-card') && !event.target.closest('[inert]')) return;
    if (!event.detail) return;
    for (const button of track.querySelectorAll('[inert] .asc-stream-card, .asc-stream-item[inert] .asc-stream-card')) {
      const box = button.getBoundingClientRect();
      if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) {
        onOpen(button.dataset.tyreId); break;
      }
    }
  });
  reduced.addEventListener('change', () => {
    focusAnimation = null; focusTime = null;
    syncPlayback(); paint(true);
  });
  if ('ResizeObserver' in window) new ResizeObserver(() => paint()).observe(viewport);
  else window.addEventListener('resize', () => paint());
  syncPlayback();

  return {
    update(state) {
      const next = summarize(state);
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      signature = nextSignature; groups = next;
      const hasFocus = viewport.contains(document.activeElement);
      empty.hidden = groups.length !== 0;
      track.hidden = groups.length === 0;
      root.classList.toggle('is-empty', groups.length === 0);
      syncPlayback();
      if (groups.length) {
        paint(true);
        if (!reduced.matches && typeof track.animate === 'function') track.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      } else {
        track.replaceChildren(); repeats = 0;
        if (hasFocus) { empty.tabIndex = -1; empty.focus({ preventScroll: true }); }
      }
    },
  };
}
