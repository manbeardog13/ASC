/* Blocking head script. Applies the theme before first paint.
   Stored choice wins. With no choice, ASC opens in dark mode.
   Only the theme key is read or written — nothing else. */
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
    return true;
  }
  function paint() {
    var dark = darkNow();
    document.documentElement.classList.toggle('dark', dark);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0a0c11' : '#edf0f5');
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
