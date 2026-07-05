// ============================================================================
// spacescene.js — the login screen's backdrop: REAL 3D (WebGL / Three.js).
//
// A deep-space scene: a distant Earth, a starfield, and TWO ultra-high-performance
// wheels — wide, low-profile glossy tires (asymmetric tread) on polished concave
// forged alloys — each spinning slowly on its own axis while tracing a large, slow,
// tilted elliptical orbit far in the distance around (never across) the sign-in card.
// A bright key light at a steep angle (invisible itself) rakes across the polished
// alloy so it flashes and reflects as it turns.
//
// PURE DECORATION: pointer-events:none, behind the form. Three.js is lazy-loaded
// from a CDN only on the login screen; if it (or WebGL) is unavailable — offline,
// blocked, reduced-motion — the scene silently falls back to the CSS starfield.
// ============================================================================

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

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

  let THREE;
  try { THREE = await import(THREE_URL); }
  catch { return; }
  if (!document.body.contains(canvas)) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch { return; }

  const size = () => ({ w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
  let { w, h } = size();
  const mobile = Math.min(w, h) < 620;

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.42;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 400);
  camera.position.set(0, 0, 16);

  const disposables = [];

  // --- Reflection environment: black space + one bright angled "key" the polished
  //     alloy reflects as a sharp streak (the light source is never drawn itself).
  const envTex = makeEnvTexture(THREE);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  // --- Lights: a strong sun-like key from a steep angle + a cool fill + a little ambient.
  const key = new THREE.DirectionalLight(0xfff2dc, 4.4); key.position.set(-7, 9, 6);
  const fill = new THREE.DirectionalLight(0x9fb8ff, 0.5); fill.position.set(8, -2, 5);
  scene.add(key, fill, new THREE.AmbientLight(0x232732, 0.4));

  // --- Starfield + distant Earth (the "space") ---------------------------------
  const stars = buildStars(THREE, disposables, mobile ? 900 : 1700);
  scene.add(stars);
  const earth = buildEarth(THREE, disposables);
  earth.grp.position.set(-6.5, 12.5, -50);
  earth.grp.scale.setScalar(2.7);
  earth.grp.rotation.z = 0.35;
  scene.add(earth.grp);

  // --- Two wheels (shared geometry/materials) ----------------------------------
  const shared = makeWheelParts(THREE, disposables);
  const wheelA = buildWheel(THREE, shared);
  const wheelB = buildWheel(THREE, shared);
  wheelA.scale.setScalar(0.66); wheelB.scale.setScalar(0.66);
  wheelA.rotation.set(0.38, -0.62, 0);   // tilt so the concave dish reads in 3D
  wheelB.rotation.set(0.30, 0.66, 0);
  const orbiterA = new THREE.Group(); orbiterA.add(wheelA); scene.add(orbiterA);
  const orbiterB = new THREE.Group(); orbiterB.add(wheelB); scene.add(orbiterB);

  const T_ORBIT = 360, T_SPIN = 30, ORBIT_Z = -2.0, TILT = 0.5;
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
    earth.earth.rotation.y = t * 0.012;
    renderer.render(scene, camera);
  };
  const loop = () => { _scene.raf = requestAnimationFrame(loop); if (running) render(); };

  const onResize = () => { ({ w, h } = size()); renderer.setSize(w, h, false); recompute(); render(); };
  const onVis = () => { running = document.visibilityState === "visible"; };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVis);

  const dispose = () => {
    renderer.dispose();
    envRT.dispose();
    disposables.forEach((d) => d.dispose && d.dispose());
    scene.environment = null;
  };

  _scene = { raf: 0, onResize, onVis, dispose };
  render();
  _scene.raf = requestAnimationFrame(loop);
}

// ---- Deterministic pseudo-random (stable Earth + stars each load) --------------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- Reflection environment ----------------------------------------------------
function makeEnvTexture(THREE) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0f141d"); g.addColorStop(0.5, "#070a0f"); g.addColorStop(1, "#020304");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  const sun = ctx.createRadialGradient(300, 120, 4, 300, 120, 240);   // the angled key
  sun.addColorStop(0, "rgba(255,251,242,1)");
  sun.addColorStop(0.22, "rgba(255,240,214,0.8)");
  sun.addColorStop(1, "rgba(255,240,214,0)");
  ctx.fillStyle = sun; ctx.fillRect(0, 0, 1024, 512);
  const fill = ctx.createRadialGradient(760, 320, 4, 760, 320, 300);   // cool fill
  fill.addColorStop(0, "rgba(120,150,215,0.18)");
  fill.addColorStop(1, "rgba(120,150,215,0)");
  ctx.fillStyle = fill; ctx.fillRect(0, 0, 1024, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Tire tread (bump map) -----------------------------------------------------
function makeTireBump(THREE) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8a8a8a"; ctx.fillRect(0, 0, 256, 256);
  // circumferential grooves (dark = recessed)
  ctx.fillStyle = "#2a2a2a";
  for (const x of [70, 128, 186]) ctx.fillRect(x - 5, 0, 10, 256);
  // asymmetric shoulder tread blocks (bright = raised)
  ctx.fillStyle = "#d8d8d8";
  for (let y = 0; y < 256; y += 24) {
    ctx.fillRect(6, y + 3, 46, 16);
    ctx.fillRect(204, y + 11, 46, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 1);
  return tex;
}

// ---- Earth texture -------------------------------------------------------------
function makeEarthTexture(THREE) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#0b2f5e"); g.addColorStop(0.5, "#0e4585"); g.addColorStop(1, "#0a2a52");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  const rand = rng(20260705);
  // continents
  for (let i = 0; i < 46; i++) {
    const x = rand() * 1024, y = 60 + rand() * 392, r = 14 + rand() * 60;
    const green = 70 + rand() * 60;
    ctx.fillStyle = `rgb(${40 + rand() * 40},${green},${40 + rand() * 30})`;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = r * (0.6 + rand() * 0.7);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.7;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }
  // clouds
  ctx.globalAlpha = 0.5; ctx.fillStyle = "#eef3fb";
  for (let i = 0; i < 40; i++) {
    const x = rand() * 1024, y = rand() * 512, r = 10 + rand() * 44;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.5, rand() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildEarth(THREE, disposables) {
  const grp = new THREE.Group();
  const tex = makeEarthTexture(THREE);
  const geo = new THREE.SphereGeometry(1, 48, 48);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.0 });
  disposables.push(tex, geo, mat);
  const earth = new THREE.Mesh(geo, mat);
  grp.add(earth);
  const atmGeo = new THREE.SphereGeometry(1.08, 48, 48);
  const atmMat = new THREE.MeshBasicMaterial({ color: 0x5aa6ff, transparent: true, opacity: 0.16, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false });
  disposables.push(atmGeo, atmMat);
  grp.add(new THREE.Mesh(atmGeo, atmMat));
  return { grp, earth };
}

