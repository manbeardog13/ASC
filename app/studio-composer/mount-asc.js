// Mounts the studio composer onto ASC's existing controls. The plans, colours
// and motion are the NERO Studio templates. ASC does not add controls.
import { templateFor } from './family.js';
import { renderComposer } from './render.js';

const STYLE_ID = 'nero-studio-composer-css';

function ensureStyles(document, href) {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

export function mountAscComposer(root, document, window, styleHref) {
  const sheet = root.querySelector('.nero-sheet');
  const hosts = {
    'composer-input': root.querySelector('.nero-input'),
    'composer-add': root.querySelector('.nero-plus'),
    'composer-voice': root.querySelector('.nero-mic'),
    'composer-send': root.querySelector('.nero-send')
  };
  if (!sheet || !hosts['composer-input'] || !hosts['composer-send']) return null;
  ensureStyles(document, styleHref);
  const mq = window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;
  let current = null;
  let expanded = false;
  const planNow = () => (mq && mq.matches ? 'compact-mobile' : 'inline-bar');
  const setExpanded = (value) => {
    expanded = !!value;
    if (current) current.element.dataset.expanded = String(expanded);
  };
  function render() {
    const template = templateFor(planNow());
    const next = renderComposer({ document, template, hosts, surface: 'asc' });
    next.element.dataset.expanded = String(expanded);
    if (current) current.element.replaceWith(next.element);
    else sheet.prepend(next.element);
    current = next;
    root.classList.add('sc-mounted');
  }
  const onIntent = (event) => {
    if (!current) return;
    setExpanded(current.element.contains(event.target));
  };
  render();
  mq && mq.addEventListener && mq.addEventListener('change', render);
  document.addEventListener('pointerdown', onIntent, true);
  document.addEventListener('focusin', onIntent, true);
  return { render };
}
