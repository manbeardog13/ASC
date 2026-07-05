// ============================================================================
// motion.js — the buttery layer. A tiny spring engine drives MAGNETIC hover and
// TACTILE press on interactive elements: real spring physics (interruptible,
// momentum-preserving), GPU transforms only. The element is gently pulled toward
// the cursor and lifts; on press it compresses and rebounds. Everything settles
// naturally — never linear, never a hard stop.
//
// Skipped on touch and on prefers-reduced-motion (those keep the CSS press).
// Delegated at the document, so it covers views that render in later.
// ============================================================================

const SELECT = ".btn:not(:disabled), .tile[role='button'], .set-row, .card-interactive, " +
  ".scan-tab, .topbar-desk-nav a, .flag-swap, .btn-google, .btn-amber, .link-btn";

// One critically-damped-ish spring (subtle settle, no visible bounce).
const mkSpring = (k, c) => ({ x: 0, v: 0, target: 0, k, c });
function advance(s, dt) {
  const a = (s.target - s.x) * s.k - s.v * s.c;
  s.v += a * dt; s.x += s.v * dt;
  return Math.abs(s.v) > 6e-4 || Math.abs(s.target - s.x) > 6e-4;
}

export function initMotion() {
  const mm = window.matchMedia;
  if (!mm) return;
  if (mm("(prefers-reduced-motion: reduce)").matches) return;
  if (!mm("(hover: hover) and (pointer: fine)").matches) return;   // touch keeps the CSS press

  let el = null, rect = null, raf = 0, last = 0, pressed = false;
  const sx = mkSpring(210, 24), sy = mkSpring(210, 24), ss = mkSpring(240, 30);

  const write = () => {
    if (el) el.style.transform =
      `translate3d(${sx.x.toFixed(2)}px, ${sy.x.toFixed(2)}px, 0) scale(${(1 + ss.x).toFixed(4)})`;
  };
  const release = (node) => { if (node) { node.style.transform = ""; node.style.transition = ""; } };
  const loop = (now) => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016); last = now;
    const moving = advance(sx, dt) | advance(sy, dt) | advance(ss, dt);
    write();
    if (moving) { raf = requestAnimationFrame(loop); return; }
    raf = 0;
    if (el && !pressed && sx.target === 0 && sy.target === 0 && ss.target === 0) { release(el); el = null; }
  };
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  const capture = (node) => {
    if (el && el !== node) release(el);
    el = node; rect = node.getBoundingClientRect();
    sx.x = sy.x = ss.x = 0; sx.v = sy.v = ss.v = 0;   // start clean (no carry-over jump)
    // JS owns transform; let CSS keep animating shadow/tint softly.
    node.style.transition = "box-shadow .42s cubic-bezier(.16,1,.3,1), background-color .22s ease, border-color .22s ease, filter .22s ease";
    ss.target = 0.02;                                  // gentle hover lift
  };

  document.addEventListener("pointerover", (e) => {
    const node = e.target.closest && e.target.closest(SELECT);
    if (!node || node === el) return;
    capture(node); kick();
  }, { passive: true });

  document.addEventListener("pointermove", (e) => {
    if (!el) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const cap = 6, k = 0.15;                            // magnetize: fraction of offset, capped
    sx.target = Math.max(-cap, Math.min(cap, (e.clientX - cx) * k));
    sy.target = Math.max(-cap, Math.min(cap, (e.clientY - cy) * k));
    kick();
  }, { passive: true });

  document.addEventListener("pointerout", (e) => {
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;   // moved within → ignore
    sx.target = 0; sy.target = 0; ss.target = 0; pressed = false; kick();
  }, { passive: true });

  document.addEventListener("pointerdown", () => { if (el) { pressed = true; ss.target = -0.045; kick(); } }, { passive: true });
  window.addEventListener("pointerup", () => { if (pressed) { pressed = false; ss.target = el ? 0.02 : 0; kick(); } }, { passive: true });
}
