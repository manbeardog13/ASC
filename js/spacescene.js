// ============================================================================
// spacescene.js — the login screen's backdrop: cinematic real-time 3D (WebGL).
//
// Deep space with a real, textured Earth pushed far and low; a three-layer,
// stellar-coloured starfield; and two glossy alloy wheels (wide low-profile
// tyres) slowly orbiting/​spinning far in the distance, never crossing the form.
// Physically-based: a real HDRI environment drives the metal reflections, a
// warm off-screen key rakes the polished alloy, and an ACES-tone-mapped
// EffectComposer (selective bloom + SMAA) gives the cinematic finish.
//
// PURE DECORATION: pointer-events:none, behind the form. Three.js + add-ons and
// all textures are lazy-loaded from CDNs only on the login screen (bare
// specifiers resolve through the import map in index.html). If anything is
// unavailable — offline, blocked, no WebGL, reduced-motion — it silently falls
// back to the CSS starfield underneath.
// ============================================================================

const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/";
// Real NASA-derived Earth textures + a CC0 night HDRI (both CORS-enabled).
const TEX = {
  earth:  "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_atmos_2048.jpg",
  normal: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_normal_2048.jpg",
  clouds: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/earth_clouds_2048.png",
  hdr:    "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/dikhololo_night_1k.hdr",
};

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

  let THREE, RGBELoader, EffectComposer, RenderPass, UnrealBloomPass, SMAAPass, OutputPass;
  try {
    [THREE, { RGBELoader }, { EffectComposer }, { RenderPass }, { UnrealBloomPass }, { SMAAPass }, { OutputPass }] = await Promise.all([
      import("three"),
      import(CDN + "loaders/RGBELoader.js"),
      import(CDN + "postprocessing/EffectComposer.js"),
      import(CDN + "postprocessing/RenderPass.js"),
      import(CDN + "postprocessing/UnrealBloomPass.js"),
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
  renderer.toneMappingExposure = 1.18;
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
  const fill = new THREE.DirectionalLight(0x3a4d70, 0.5); fill.position.set(7, -2, 4);
  const rim = new THREE.DirectionalLight(0x88a8ff, 0.7); rim.position.set(3, 3, -8);
  scene.add(key, fill, rim);

  // --- Starfield (3 depth layers, stellar colours, a few hero stars) -----------
  const starSprite = makeStarSprite(THREE);
  disposables.push(starSprite);
  const starLayers = [
    buildStars(THREE, disposables, starSprite, mobile ? 900 : 1500, 260, 0.7, 1.1),
    buildStars(THREE, disposables, starSprite, mobile ? 420 : 700, 170, 1.2, 1.9),
    buildStars(THREE, disposables, starSprite, mobile ? 30 : 46, 90, 2.6, 3.6),
  ];
  starLayers.forEach((s) => scene.add(s));

  // --- Earth: real textures, pushed far and low, atmosphere rim + clouds --------
  const earth = buildEarth(THREE, disposables);
  earth.grp.position.set(-5, -29, -98);
  earth.grp.scale.setScalar(6.2);
  earth.grp.rotation.z = 0.32;
  scene.add(earth.grp);

  // --- Two wheels (shared geometry/materials) ----------------------------------
  const shared = makeWheelParts(THREE, disposables);
  const wheelA = buildWheel(THREE, shared);
  const wheelB = buildWheel(THREE, shared);
  wheelA.scale.setScalar(0.66); wheelB.scale.setScalar(0.66);
  wheelA.rotation.set(0.4, -0.6, 0);
  wheelB.rotation.set(0.3, 0.66, 0);
  const orbiterA = new THREE.Group(); orbiterA.add(wheelA); scene.add(orbiterA);
  const orbiterB = new THREE.Group(); orbiterB.add(wheelB); scene.add(orbiterB);

  const T_ORBIT = 720, T_SPIN = 60, ORBIT_Z = -2.0, TILT = 0.5;
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

  // --- Cinematic post: Render → selective Bloom → SMAA → Output(ACES + sRGB) ----
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.7, 0.82);
  composer.addPass(bloom);
  const smaa = new SMAAPass(w * dpr, h * dpr);
  composer.addPass(smaa);
  composer.addPass(new OutputPass());

  const clock = new THREE.Clock();
  let running = true;
  const render = () => {
    const t = clock.getElapsedTime();
    const ao = t * (Math.PI * 2 / T_ORBIT);
    place(orbiterA, ao);
    place(orbiterB, ao + Math.PI);
    const spin = t * (Math.PI * 2 / T_SPIN);
    wheelA.rotation.z = spin;
    wheelB.rotation.z = -spin * 0.92;
    earth.earth.rotation.y = t * 0.004;
    earth.clouds.rotation.y = t * 0.0055;
    composer.render();
  };
  const loop = () => { _scene.raf = requestAnimationFrame(loop); if (running) render(); };

  const onResize = () => {
    ({ w, h } = size());
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    recompute();
    render();
  };
  const onVis = () => { running = document.visibilityState === "visible"; };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);

  const dispose = () => {
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

// ---- Earth: real day texture + normal map + cloud shell + atmospheric rim ------
function buildEarth(THREE, disposables) {
  const grp = new THREE.Group();
  const loader = new THREE.TextureLoader();
  const map = loader.load(TEX.earth);   map.colorSpace = THREE.SRGBColorSpace;
  const normal = loader.load(TEX.normal);
  const clouds = loader.load(TEX.clouds); clouds.colorSpace = THREE.SRGBColorSpace;
  disposables.push(map, normal, clouds);

  const geo = new THREE.SphereGeometry(1, 64, 64);
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.86, metalness: 0.0,
  });
  disposables.push(geo, mat);
  const earth = new THREE.Mesh(geo, mat);
  grp.add(earth);

  const cloudGeo = new THREE.SphereGeometry(1.012, 64, 64);
  const cloudMat = new THREE.MeshStandardMaterial({ alphaMap: clouds, transparent: true, roughness: 1, metalness: 0, color: 0xffffff, depthWrite: false, opacity: 0.9 });
  disposables.push(cloudGeo, cloudMat);
  const cloudsMesh = new THREE.Mesh(cloudGeo, cloudMat);
  grp.add(cloudsMesh);

  const atmGeo = new THREE.SphereGeometry(1.14, 64, 64);
  const atmMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { glow: { value: new THREE.Color(0x5b8bff) }, power: { value: 2.6 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 glow; uniform float power;
      void main(){ float f = pow(1.0 - abs(dot(vN,vV)), power); gl_FragColor = vec4(glow, f); }`,
  });
  disposables.push(atmGeo, atmMat);
  grp.add(new THREE.Mesh(atmGeo, atmMat));

  return { grp, earth, clouds: cloudsMesh };
}

// ---- Tyre tread bump -----------------------------------------------------------
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

// ---- Wheel: shared geometry + PBR materials (env-map driven) --------------------
function makeWheelParts(THREE, disposables) {
  const alloy = new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, metalness: 1.0, roughness: 0.2, envMapIntensity: 1.9, clearcoat: 0.5, clearcoatRoughness: 0.14 });
  const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f7, metalness: 1.0, roughness: 0.05, envMapIntensity: 2.1 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 1.0, roughness: 0.55, envMapIntensity: 1.0 });
  const bump = makeTireBump(THREE);
  const tireMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.0, roughness: 0.78, clearcoat: 0.18, clearcoatRoughness: 0.5, bumpMap: bump, bumpScale: 0.012, envMapIntensity: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0x222222) });
  disposables.push(alloy, lipMat, darkMetal, tireMat, bump);

  const P = (r, z) => new THREE.Vector2(r, z);
  const tireGeo = new THREE.LatheGeometry([
    P(0.82, -0.40), P(0.88, -0.39), P(0.95, -0.35), P(0.99, -0.28), P(1.00, -0.18),
    P(1.00, 0.18), P(0.99, 0.28), P(0.95, 0.35), P(0.88, 0.39), P(0.82, 0.40),
  ], 160);
  const barrelGeo = new THREE.CylinderGeometry(0.80, 0.80, 0.66, 96, 1, true);
  const lipGeo = new THREE.TorusGeometry(0.815, 0.05, 24, 140);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.20, 0.16, 48);
  const capGeo = new THREE.SphereGeometry(0.15, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const lugGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.05, 16);

  const shape = new THREE.Shape();
  shape.moveTo(-0.038, 0.15);
  shape.lineTo(-0.058, 0.795);
  shape.quadraticCurveTo(0, 0.85, 0.058, 0.795);
  shape.lineTo(0.038, 0.15);
  shape.quadraticCurveTo(0, 0.11, -0.038, 0.15);
  const spokeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.024, bevelSegments: 3, steps: 1 });
  disposables.push(tireGeo, barrelGeo, lipGeo, hubGeo, capGeo, lugGeo, spokeGeo);

  return { alloy, lipMat, darkMetal, tireMat, tireGeo, barrelGeo, lipGeo, hubGeo, capGeo, lugGeo, spokeGeo };
}

function buildWheel(THREE, s) {
  const wheel = new THREE.Group();
  const AX = Math.PI / 2;
  const tire = new THREE.Mesh(s.tireGeo, s.tireMat); tire.rotation.x = AX; wheel.add(tire);
  const barrel = new THREE.Mesh(s.barrelGeo, s.darkMetal); barrel.rotation.x = AX; wheel.add(barrel);
  const lip = new THREE.Mesh(s.lipGeo, s.lipMat); lip.position.z = 0.22; wheel.add(lip);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    g.rotation.z = (i / 10) * Math.PI * 2;
    const spoke = new THREE.Mesh(s.spokeGeo, s.alloy);
    spoke.rotation.x = -0.28; spoke.position.z = 0.02;
    g.add(spoke); wheel.add(g);
  }
  const hub = new THREE.Mesh(s.hubGeo, s.darkMetal); hub.rotation.x = AX; hub.position.z = -0.02; wheel.add(hub);
  const cap = new THREE.Mesh(s.capGeo, s.alloy); cap.rotation.x = -AX; cap.position.z = 0.16; wheel.add(cap);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const l = new THREE.Mesh(s.lugGeo, s.darkMetal);
    l.rotation.x = AX; l.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0.16);
    wheel.add(l);
  }
  return wheel;
}
