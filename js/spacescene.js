// ============================================================================
// spacescene.js — the login screen's "open space" backdrop: luxury alloy wheels
// slowly orbiting the sign-in card from a distance. PURE DECORATION:
//   • never receives input (the scene is pointer-events:none, behind the card)
//   • motion is transform/opacity ONLY, so it composites on the GPU and holds
//     60fps on a phone; it freezes to a still, still-pretty arrangement under
//     prefers-reduced-motion (handled in CSS)
//   • orbit radii + wheel sizes are driven by CSS variables tuned per breakpoint
//     (desktop / tablet / phone) so wheels always clear the card and read as
//     "far away", never crowding the form.
// The wheels are drawn as SVG — crisp at any size, a few KB, no image requests.
// ============================================================================

// One shared <defs> for every wheel (kept out of each wheel so the markup stays
// small and the gradients are defined once). userSpaceOnUse gradients give the
// spokes real directional shading that glints as a wheel turns.
const DEFS = `
<svg class="space-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <radialGradient id="ascTire" cx="50%" cy="36%" r="70%">
    <stop offset="0%" stop-color="#2b2f35"/><stop offset="55%" stop-color="#16181c"/>
    <stop offset="100%" stop-color="#050607"/>
  </radialGradient>
  <linearGradient id="ascLip" x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#f4f7fa"/><stop offset="26%" stop-color="#cfd6de"/>
    <stop offset="50%" stop-color="#969fa9"/><stop offset="74%" stop-color="#d9dfe5"/>
    <stop offset="100%" stop-color="#787f89"/>
  </linearGradient>
  <radialGradient id="ascFace" cx="46%" cy="38%" r="70%">
    <stop offset="0%" stop-color="#d3dae1"/><stop offset="58%" stop-color="#9aa3ad"/>
    <stop offset="100%" stop-color="#525963"/>
  </radialGradient>
  <linearGradient id="ascSpoke" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#f1f5f9"/><stop offset="44%" stop-color="#c6cdd5"/>
    <stop offset="56%" stop-color="#a6aeb8"/><stop offset="100%" stop-color="#767e88"/>
  </linearGradient>
  <radialGradient id="ascCap" cx="42%" cy="36%" r="72%">
    <stop offset="0%" stop-color="#eceff3"/><stop offset="55%" stop-color="#aab2bb"/>
    <stop offset="100%" stop-color="#666f7a"/>
  </radialGradient>
  <radialGradient id="ascSpec" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
    <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
</defs></svg>`;

// A single tapered, rounded spoke pointing up (12 o'clock), rotated into place.
function spoke(angle, w = 8.5, wo = 6.6) {
  const l = (50 - w / 2).toFixed(2), r = (50 + w / 2).toFixed(2);
  const lo = (50 - wo / 2).toFixed(2), ro = (50 + wo / 2).toFixed(2);
  return `<path d="M${l} 41 C ${l} 30 ${lo} 21 ${lo} 17 Q 50 13.6 ${ro} 17 C ${ro} 21 ${r} 30 ${r} 41 Q 50 44.4 ${l} 41 Z" transform="rotate(${angle} 50 50)" fill="url(#ascSpoke)" stroke="rgba(18,22,28,.5)" stroke-width=".4" stroke-linejoin="round"/>`;
}

// Four distinct luxury faces so the field reads as "various combinations".
function spokesFor(variant) {
  const out = [];
  if (variant === 0) { for (let i = 0; i < 5; i++) out.push(spoke(i * 72, 9.4, 7.2)); }
  else if (variant === 1) { for (let i = 0; i < 10; i++) out.push(spoke(i * 36, 4.3, 3.4)); }
  else if (variant === 2) { for (let i = 0; i < 5; i++) { out.push(spoke(i * 72 - 5.5, 4.2, 3.3)); out.push(spoke(i * 72 + 5.5, 4.2, 3.3)); } }
  else { for (let i = 0; i < 7; i++) out.push(spoke(i * (360 / 7), 6.6, 5.1)); }
  return out.join("");
}

