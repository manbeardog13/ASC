// ============================================================================
// spacescene.js — the login screen's backdrop: cinematic real-time 3D (WebGL).
//
// Deep, living space: a slowly-drifting three-layer starfield with a few
// distant spiral galaxies turning at ~1 revolution/hour; two wide alloy wheels
// (silvery metal rims, dead-matte black tyres, vivid-red centre caps) orbiting
// far away and slow; and rare transient events far off in the void — comets
// streaking past every few minutes, the odd supernova flaring and fading, and
// a Millennium Falcon fly-by every 5 hours that jumps to warp. NO bloom/glow.
//
// Physically-based: a real HDRI environment drives the metal reflections, a
// warm off-screen key rakes the polished alloy. Post is Render → SMAA → Output
// (ACES + sRGB) — deliberately no bloom pass, so nothing "glows".
//
// PURE DECORATION: pointer-events:none, behind the form. Three.js + add-ons and
// all textures are lazy-loaded from CDNs only on the login screen (bare
// specifiers resolve through the import map in index.html). If anything is
// unavailable — offline, blocked, no WebGL, reduced-motion — it silently falls
// back to the CSS starfield underneath.
//
// Debug (login screen, dev-console): window.__ascSky.comet() / .nova() / .warp()
// fire a comet, supernova, or Falcon warp-jump on demand.
// ============================================================================

const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/";
// CC0 night HDRI (CORS-enabled) — drives the physically-correct metal reflections.
const TEX = {
  hdr: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/dikhololo_night_1k.hdr",
};

// --- Scene tuning knobs -------------------------------------------------------
const T_ORBIT = 1300;                 // wheel orbit period (s) — slow
const T_SPIN = 150;                   // wheel own-axis spin (s) — slow
const ORBIT_Z = -5.0;                 // pushed deeper into space than before
const TILT = 0.5;                     // orbit-plane tilt
const WHEEL_SCALE = 0.91;             // 30% wider than the previous 0.7
const GALAXY_W = (Math.PI * 2) / 3600;      // 1 rotation / 60 min
const STAR_W0 = (Math.PI * 2) / 3000;       // far star layer drift
const STAR_W1 = (Math.PI * 2) / 2100;       // near star layer drift (parallax)
const EVENT_MIN = 150, EVENT_MAX = 320;     // seconds between comet/supernova
const FALCON_PERIOD = 5 * 3600;             // Millennium Falcon fly-by: every 5h

export function spaceSceneHtml() {
  return `<div class="space-scene" aria-hidden="true">
    <div class="space-haze"></div>
    <div class="space-stars"></div>
    <canvas class="space-3d"></canvas>
    <div class="space-vignette"></div>
  </div>`;
}

let _scene = null;

export function unmountSpaceScene() {
  if (!_scene) return;
  try {
    cancelAnimationFrame(_scene.raf);
    window.removeEventListener("resize", _scene.onResize);
    document.removeEventListener("visibilitychange", _scene.onVis);
    _scene.dispose();
  } catch { /* ignore */ }
  _scene = null;
}

