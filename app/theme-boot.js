/* Blocking head script. Applies the theme before first paint.
   Stored choice wins. With no choice, follow the system preference.
   Only the theme key is read or written — nothing else. */
(function () {
  var KEY = 'asc.theme';
  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function systemDark() {
    try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  function darkNow() {
    var choice = stored();
    if (choice === 'dark') return true;
    if (choice === 'light') return false;
    return systemDark();
  }
  function paint() {
    var dark = darkNow();
    document.documentElement.classList.toggle('dark', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0a0c11' : '#edf0f5');
    return dark;
  }
  paint();
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (stored() !== 'dark' && stored() !== 'light') paint();
    });
  } catch (e) {}
  window.ASCTheme = {
    paint: paint,
    toggle: function () {
      var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      return paint();
    }
  };
})();