function lugs() {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    s += `<circle cx="${(50 + 15.4 * Math.cos(a)).toFixed(2)}" cy="${(50 + 15.4 * Math.sin(a)).toFixed(2)}" r="1.15" fill="#3c424a"/>`;
  }
  return s;
}

function wheelSVG(variant) {
  return `<svg class="wheel-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="49" fill="url(#ascTire)"/>
    <circle cx="50" cy="50" r="41.5" fill="#0a0c0f"/>
    <circle cx="50" cy="50" r="40" fill="url(#ascLip)"/>
    <circle cx="50" cy="50" r="36" fill="url(#ascFace)"/>
    <circle cx="50" cy="50" r="35" fill="#14171c"/>
    <g>${spokesFor(variant)}</g>
    <circle cx="50" cy="50" r="12" fill="url(#ascCap)" stroke="rgba(255,255,255,.28)" stroke-width=".5"/>
    <circle cx="50" cy="50" r="4.4" fill="#3a4048"/>
    <circle cx="48.4" cy="48.4" r="2" fill="url(#ascSpec)"/>
    ${lugs()}
    <path d="M20 40 A31 31 0 0 1 44 16" stroke="rgba(255,255,255,.5)" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".65"/>
    <ellipse cx="38" cy="33" rx="27" ry="21" fill="url(#ascSpec)" opacity=".2"/>
  </svg>`;
}

// Each entry orbits the card. rk = radius factor · sz = size factor · op = opacity
// · bl = depth blur px · dur = seconds per revolution · dl = negative start offset
// (spreads wheels around the ring) · sp = own-axis spin seconds · dir = spin sense
// · far = drop on small phones (keeps the scene uncluttered + fast).
const WHEELS = [
  { v: 0, rk: 1.05, sz: 1.35, op: .85, bl: 0,   dur: 150, dl: 0,   sp: 26, dir: 1,  far: 0 },
  { v: 2, rk: 1.55, sz: 0.95, op: .60, bl: .5,  dur: 200, dl: 34,  sp: 40, dir: -1, far: 0 },
  { v: 1, rk: 2.05, sz: 1.55, op: .45, bl: 1.1, dur: 260, dl: 90,  sp: 60, dir: 1,  far: 1 },
  { v: 3, rk: 1.30, sz: 0.70, op: .70, bl: .2,  dur: 175, dl: 120, sp: 33, dir: -1, far: 0 },
  { v: 0, rk: 1.85, sz: 0.60, op: .40, bl: .9,  dur: 240, dl: 165, sp: 48, dir: 1,  far: 1 },
  { v: 1, rk: 1.02, sz: 0.85, op: .78, bl: 0,   dur: 155, dl: 205, sp: 30, dir: -1, far: 0 },
  { v: 2, rk: 2.25, sz: 1.15, op: .32, bl: 1.4, dur: 300, dl: 250, sp: 70, dir: 1,  far: 1 },
];

export function spaceSceneHtml() {
  const orbits = WHEELS.map((w) => `
    <div class="orbit${w.far ? " orbit-far" : ""}" style="--dur:${w.dur}s;animation-delay:-${w.dl}s">
      <div class="wheel-wrap" style="--rk:${w.rk};--sz:${w.sz};--op:${w.op};--bl:${w.bl}px;--sp:${w.sp}s;--dir:${w.dir === -1 ? "reverse" : "normal"}">
        ${wheelSVG(w.v)}
      </div>
    </div>`).join("");
  return `<div class="space-scene" aria-hidden="true">
    <div class="space-haze"></div>
    <div class="space-stars"></div>
    ${DEFS}
    <div class="orbit-field">${orbits}</div>
    <div class="space-vignette"></div>
  </div>`;
}
