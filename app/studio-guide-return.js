// The guide follows an explicitly started workflow in this tab. Only the step
// and public room name travel between pages. Inventory and form data stay out.
const TASKS = new Set(['locations.html', 'checkin.html', 'place.html', 'locate.html', 'scan.html', 'set-detail.html']);
const ROOMS = new Set(['house-ground', 'house-platform', 'house-attic', 'attic-parts', 'attic-racks', 'triangular-store']);
const KEY = 'asc.studio.guide';

export function taskGuideReturn(href, referrer, stored) {
  const url = new URL(href);
  if (!TASKS.has(url.pathname.split('/').pop())) return null;
  let params = url.searchParams;
  if (!params.has('guide')) {
    if (!stored || !referrer) return null;
    const previous = new URL(referrer);
    if (previous.origin !== url.origin || new URL('.', previous).pathname !== new URL('.', url).pathname ||
        !TASKS.has(previous.pathname.split('/').pop())) return null;
    params = new URLSearchParams(stored);
  }
  const step = params.get('guide');
  if (!/^[1-6]$/.test(step || '')) return null;
  const result = new URLSearchParams({guide: step});
  if (ROOMS.has(params.get('room'))) result.set('room', params.get('room'));
  return result.toString();
}

export function mountGuideReturn() {
  let saved;
  try { saved = sessionStorage.getItem(KEY); } catch {}
  const params = taskGuideReturn(location.href, document.referrer, saved);
  try {
    if (params) sessionStorage.setItem(KEY, params);
    else sessionStorage.removeItem(KEY);
  } catch {}
  if (!params) return;
  const heading = document.querySelector('main .flow-head, main .scan-head, main > .ci-hero, main .wrap');
  const header = document.querySelector('main > header');
  if (!heading && !header) return;
  const link = document.createElement('a');
  link.className = 'btn btn-ghost studio-guide-return';
  link.href = 'spatial-studio/index.html?' + params;
  link.textContent = '← Natrag na vodič';
  if (heading) heading.insertAdjacentElement('beforebegin', link);
  else header.insertAdjacentElement('afterend', link);
  document.addEventListener('asc:sign-out', () => {
    link.remove();
    try { sessionStorage.removeItem(KEY); } catch {}
  }, {once:true});
}
