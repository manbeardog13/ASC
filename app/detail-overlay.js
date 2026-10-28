import { t, onLangChange } from '../js/i18n.js';

// Reuse the authenticated detail pages and their live actions in a same-origin
// frame. History names the real detail URL: reloading opens that full page.
const appRoot = new URL('./', import.meta.url);
const key = 'ascDetailOverlay';
const embedded = window.parent !== window && new URL(location.href).searchParams.get('overlay') === '1';

  const eligible = href => {
    const url = new URL(href, location.href);
    if (url.origin !== appRoot.origin) return null;
    const file = url.pathname.slice(appRoot.pathname.length);
    if (!url.pathname.startsWith(appRoot.pathname)) return null;
    if (file === 'set-detail.html' && url.searchParams.get('code')) return url;
    if (file === 'customers.html' && (url.searchParams.get('id') || url.searchParams.get('c'))) return url;
    return null;
  };

if (embedded) {
  document.documentElement.classList.add('detail-embedded');
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const url = eligible(anchor.href);
    if (url) { event.preventDefault(); window.parent.postMessage({ type: 'asc:open-detail', href: url.href }, location.origin); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      window.parent.postMessage({ type: 'asc:close-detail' }, location.origin);
    }
  });
} else if (typeof HTMLDialogElement !== 'undefined') {
  let dialog = null;
  let origin = null;
  let frame = null;
  let closeButton = null;
  const destroy = () => {
    if (!dialog) return;
    dialog.close(); dialog.remove(); dialog = null; frame = null;
    document.documentElement.classList.remove('detail-overlay-open');
    if (origin?.isConnected) origin.focus({ preventScroll: true });
  };
  const close = () => { if (history.state?.[key]) history.back(); else destroy(); };
  const show = url => {
    destroy();
    dialog = document.createElement('dialog'); dialog.className = 'detail-overlay';
    dialog.setAttribute('aria-label', t('overlay.detail'));
    closeButton = document.createElement('button'); closeButton.type = 'button';
    closeButton.className = 'detail-overlay-close'; closeButton.textContent = t('overlay.close');
    closeButton.addEventListener('click', close);
    frame = document.createElement('iframe'); frame.title = t('overlay.detail');
    frame.className = 'detail-overlay-frame';
    const src = new URL(url); src.searchParams.set('overlay', '1'); frame.src = src.href;
    dialog.append(closeButton, frame);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) {
      const b=dialog.getBoundingClientRect();
      if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom) close();
    }});
    document.body.append(dialog); dialog.showModal(); closeButton.focus();
    document.documentElement.classList.add('detail-overlay-open');
  };
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const url = eligible(anchor.href); if (!url) return;
    event.preventDefault(); origin = anchor;
    history.pushState({ [key]: url.href }, '', url.href);
    show(url);
  });
  addEventListener('popstate', event => {
    const url = event.state?.[key] && eligible(event.state[key]);
    if (url) show(url); else destroy();
  });
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
    if (event.data?.type === 'asc:close-detail') close();
    if (event.data?.type === 'asc:open-detail' && typeof event.data.href === 'string') {
      const url = eligible(event.data.href);
      if (url) { history.pushState({ [key]: url.href }, '', url.href); show(url); }
    }
  });
  document.addEventListener('asc:sign-out', destroy);
  onLangChange(() => {
    if (!dialog) return;
    dialog.setAttribute('aria-label',t('overlay.detail'));
    frame.title=t('overlay.detail');closeButton.textContent=t('overlay.close');
  });
}