export async function mountSpaceScene() {
  unmountSpaceScene();
  const canvas = document.querySelector(".space-3d");
  if (!canvas) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let THREE, RGBELoader, GLTFLoader, EffectComposer, RenderPass, SMAAPass, OutputPass;
  try {
    [THREE, { RGBELoader }, { GLTFLoader }, { EffectComposer }, { RenderPass }, { SMAAPass }, { OutputPass }] = await Promise.all([
      import("three"),
      import(CDN + "loaders/RGBELoader.js"),
      import(CDN + "loaders/GLTFLoader.js"),
      import(CDN + "postprocessing/EffectComposer.js"),
      import(CDN + "postprocessing/RenderPass.js"),
      import(CDN + "postprocessing/SMAAPass.js"),
      import(CDN + "postprocessing/OutputPass.js"),
    ]);
  } catch { return; }
  if (!document.body.contains(canvas)) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch { return; }

  const size = () => ({ w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
  let { w, h } = size();
  const mobile = Math.min(w, h) < 620;
  const dpr = Math.min(devicePixelRatio || 1, 2);

  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 600);
  camera.position.set(0, 0, 16);

  const disposables = [];
  const pmrem = new THREE.PMREMGenerator(renderer);

  // Immediate procedural env so the metal has something to reflect from frame 1;
  // the real HDRI (below) replaces it a moment later for photoreal reflections.
  const quickEnv = pmrem.fromEquirectangular(makeQuickEnv(THREE)).texture;
  scene.environment = quickEnv;
  new RGBELoader().load(TEX.hdr, (hdr) => {
    try {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const env = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = env;
      hdr.dispose(); quickEnv.dispose();
      _scene && (_scene._env = env);
    } catch { /* keep quickEnv */ }
  }, undefined, () => { /* offline → keep quickEnv */ });

  // --- Lights: warm off-screen key (the sun) + cool fill + cool rim (6:1) ------
  const key = new THREE.DirectionalLight(0xfff2dd, 4.2); key.position.set(-8, 6, 6);
  const fill = new THREE.DirectionalLight(0x3a4d70, 0.28); fill.position.set(7, -2, 4);
  const rim = new THREE.DirectionalLight(0x88a8ff, 0.45); rim.position.set(3, 3, -8);
  scene.add(key, fill, rim);

  // --- Starfield (2 far layers) + distant spinning galaxies --------------------
  const starSprite = makeStarSprite(THREE);
  disposables.push(starSprite);
  const starLayers = [
    buildStars(THREE, disposables, starSprite, mobile ? 1000 : 1700, 260, 0.6, 1.0),
    buildStars(THREE, disposables, starSprite, mobile ? 500 : 820, 175, 1.0, 1.5),
  ];
  starLayers.forEach((s) => scene.add(s));
  const galaxies = buildGalaxies(THREE, scene, disposables);

  // Shared transient-event textures (created once, disposed at teardown).
  const glowTex = makeGlowTexture(THREE);
  const cometTex = makeCometTexture(THREE);
  const flareTex = makeFlareTexture(THREE);
  const ringTex = makeRingTexture(THREE);
  disposables.push(glowTex, cometTex, flareTex, ringTex);

  // --- Red centre-cap kit (added to each wheel, orientation-agnostic) ----------
  // Low metalness + candy clearcoat so it reads as VIVID red under the warm key,
  // instead of going dark maroon like a metallic red would in this dim scene.
  const redCapMat = new THREE.MeshPhysicalMaterial({ color: 0xe4141f, metalness: 0.25, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.9 });
  const capGeo = new THREE.SphereGeometry(0.30, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  disposables.push(redCapMat, capGeo);
  const addCaps = (parent, halfDepth) => {
    const zf = Math.max(0.12, halfDepth * 0.96);
    for (const s of [1, -1]) {
      const cap = new THREE.Mesh(capGeo, redCapMat);
      cap.rotation.x = s > 0 ? -Math.PI / 2 : Math.PI / 2;   // dome faces outward
      cap.scale.set(1, 0.5, 1);                              // flatten the dome
      cap.position.z = s * zf;
      parent.add(cap);
    }
  };

  // --- Two wheels: the generated GLB, cloned into two orbiters -----------------
  // orbiter (orbit position) → tilt (fixed viewing angle) → spinner (own-axis spin).
  const mkRig = (tilt) => {
    const orbiter = new THREE.Group();
    const t = new THREE.Group(); t.rotation.set(tilt[0], tilt[1], tilt[2]); t.scale.setScalar(WHEEL_SCALE);
    const spinner = new THREE.Group();
    t.add(spinner); orbiter.add(t); scene.add(orbiter);
    return { orbiter, spinner };
  };
  const rigA = mkRig([0.4, -0.6, 0]);
  const rigB = mkRig([0.3, 0.66, 0]);

  new GLTFLoader().load("assets/wheel.glb", (gltf) => {
    if (!_scene) return;   // scene torn down while loading
    const { wrap, halfDepth } = normalizeWheel(THREE, gltf.scene);
    enhanceWheelMaterials(wrap);
    rigA.spinner.add(wrap);
    rigB.spinner.add(wrap.clone(true));
    addCaps(rigA.spinner, halfDepth);
    addCaps(rigB.spinner, halfDepth);
  }, undefined, () => {
    // Model unavailable → keep a procedural wheel so the scene still has wheels.
    const shared = makeWheelParts(THREE, disposables, redCapMat);
    rigA.spinner.add(buildWheel(THREE, shared));
    rigB.spinner.add(buildWheel(THREE, shared));
  });

  let Rx = 6, Ry = 5;
  const recompute = () => {
    const aspect = w / h;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    const dist = camera.position.z - ORBIT_Z;
    const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * dist;
    const halfW = halfH * aspect;
    Rx = halfW * (aspect < 0.9 ? 1.16 : 0.92);
    Ry = halfH * 0.86;
  };
  recompute();
  const place = (orbiter, ang) => {
    const lx = Math.cos(ang) * Rx, ly = Math.sin(ang) * Ry;
    orbiter.position.set(lx, ly * Math.cos(TILT), ly * Math.sin(TILT) + ORBIT_Z);
  };

  // --- Transient events far in the void ----------------------------------------
  const transients = [];
  const fireEvent = () => {
    transients.push(Math.random() < 0.62
      ? spawnComet(THREE, scene, cometTex)
      : spawnNova(THREE, scene, flareTex, ringTex));
  };
  const falcon = makeFalcon(THREE, scene, glowTex);
  let nextEvt = 22 + Math.random() * 16;      // first bit of life within ~40s
  let nextFalcon = FALCON_PERIOD;

  // Dev-console hooks so the rare Falcon warp can actually be seen/tested.
  window.__ascSky = {
    comet: () => transients.push(spawnComet(THREE, scene, cometTex)),
    nova: () => transients.push(spawnNova(THREE, scene, flareTex, ringTex)),
    warp: () => falcon.trigger(),
  };

  // --- Cinematic post: Render → SMAA → Output(ACES + sRGB). No bloom/glow. ------
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new SMAAPass(w * dpr, h * dpr));
  composer.addPass(new OutputPass());

  const clock = new THREE.Clock();
  let running = true, last = 0;
  const render = () => {
    const t = clock.getElapsedTime();
    let dt = t - last; last = t;
    if (dt > 0.05) dt = 0.05; else if (dt < 0) dt = 0;

    // Wheels: slow orbit + slow spin.
    const ao = t * (Math.PI * 2 / T_ORBIT);
    place(rigA.orbiter, ao);
    place(rigB.orbiter, ao + Math.PI);
    const spin = t * (Math.PI * 2 / T_SPIN);
    rigA.spinner.rotation.z = spin;
    rigB.spinner.rotation.z = -spin * 0.92;

    // Living universe: drifting star layers (parallax) + turning galaxies.
    starLayers[0].rotation.set(Math.sin(t * 0.02) * 0.02, t * STAR_W0, 0);
    starLayers[1].rotation.set(Math.sin(t * 0.03) * 0.015, t * STAR_W1, 0);
    for (const g of galaxies) g.sprite.material.rotation = g.ph + t * g.w;

    // Scheduled far-away events.
    if (t >= nextEvt) { fireEvent(); nextEvt = t + EVENT_MIN + Math.random() * (EVENT_MAX - EVENT_MIN); }
    if (t >= nextFalcon && !falcon.isActive()) { falcon.trigger(); nextFalcon = t + FALCON_PERIOD; }

    for (let i = transients.length - 1; i >= 0; i--) {
      if (transients[i].update(dt)) { transients[i].dispose(); transients.splice(i, 1); }
    }
    falcon.update(dt);

    composer.render();
  };
  const loop = () => { _scene.raf = requestAnimationFrame(loop); if (running) render(); };

  const onResize = () => {
    ({ w, h } = size());
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    recompute();
    render();
  };
  const onVis = () => { running = document.visibilityState === "visible"; };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);

  const dispose = () => {
    try { delete window.__ascSky; } catch { window.__ascSky = undefined; }
    transients.forEach((x) => x.dispose());
    transients.length = 0;
    falcon.dispose();
    renderer.dispose();
    composer.dispose?.();
    pmrem.dispose();
    _scene?._env?.dispose?.();
    quickEnv.dispose?.();
    disposables.forEach((d) => d && d.dispose && d.dispose());
    scene.environment = null;
  };

  _scene = { raf: 0, onResize, onVis, dispose, _env: null };
  render();
  _scene.raf = requestAnimationFrame(loop);
}