// ---- Starfield -----------------------------------------------------------------
function buildStars(THREE, disposables, count) {
  const pos = new Float32Array(count * 3);
  const rand = rng(424242);
  for (let i = 0; i < count; i++) {
    const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1), r = 70 + rand() * 90;
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false });
  disposables.push(geo, mat);
  return new THREE.Points(geo, mat);
}

// ---- Wheel: shared geometry + materials (built once, reused by both wheels) -----
function makeWheelParts(THREE, disposables) {
  const alloy    = new THREE.MeshStandardMaterial({ color: 0xdadfe6, metalness: 1.0, roughness: 0.13 });   // polished forged
  const lipMat   = new THREE.MeshStandardMaterial({ color: 0xeef1f5, metalness: 1.0, roughness: 0.06 });   // mirror lip
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x4a505a, metalness: 1.0, roughness: 0.5 });   // barrel
  const bump = makeTireBump(THREE);
  const tireMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.0, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.35, bumpMap: bump, bumpScale: 0.012 });
  disposables.push(alloy, lipMat, darkMetal, tireMat, bump);

  const P = (r, z) => new THREE.Vector2(r, z);
  // Wide, low-profile tire: big rim (bead 0.82), thin sidewall to a wide flat tread.
  const tireGeo = new THREE.LatheGeometry([
    P(0.82, -0.40), P(0.88, -0.39), P(0.95, -0.35), P(0.99, -0.28), P(1.00, -0.18),
    P(1.00, 0.18), P(0.99, 0.28), P(0.95, 0.35), P(0.88, 0.39), P(0.82, 0.40),
  ], 120);
  const barrelGeo = new THREE.CylinderGeometry(0.80, 0.80, 0.66, 80, 1, true);
  const lipGeo = new THREE.TorusGeometry(0.815, 0.05, 20, 100);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.20, 0.16, 40);
  const capGeo = new THREE.SphereGeometry(0.15, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const lugGeo = new THREE.CylinderGeometry(0.028, 0.032, 0.05, 14);

  // A thin, tapered, beveled spoke pointing +Y (radial), extruded in +Z.
  const shape = new THREE.Shape();
  shape.moveTo(-0.038, 0.15);
  shape.lineTo(-0.058, 0.795);
  shape.quadraticCurveTo(0, 0.85, 0.058, 0.795);
  shape.lineTo(0.038, 0.15);
  shape.quadraticCurveTo(0, 0.11, -0.038, 0.15);
  const spokeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.022, bevelSegments: 2, steps: 1 });
  disposables.push(tireGeo, barrelGeo, lipGeo, hubGeo, capGeo, lugGeo, spokeGeo);

  return { alloy, lipMat, darkMetal, tireMat, tireGeo, barrelGeo, lipGeo, hubGeo, capGeo, lugGeo, spokeGeo };
}

function buildWheel(THREE, s) {
  const wheel = new THREE.Group();
  const AX = Math.PI / 2;  // lathe/cylinder parts revolve around Y → face them toward +Z

  const tire = new THREE.Mesh(s.tireGeo, s.tireMat); tire.rotation.x = AX; wheel.add(tire);
  const barrel = new THREE.Mesh(s.barrelGeo, s.darkMetal); barrel.rotation.x = AX; wheel.add(barrel);
  const lip = new THREE.Mesh(s.lipGeo, s.lipMat); lip.position.z = 0.22; wheel.add(lip);

  // 10 concave spokes: each dished (rotation.x) inside a radially-rotated group.
  const N = 10;
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    g.rotation.z = (i / N) * Math.PI * 2;
    const spoke = new THREE.Mesh(s.spokeGeo, s.alloy);
    spoke.rotation.x = -0.28;   // dish toward the hub (concave forged look)
    spoke.position.z = 0.02;
    g.add(spoke);
    wheel.add(g);
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
