/* Shared page bootstrap. Applies the theme before first paint.
   Stored choice wins. With no choice, ASC opens in daylight.
   Only the theme preference is read from storage. */
(function () {
  var KEY = 'asc.theme';
  var transientChoice = null;
  function stored() {
    if (transientChoice) return transientChoice;
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function darkNow() {
    var choice = stored();
    if (choice === 'dark') return true;
    if (choice === 'light') return false;
    return false;
  }
  function paint() {
    var dark = darkNow();
    document.documentElement.classList.toggle('dark', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1b3035' : '#f1eee7');
    return dark;
  }
  paint();
  window.addEventListener('storage', function (event) {
    if (event.key === KEY || event.key === null) { transientChoice = null; paint(); }
  });
  window.ASCTheme = {
    paint: paint,
    toggle: function () {
      var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      transientChoice = next;
      try { localStorage.setItem(KEY, next); transientChoice = null; } catch (e) {}
      return paint();
    }
  };
})();

// The portal serves ASC under /ASC/. Its Tenants page owns authentication.
if (location.origin === 'https://app.nerosummit.com' && location.pathname.startsWith('/ASC/')) {
  document.documentElement.dataset.summitTenants = '/#Tenants';
  document.addEventListener('DOMContentLoaded', function () {
    var link = document.querySelector('.nero-mark a, .guide-footer [data-summit-return]');
    if (!link) return;
    link.href = document.documentElement.dataset.summitTenants;
    link.textContent = 'Nero Summit · Organizacije';
    link.hidden = false;
  }, { once: true });
}
