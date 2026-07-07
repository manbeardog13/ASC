// ============================================================================
// parity-check.js — mechanical design-parity fingerprint.
// Run in BOTH the mockup tab and the live-app tab (via browser JS console or
// the agent's javascript_tool), then diff the two JSON outputs.
//
//   copy(JSON.stringify(__parity("body")))     // in each tab
//
// Elements are joined on normalized visible text (not DOM paths), so mockup
// and app can differ structurally while still being comparable visually.
// ============================================================================
window.__parity = (rootSel = "body") => {
  const root = document.querySelector(rootSel);
  const base = root.getBoundingClientRect();
  const seen = [];
  const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const walk = (el) => {
    if (el.nodeType !== 1) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const ownText = [...el.childNodes].filter(n => n.nodeType === 3)
      .map(n => n.textContent).join(" ");
    const r = el.getBoundingClientRect();
    if (norm(ownText) || el.matches("input,button,img")) {
      seen.push({
        key: norm(ownText) || (el.placeholder ? "ph:" + norm(el.placeholder) : el.tagName + "." + (el.className || "").toString().split(" ")[0]),
        tag: el.tagName.toLowerCase(),
        x: Math.round(r.left - base.left), y: Math.round(r.top - base.top),
        w: Math.round(r.width), h: Math.round(r.height),
        font: cs.fontFamily.split(",")[0].replace(/"/g, "") + " " + cs.fontSize + " w" + cs.fontWeight,
        color: cs.color, bg: cs.backgroundColor,
        radius: cs.borderRadius, shadow: cs.boxShadow !== "none",
      });
    }
    [...el.children].forEach(walk);
  };
  walk(root);
  return seen;
};
// Diff helper — run anywhere with two saved fingerprints:
window.__parityDiff = (a, b, tol = 3) => {
  const out = [];
  const byKey = new Map(b.map(e => [e.key + "|" + e.tag, e]));
  for (const ea of a) {
    const eb = byKey.get(ea.key + "|" + ea.tag);
    if (!eb) { out.push({ missing: ea.key, tag: ea.tag }); continue; }
    const d = {};
    for (const f of ["font", "radius"]) if (ea[f] !== eb[f]) d[f] = [ea[f], eb[f]];
    for (const f of ["w", "h"]) if (Math.abs(ea[f] - eb[f]) > tol) d[f] = [ea[f], eb[f]];
    if (ea.color !== eb.color) d.color = [ea.color, eb.color];
    if (Object.keys(d).length) out.push({ key: ea.key, ...d });
  }
  return out;
};
// __align: named anchor pairs -> exact top/left deltas (0 = aligned).
window.__align = (pairs) => pairs.map(([a, b]) => {
  const ra = document.querySelector(a)?.getBoundingClientRect();
  const rb = document.querySelector(b)?.getBoundingClientRect();
  return { a, b, dTop: ra && rb ? +(ra.top - rb.top).toFixed(1) : "MISSING", dLeft: ra && rb ? +(ra.left - rb.left).toFixed(1) : "MISSING" };
});
// Position-aware diff (y/x relative to root) — use instead of __parityDiff.
window.__parityDiffPos = (a, b, tol = 3) => {
  const out = []; const byKey = new Map(b.map(e => [e.key + "|" + e.tag, e]));
  for (const ea of a) {
    const eb = byKey.get(ea.key + "|" + ea.tag);
    if (!eb) { out.push({ missing: ea.key, tag: ea.tag }); continue; }
    const d = {};
    for (const f of ["x", "y", "w", "h"]) if (Math.abs(ea[f] - eb[f]) > tol) d[f] = [ea[f], eb[f]];
    for (const f of ["font", "radius", "color", "bg"]) if (ea[f] !== eb[f]) d[f] = [ea[f], eb[f]];
    if (ea.shadow !== eb.shadow) d.shadow = [ea.shadow, eb.shadow];
    if (Object.keys(d).length) out.push({ key: ea.key, ...d });
  }
  return out;
};