// ---- Deterministic PRNG (stable field each load) -------------------------------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- Fallback env (used until the HDRI loads): dark space + one warm key -------
function makeQuickEnv(THREE) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#05070c"; ctx.fillRect(0, 0, 512, 256);
  const sun = ctx.createRadialGradient(150, 60, 3, 150, 60, 130);
  sun.addColorStop(0, "rgba(255,248,236,1)"); sun.addColorStop(1, "rgba(255,244,220,0)");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Soft round star sprite ----------------------------------------------------
function makeStarSprite(THREE) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Real stellar colours by spectral class (weighted toward cool white).
const STAR_COLORS = [
  [0xaabfff, 0.10], [0xcad7ff, 0.20], [0xf8f7ff, 0.30],
  [0xfff4ea, 0.20], [0xffd2a1, 0.12], [0xffcc6f, 0.08],
];
function pickStarColor(THREE, r) {
  let x = r, i = 0;
  for (; i < STAR_COLORS.length; i++) { x -= STAR_COLORS[i][1]; if (x <= 0) break; }
  return new THREE.Color(STAR_COLORS[Math.min(i, STAR_COLORS.length - 1)][0]);
}
function buildStars(THREE, disposables, sprite, count, radius, sizeMin, sizeMax) {
  const rand = rng(1000 + count);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1), rr = radius * (0.8 + rand() * 0.4);
    pos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = rr * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = rr * Math.cos(ph);
    const c = pickStarColor(THREE, rand());
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    map: sprite, vertexColors: true, size: (sizeMin + sizeMax) / 2,
    sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
  });
  disposables.push(geo, mat);
  return new THREE.Points(geo, mat);
}

