// ============================================================================
// spacescene.js — the login screen's backdrop: REAL 3D (WebGL / Three.js).
// Two procedurally-built alloy wheels, rendered with metallic materials and a
// procedural studio environment (true chrome reflections), each spinning slowly
// on its own axis while tracing a large, slow, tilted elliptical orbit far in
// the distance. They ring the sign-in card and never cross it (the canvas is a
// background layer behind the form, and the orbit radius keeps them peripheral).
//
// PURE DECORATION: pointer-events:none, behind the form. Three.js is lazy-loaded
// from a CDN only on the login screen; if it (or WebGL) is unavailable — offline,
// blocked, reduced-motion — the scene silently falls back to the CSS starfield.
// ============================================================================

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

export function spaceSceneHtml() {
  // Deep-space CSS backdrop (haze + stars + vignette) with the WebGL canvas layered
  // in the middle, so wheels sit in the starfield but under the edge vignette.
  return `<div class="space-scene" aria-hidden="true">
    <div class="space-haze"></div>
    <div class="space-stars"></div>
    <canvas class="space-3d"></canvas>
    <div class="space-vignette"></div>
  </div>`;
}

let _scene = null;   // active instance (so we can tear it down on sign-in / re-render)

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
  catch { return; }                 // offline / blocked → CSS starfield stays
  if (!document.body.contains(canvas)) return;   // login was left while loading

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch { return; }               // no WebGL → CSS starfield stays

  const size = () => ({ w: canvas.clientWidth || innerWidth, h: canvas.clientHeight || innerHeight });
  let { w, h } = size();

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 200);
  camera.position.set(0, 0, 16);

  // --- Studio environment (procedural) → real metallic reflections -------------
  const envTex = makeEnvTexture(THREE);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  // --- Lights ------------------------------------------------------------------
  const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(6, 8, 10);
  const rim = new THREE.DirectionalLight(0xffcaa0, 1.3); rim.position.set(-7, -3, -6);
  const fill = new THREE.DirectionalLight(0xbcd2ff, 1.1); fill.position.set(0, 1, 12);
  scene.add(key, rim, fill, new THREE.AmbientLight(0x46536a, 0.8));

  // --- Two wheels, each on its own orbiter group -------------------------------
  const disposables = [];
  const wheelA = buildWheel(THREE, disposables);
  const wheelB = buildWheel(THREE, disposables);
  wheelA.scale.setScalar(0.66); wheelB.scale.setScalar(0.66);   // small = far away
  wheelA.rotation.set(0.36, -0.62, 0);   // fixed tilt → we see the dish/spokes in 3D
  wheelB.rotation.set(0.28, 0.64, 0);
  const orbiterA = new THREE.Group(); orbiterA.add(wheelA); scene.add(orbiterA);
  const orbiterB = new THREE.Group(); orbiterB.add(wheelB); scene.add(orbiterB);

  const T_ORBIT = 360;   // seconds per full orbit — very slow
  const T_SPIN = 30;     // seconds per own-axis rotation — slow motion
  const ORBIT_Z = -2.0;  // depth of the orbit-plane centre
  const TILT = 0.5;      // orbit-plane tilt → real depth (wheels arc nearer/farther)
  // Size the orbit from the visible frustum so the wheels ring the screen edges and
  // stay clear of the centred form on any aspect. Portrait pushes them just past the
  // narrow side edges, so they read at the top/bottom and never sit over the form.
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

// A vertical studio gradient (bright top "sky", dark ground) + a soft warm
// highlight — equirect-mapped so chrome reflects a believable environment.
function makeEnvTexture(THREE) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, "#e6edf5");
  g.addColorStop(0.40, "#949dab");
  g.addColorStop(0.50, "#39404a");
  g.addColorStop(0.52, "#1e2228");
  g.addColorStop(1.00, "#0a0b0d");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  const soft = ctx.createRadialGradient(150, 58, 8, 150, 58, 150);
  soft.addColorStop(0, "rgba(255,242,224,0.95)");
  soft.addColorStop(1, "rgba(255,242,224,0)");
  ctx.fillStyle = soft; ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural luxury alloy wheel (Group facing +Z): rubber tire (torus) + a lathed
// chrome rim (lip → barrel → dish) + five tapered, beveled spokes + center cap +
// lug bolts. Materials do the premium work via the environment reflections.
function buildWheel(THREE, disposables) {
  const wheel = new THREE.Group();
  const chrome    = new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 1.0, roughness: 0.17 });
  const spokeMat  = new THREE.MeshStandardMaterial({ color: 0xc4c9d0, metalness: 1.0, roughness: 0.22 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x5b616a, metalness: 1.0, roughness: 0.42 });
  const rubber    = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.08, roughness: 0.72 });
  disposables.push(chrome, spokeMat, darkMetal, rubber);

  const add = (geo, mat, cfg = {}) => {
    disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    if (cfg.rx != null) m.rotation.x = cfg.rx;
    if (cfg.rz != null) m.rotation.z = cfg.rz;
    if (cfg.pz != null) m.position.z = cfg.pz;
    if (cfg.p) m.position.set(cfg.p[0], cfg.p[1], cfg.p[2]);
    wheel.add(m);
    return m;
  };

  // Tire
  add(new THREE.TorusGeometry(1.0, 0.32, 24, 100), rubber);

  // Lathed rim (profile: radius,z from hub out to lip to barrel). Lathe revolves
  // around Y, so rotate the mesh to face +Z.
  const P = (r, z) => new THREE.Vector2(r, z);
  const rimGeo = new THREE.LatheGeometry([
    P(0.06, 0.30), P(0.24, 0.30), P(0.26, 0.20),
    P(0.34, 0.12), P(0.66, 0.10),
    P(0.74, 0.18), P(0.82, 0.30),
    P(0.845, 0.22), P(0.83, -0.06), P(0.80, -0.30),
  ], 100);
  add(rimGeo, chrome, { rx: Math.PI / 2 });

  // Spokes: tapered + beveled, radiating from the hub across the dish.
  const shape = new THREE.Shape();
  shape.moveTo(-0.055, 0.24);
  shape.lineTo(-0.10, 0.70);
  shape.quadraticCurveTo(0, 0.77, 0.10, 0.70);
  shape.lineTo(0.055, 0.24);
  shape.quadraticCurveTo(0, 0.19, -0.055, 0.24);
  const spokeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.028, bevelSegments: 2, steps: 1,
  });
  disposables.push(spokeGeo);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(spokeGeo, spokeMat);
    s.rotation.z = (i / 5) * Math.PI * 2;
    s.position.z = 0.11;
    wheel.add(s);
  }

  // Center cap (dome + ring) and lug bolts.
  add(new THREE.SphereGeometry(0.2, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), chrome, { rx: -Math.PI / 2, pz: 0.30 });
  add(new THREE.TorusGeometry(0.2, 0.022, 14, 56), darkMetal, { pz: 0.30 });
  const lugGeo = new THREE.CylinderGeometry(0.03, 0.036, 0.05, 16);
  disposables.push(lugGeo);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const l = new THREE.Mesh(lugGeo, darkMetal);
    l.rotation.x = Math.PI / 2;
    l.position.set(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.31);
    wheel.add(l);
  }

  return wheel;
}
