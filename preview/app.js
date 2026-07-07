/* =========================================================================
   ASC design system · v6 "Hanssen" — shared behaviour
   Extracted VERBATIM from dashboard.html.

   NOTE — blocking head script: each page ALSO carries a tiny blocking
   <script> in <head>, BEFORE this file and before the stylesheet, that reads
   localStorage('asc.theme') and (if 'dark') adds html.dark + repaints the
   theme-color meta synchronously. That must stay inline in <head> to apply the
   theme before first paint and avoid a light/dark flash; do NOT move it here.
   This file re-reads the same key and wires the interactive toggle + animations.
   ========================================================================= */

const root = document.documentElement;
const meta = document.querySelector('meta[name="theme-color"]');
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
try { if (localStorage.getItem('asc.theme') === 'dark') root.classList.add('dark'); } catch(e){}
const paintTheme = () => meta.setAttribute('content', root.classList.contains('dark') ? '#020305' : '#edf0f5');
paintTheme();
document.getElementById('mode').addEventListener('click', () => {
  const dark = root.classList.toggle('dark');
  try { localStorage.setItem('asc.theme', dark ? 'dark' : 'light'); } catch(e){}
  paintTheme();
});

// Animated count-up + bar/meter fill (instant when reduced motion).
function animate(){
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    if (reduce || target === 0){ el.textContent = target; return; }
    const dur = 900, t0 = performance.now();
    const step = (t) => { const p = Math.min(1,(t-t0)/dur); el.textContent = Math.round(target*(1-Math.pow(1-p,3))); if(p<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  requestAnimationFrame(() => document.querySelectorAll('[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; }));
}

// Dock: iOS tab bar. Real hrefs navigate; placeholder ("#") tabs just move the
// tint (so the preview stays interactive without dead-ending the real links).
const dtabs = [...document.querySelectorAll('.dock .dtab')];
dtabs.forEach(t => t.addEventListener('click', e => {
  if (t.getAttribute('href') === '#') {
    e.preventDefault();
    dtabs.forEach(x => x.classList.remove('on'));
    t.classList.add('on');
  }
}));

if (document.readyState !== 'loading') animate(); else addEventListener('DOMContentLoaded', animate);