// ---- Distant spiral galaxies (far, faint, turning ~1 rev/hour) -----------------
function makeGalaxyTexture(THREE, tint) {
  const S = 256; const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  const col = new THREE.Color(tint);
  const rgb = (a) => `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
  x.translate(S / 2, S / 2); x.rotate(0.4); x.scale(1, 0.55);   // tilted disc
  x.globalCompositeOperation = "lighter";
  const core = x.createRadialGradient(0, 0, 0, 0, 0, 42);
  core.addColorStop(0, "rgba(255,255,255,0.95)");
  core.addColorStop(0.3, rgb(0.7));
  core.addColorStop(1, rgb(0));
  x.fillStyle = core; x.beginPath(); x.arc(0, 0, 42, 0, 7); x.fill();
  for (let arm = 0; arm < 2; arm++) {
    const ph = arm * Math.PI;
    for (let r = 10; r < 120; r += 2) {
      const a = ph + Math.log(r) * 2.4;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      const fall = 1 - r / 120;
      const rad = 1 + fall * 5;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, rgb(0.5 * fall));
      g.addColorStop(1, rgb(0));
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function buildGalaxies(THREE, scene, disposables) {
  const specs = [
    { p: [-95, 55, -230], s: 78, tint: 0x93a7ff, dir: 1, ph: 0.0 },
    { p: [120, -42, -260], s: 104, tint: 0xffcf9a, dir: -1, ph: 1.1 },
    { p: [46, 96, -245], s: 64, tint: 0xcaa6ff, dir: 1, ph: 2.2 },
  ];
  const arr = [];
  for (const sp of specs) {
    const tex = makeGalaxyTexture(THREE, sp.tint);
    const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85 });
    disposables.push(tex, mat);
    const spr = new THREE.Sprite(mat);
    spr.position.set(sp.p[0], sp.p[1], sp.p[2]);
    spr.scale.setScalar(sp.s);
    spr.material.rotation = sp.ph;
    scene.add(spr);
    arr.push({ sprite: spr, w: GALAXY_W * sp.dir, ph: sp.ph });
  }
  return arr;
}

// ---- Shared soft-glow / streak / flare / ring textures -------------------------
function makeGlowTexture(THREE) {
  const S = 128; const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(235,245,255,0.75)");
  g.addColorStop(0.6, "rgba(200,225,255,0.18)");
  g.addColorStop(1, "rgba(200,225,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeCometTexture(THREE) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const x = c.getContext("2d");
  x.globalCompositeOperation = "lighter";
  for (let px = 205; px > 12; px -= 2) {          // tail: fading beam toward the left
    const k = (px - 12) / (205 - 12);
    const rad = 1.5 + k * 9;
    const alpha = 0.05 + k * 0.16;
    const g = x.createRadialGradient(px, 32, 0, px, 32, rad);
    g.addColorStop(0, `rgba(200,225,255,${alpha})`);
    g.addColorStop(1, "rgba(200,225,255,0)");
    x.fillStyle = g; x.beginPath(); x.arc(px, 32, rad, 0, 7); x.fill();
  }
  const h = x.createRadialGradient(214, 32, 0, 214, 32, 20);   // bright head at the right
  h.addColorStop(0, "rgba(255,255,255,1)");
  h.addColorStop(0.4, "rgba(220,240,255,0.8)");
  h.addColorStop(1, "rgba(200,225,255,0)");
  x.fillStyle = h; x.beginPath(); x.arc(214, 32, 20, 0, 7); x.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeFlareTexture(THREE) {
  const S = 128; const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d"); const cx = S / 2;
  x.globalCompositeOperation = "lighter";
  const core = x.createRadialGradient(cx, cx, 0, cx, cx, cx);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.15, "rgba(255,246,235,0.9)");
  core.addColorStop(0.4, "rgba(255,230,200,0.25)");
  core.addColorStop(1, "rgba(255,220,190,0)");
  x.fillStyle = core; x.fillRect(0, 0, S, S);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {       // 4-point diffraction spikes
    const g = x.createLinearGradient(cx - dx * cx, cx - dy * cx, cx + dx * cx, cx + dy * cx);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    if (dx) x.fillRect(0, cx - 1.5, S, 3); else x.fillRect(cx - 1.5, 0, 3, S);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function makeRingTexture(THREE) {
  const S = 128; const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d"); const cx = S / 2;
  x.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    x.strokeStyle = `rgba(200,225,255,${0.11 - i * 0.014})`;
    x.lineWidth = 3 - i * 0.35;
    x.beginPath(); x.arc(cx, cx, 44 - i * 2, 0, 7); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

// ---- Comet: a bright head + streak tail crossing the far sky, tail trailing ----
function spawnComet(THREE, scene, tex) {
  const z = -140;
  const dir = Math.random() * Math.PI * 2;
  const vx = Math.cos(dir), vy = Math.sin(dir);
  const span = 150, life = 7.5, speed = span / life;
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xcfe6ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  head.scale.set(22, 5.5, 1);
  head.material.rotation = Math.atan2(vy, vx);            // point head along travel
  head.position.set(-vx * span * 0.55 + (Math.random() - 0.5) * 40, -vy * span * 0.55 + (Math.random() - 0.5) * 40, z);
  scene.add(head);
  let age = 0;
  return {
    update(dt) {
      age += dt;
      head.position.x += vx * speed * dt;
      head.position.y += vy * speed * dt;
      const k = age / life;
      let o = 1;
      if (k < 0.15) o = k / 0.15; else if (k > 0.7) o = Math.max(0, (1 - k) / 0.3);
      head.material.opacity = o * 0.95;
      return age >= life;
    },
    dispose() { scene.remove(head); head.material.dispose(); },
  };
}

// ---- Supernova: a point that flares hard, then fades, with an expanding shell --
function spawnNova(THREE, scene, flareTex, ringTex) {
  const z = -150;
  const a = Math.random() * Math.PI * 2, R = 55 + Math.random() * 20;
  const pos = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R * 0.7, z + (Math.random() - 0.5) * 20);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flareTex, color: 0xfff0e6, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0x9fc7ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  flare.position.copy(pos); ring.position.copy(pos);
  flare.scale.setScalar(2); ring.scale.setScalar(2);
  scene.add(flare); scene.add(ring);
  let age = 0; const life = 9;
  return {
    update(dt) {
      age += dt; const k = age / life;
      const rise = Math.min(1, age / 0.8);                       // fast rise ≈0.8s
      const decay = Math.max(0, 1 - Math.max(0, age - 0.8) / (life - 0.8));
      const bright = rise * decay;
      flare.material.opacity = bright;
      flare.scale.setScalar(2 + bright * 8);
      ring.material.opacity = Math.max(0, 1 - k) * 0.5 * Math.min(1, age / 0.5);
      ring.scale.setScalar(2 + k * 18);
      return age >= life;
    },
    dispose() { scene.remove(flare); scene.remove(ring); flare.material.dispose(); ring.material.dispose(); },
  };
}

// ---- Millennium Falcon fly-by + warp jump --------------------------------------
// Generated GLB (assets/falcon.glb) flown across the far distance; on cue the
// engines flare, the ship stretches along its heading, and it snaps to warp.
function makeFalcon(THREE, scene, glowTex) {
  let active = false, state = "idle", age = 0, parts = [], modelCache = null, GLTFLoaderRef = null;
  let root = null, inner = null, ship = null, engineGlow = null, flash = null, vx = 0, vy = 0, speed = 0;

  const ensureLoader = () => {
    if (GLTFLoaderRef) return Promise.resolve(GLTFLoaderRef);
    return import(CDN + "loaders/GLTFLoader.js").then((m) => (GLTFLoaderRef = m.GLTFLoader));
  };

  function build() {
    parts = [];
    root = new THREE.Group(); inner = new THREE.Group(); root.add(inner);

    // A holder the model drops into; scaled/normalised once loaded.
    ship = new THREE.Group();
    inner.add(ship);

    // Engine glow (blue-white) trailing behind the ship; the warp streak.
    engineGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9fd2ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.85 }));
    engineGlow.position.set(-1.25, 0, 0);
    engineGlow.scale.set(0.8, 1.4, 1);
    inner.add(engineGlow);
    parts.push(engineGlow.material);

    // Warp flash (in root, so it doesn't stretch with the ship).
    flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
    flash.scale.setScalar(0.1);
    root.add(flash);
    parts.push(flash.material);

    root.scale.setScalar(2.6);
    scene.add(root);

    // Load (and cache) the generated model; orient nose → +X, unit-scale.
    ensureLoader().then((Loader) => {
      if (!active || !ship) return;
      const place = (obj) => { ship.add(obj); };
      if (modelCache) { place(modelCache.clone(true)); return; }
      new Loader().load("assets/falcon.glb", (gltf) => {
        if (!ship) return;
        const m = normalizeFalcon(THREE, gltf.scene);
        modelCache = m;
        place(m.clone(true));
      }, undefined, () => { /* offline first-run → engine glow still streaks */ });
    });
  }

  function cleanup() {
    if (root) scene.remove(root);
    parts.forEach((p) => p && p.dispose && p.dispose());
    parts = []; root = inner = ship = engineGlow = flash = null;
    active = false; state = "idle";
  }

  function trigger() {
    if (active) return;
    active = true; age = 0; state = "cruise";
    build();
    const dir = Math.random() * Math.PI * 2;
    vx = Math.cos(dir); vy = Math.sin(dir); speed = 9;
    const R = 50;
    root.position.set(-vx * R + (Math.random() - 0.5) * 16, -vy * R * 0.6 + 12 + (Math.random() - 0.5) * 8, -85);
    inner.rotation.z = Math.atan2(vy, vx);       // heading in the screen plane
    root.rotation.set(0.52, -0.34, 0);           // fixed 3/4 viewing tilt
  }

  function update(dt) {
    if (!active) return;
    age += dt;
    root.position.x += vx * speed * dt;
    root.position.y += vy * speed * dt;
    inner.position.y = Math.sin(age * 1.4) * 0.04;   // gentle bob

    if (state === "cruise") {
      engineGlow.material.opacity = 0.85;
      if (age > 3.1) state = "charge";
    } else if (state === "charge") {
      const k = (age - 3.1) / 0.9;                   // engines build, ship eases up
      speed = Math.max(4, 9 - 5 * k);
      engineGlow.material.opacity = 0.85 + 0.15 * Math.sin(age * 30);
      engineGlow.scale.set(0.8 + 0.6 * k, 1.4 + 0.7 * k, 1);
      if (age > 4.0) state = "warp";
    } else if (state === "warp") {
      const wv = Math.min(1, (age - 4.0) / 1.0);
      if (ship) ship.scale.x = 1 + wv * 8;           // stretch along heading
      speed = 9 + wv * wv * 120;                     // snap forward
      engineGlow.scale.set(1.4 + wv * 7, 2.2, 1);    // long warp streak
      engineGlow.material.opacity = 0.9;
      flash.material.opacity = Math.sin(wv * Math.PI) * 0.9;
      flash.scale.setScalar(0.2 + wv * 6);
      if (wv >= 1) cleanup();
    }
  }

  return { trigger, update, dispose: cleanup, isActive: () => active };
}

// Normalise the generated Falcon: stand the disc up to face the camera (+Z, thin
// along Z), centre it, aim its nose (mandible fork) to +X so it flies nose-first,
// and unit-scale it. Returns a group whose local +X is "forward".
function normalizeFalcon(THREE, src) {
  const model = src;
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const s0 = box.getSize(new THREE.Vector3());
  // Thinnest axis is the disc's normal → stand it up to face +Z.
  if (s0.x <= s0.y && s0.x <= s0.z) model.rotation.y = Math.PI / 2;
  else if (s0.y <= s0.x && s0.y <= s0.z) model.rotation.x = Math.PI / 2;
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  model.position.sub(c);
  model.updateMatrixWorld(true);
  // Give every material an env-lit metallic finish (weathered hull) if flat.
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.metalness !== undefined) { m.metalness = Math.max(m.metalness, 0.55); m.roughness = Math.min(m.roughness ?? 1, 0.6); m.envMapIntensity = 1.0; }
      m.needsUpdate = true;
    });
  });
  // Aim the nose along +X: the farthest-out vertices in the disc plane are the
  // mandible tips; their average direction is "forward". Spin the ship to match.
  const yawGroup = new THREE.Group();
  yawGroup.rotation.z = -falconForwardYaw(THREE, model);
  yawGroup.add(model);
  const wrap = new THREE.Group();
  wrap.add(yawGroup);
  wrap.scale.setScalar(2 / Math.max(s.x, s.y, 0.0001));   // longest span → 2
  return wrap;
}

// The Millennium Falcon's mandible fork sticks out past the round disc, so the
// vertices farthest from the axle axis cluster at the two prongs; averaging their
// in-plane direction points along the ship's nose.
function falconForwardYaw(THREE, model) {
  const v = new THREE.Vector3();
  let maxR = 0;
  const scan = (fn) => model.traverse((o) => {
    const p = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!p) return;
    const step = Math.max(1, Math.floor(p.count / 20000));
    for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); fn(Math.hypot(v.x, v.y)); }
  });
  scan((r) => { if (r > maxR) maxR = r; });
  if (maxR <= 0) return 0;
  let sx = 0, sy = 0, n = 0; const thr = maxR * 0.85;
  model.traverse((o) => {
    const p = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!p) return;
    const step = Math.max(1, Math.floor(p.count / 20000));
    for (let i = 0; i < p.count; i += step) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (Math.hypot(v.x, v.y) >= thr) { sx += v.x; sy += v.y; n++; }
    }
  });
  return n ? Math.atan2(sy, sx) : 0;
}

// ---- Tyre tread bump (procedural fallback wheel) -------------------------------
function makeTireBump(THREE) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8a8a8a"; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#2a2a2a";
  for (const x of [72, 128, 184]) ctx.fillRect(x - 5, 0, 10, 256);
  ctx.fillStyle = "#d8d8d8";
  for (let y = 0; y < 256; y += 22) { ctx.fillRect(8, y + 3, 44, 14); ctx.fillRect(204, y + 10, 44, 14); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 1);
  return tex;
}

// ---- Generated wheel: normalise (orient axle → +Z, centre, unit-scale) ---------
function normalizeWheel(THREE, src) {
  const model = src;
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const s0 = box.getSize(new THREE.Vector3());
  // The axle is the shortest bbox dimension — rotate it onto +Z so the wheel faces us.
  if (s0.x <= s0.y && s0.x <= s0.z) model.rotation.y = Math.PI / 2;
  else if (s0.y <= s0.x && s0.y <= s0.z) model.rotation.x = Math.PI / 2;
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  model.position.sub(c);                                   // centre at origin
  const wrap = new THREE.Group();
  wrap.add(model);
  const maxXY = Math.max(s.x, s.y, 0.0001);
  wrap.scale.setScalar(2 / maxXY);                         // fit diameter → 2 (radius 1)
  return { wrap, halfDepth: s.z / maxXY };                 // z half-depth in radius-1 units
}

// Silvery metallic alloy + dead-matte black tyre. Classify by base-colour
// luminance: the bright part is the rim → real chrome-silver metal reflecting
// the HDRI; the dark part is the tyre → pure black rubber, zero reflection.
function enhanceWheelMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      const c = m.color;
      const lum = c ? c.r * 0.3 + c.g * 0.6 + c.b * 0.1 : 0.5;
      if (lum > 0.26) {                    // alloy → silvery metallic
        m.metalness = 1.0; m.roughness = 0.24; m.envMapIntensity = 2.0;
        if (c) c.setRGB(0.80, 0.82, 0.86);
        m.map = null;                      // drop flat albedo so pure metal reflects
      } else {                             // tyre → dead-matte black, no reflection
        m.metalness = 0.0; m.roughness = 1.0; m.envMapIntensity = 0.0;
        if (c) c.setRGB(0.02, 0.02, 0.022);
        if (m.emissive) m.emissive.setRGB(0, 0, 0);
        if ("clearcoat" in m) m.clearcoat = 0;
        if ("sheen" in m) m.sheen = 0;
        m.map = null;                      // uniform black, no baked highlights
      }
      m.needsUpdate = true;
    });
  });
}

// ---- Fallback wheel: shared geometry + PBR materials (env-map driven) -----------
function makeWheelParts(THREE, disposables, redCapMat) {
  const alloy = new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1.0, roughness: 0.2, envMapIntensity: 1.9, clearcoat: 0.5, clearcoatRoughness: 0.14 });
  const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, metalness: 1.0, roughness: 0.05, envMapIntensity: 2.1 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 1.0, roughness: 0.55, envMapIntensity: 1.0 });
  const bump = makeTireBump(THREE);
  // Dead-matte black tyre — no clearcoat, no sheen, zero env reflection.
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.0, roughness: 1.0, bumpMap: bump, bumpScale: 0.012, envMapIntensity: 0.0 });
  disposables.push(alloy, lipMat, darkMetal, tireMat, bump);

  const P = (r, z) => new THREE.Vector2(r, z);
  // Tyre profile widened ~30% in the axle (z) direction to match the wider wheels.
  const tireGeo = new THREE.LatheGeometry([
    P(0.82, -0.52), P(0.88, -0.50), P(0.95, -0.45), P(0.99, -0.36), P(1.00, -0.23),
    P(1.00, 0.23), P(0.99, 0.36), P(0.95, 0.45), P(0.88, 0.50), P(0.82, 0.52),
  ], 160);
  const barrelGeo = new THREE.CylinderGeometry(0.80, 0.80, 0.86, 96, 1, true);
  const lipGeo = new THREE.TorusGeometry(0.815, 0.05, 24, 140);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.20, 0.16, 48);
  const capGeo = new THREE.SphereGeometry(0.16, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const lugGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.05, 16);

  const shape = new THREE.Shape();
  shape.moveTo(-0.038, 0.15);
  shape.lineTo(-0.058, 0.795);
  shape.quadraticCurveTo(0, 0.85, 0.058, 0.795);
  shape.lineTo(0.038, 0.15);
  shape.quadraticCurveTo(0, 0.11, -0.038, 0.15);
  const spokeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.024, bevelSegments: 3, steps: 1 });
  disposables.push(tireGeo, barrelGeo, lipGeo, hubGeo, capGeo, lugGeo, spokeGeo);

  return { alloy, lipMat, darkMetal, tireMat, redCap: redCapMat, tireGeo, barrelGeo, lipGeo, hubGeo, capGeo, lugGeo, spokeGeo };
}

function buildWheel(THREE, s) {
  const wheel = new THREE.Group();
  const AX = Math.PI / 2;
  const tire = new THREE.Mesh(s.tireGeo, s.tireMat); tire.rotation.x = AX; wheel.add(tire);
  const barrel = new THREE.Mesh(s.barrelGeo, s.darkMetal); barrel.rotation.x = AX; wheel.add(barrel);
  const lip = new THREE.Mesh(s.lipGeo, s.lipMat); lip.position.z = 0.30; wheel.add(lip);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    g.rotation.z = (i / 10) * Math.PI * 2;
    const spoke = new THREE.Mesh(s.spokeGeo, s.alloy);
    spoke.rotation.x = -0.28; spoke.position.z = 0.02;
    g.add(spoke); wheel.add(g);
  }
  const hub = new THREE.Mesh(s.hubGeo, s.darkMetal); hub.rotation.x = AX; hub.position.z = -0.02; wheel.add(hub);
  // Vivid-red centre cap.
  const cap = new THREE.Mesh(s.capGeo, s.redCap); cap.rotation.x = -AX; cap.position.z = 0.17; cap.scale.set(1, 0.62, 1); wheel.add(cap);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const l = new THREE.Mesh(s.lugGeo, s.darkMetal);
    l.rotation.x = AX; l.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.16);
    wheel.add(l);
  }
  return wheel;
}
