import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { AREAS } from './model.js';
import { createBuilding, mapAreaPoint, unmapAreaPoint, getSpaceBounds } from './building.js';
import { createMotion, IDLE_DELAY_MS, NEIGHBOR_OPACITY, travelDuration, resolveFocusedTires } from './motion.js';
import { createStaff } from './staff.js';
import { createMaterialTextures, createSurroundingsGeometry, TYRE_VARIANTS, tyreAppearance } from './materials.js';

/* The model uses relative layout units, not surveyed building dimensions. */
const TYRE_HEIGHT = 0.58;
// Floors stack in AREAS order when every area is shown together.
const LEVEL_GAP = 4.4;
const ACCENT = 0xf0c052;

export function createScene(container, callbacks = {}) {
  const { onSelect = () => {}, onLongPress = () => {}, onFloorPick = () => {}, onFloorHover = () => {}, onReady = () => {}, onRoomSelect = () => {}, onError = () => {} } = callbacks;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) { onError(error); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0xf0f1ed, 0);
  const canvas = renderer.domElement;
  canvas.className = 'spatial-canvas';
  canvas.setAttribute('aria-label', 'Trodimenzionalni prikaz hotela za gume. Odaberite stupac ili koristite pristupačan popis guma.');
  canvas.setAttribute('role', 'img');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.08, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.095;
  controls.minDistance = 1.1;
  controls.maxDistance = 85;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.minPolarAngle = 0.02;
  controls.screenSpacePanning = true;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.65;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  const world = new THREE.Group();
  scene.add(world);
  const staticGroup = new THREE.Group();
  const inventoryGroup = new THREE.Group();
  const overlayGroup = new THREE.Group();
  world.add(staticGroup, inventoryGroup, overlayGroup);

  const sky = new THREE.HemisphereLight(0xc0cde9, 0x44404a, 2.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffd6b0, 2.6);
  sun.position.set(-24, 32, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 1, far: 100 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00035;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xb2c5ff, 1.45);
  fill.position.set(10, 10, -10);
  scene.add(fill);

  const resources = new Set();
  const keep = (value) => { resources.add(value); return value; };
  const dynamicResources = new Set();
  const temporary = (value) => { dynamicResources.add(value); return value; };
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  const circle = keep(new THREE.CircleGeometry(1, 48));
  const ring = keep(new THREE.RingGeometry(0.95, 1.0, 56));
  const hitGeometry = keep(new THREE.CylinderGeometry(1, 1, 1, 12));
  const rubberProfile = [
    [.52, -.17], [.54, -.235], [.64, -.275], [.80, -.28], [.93, -.225], [.987, -.145],
    [1, -.095], [1, .095], [.987, .145], [.93, .225], [.80, .28], [.64, .275],
    [.54, .235], [.52, .17], [.505, .10], [.505, -.10], [.52, -.17],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const tyreGeometry = keep(new THREE.LatheGeometry(rubberProfile, 40));
  // The tread is a hollow cylindrical band; the sidewall retains its real hole.
  const treadGeometry = keep(new THREE.CylinderGeometry(1.003, 1.003, .205, 48, 1, true));
  const beadGeometry = keep(new THREE.TorusGeometry(.59, .014, 4, 40));
  beadGeometry.rotateX(Math.PI / 2);

  const surfaces = createMaterialTextures();
  for (const bundle of [...Object.values(surfaces).filter(value => !Array.isArray(value)), ...surfaces.treads]) {
    for (const texture of Object.values(bundle)) keep(texture);
  }
  const tagTexture = keep(makeTagTexture());
  const rubberMaterials = TYRE_VARIANTS.map(variant => keep(new THREE.MeshStandardMaterial({ ...surfaces.rubber, color: variant.color, roughness: variant.roughness, bumpScale: .008, metalness: 0 })));
  const treadMaterials = TYRE_VARIANTS.map((variant, index) => keep(new THREE.MeshStandardMaterial({ ...surfaces.treads[index], color: variant.color, roughness: variant.treadRoughness, bumpScale: variant.bumpScale, metalness: 0 })));
  const beadMaterial = keep(new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: .73 }));
  const floorEdgeMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.wood, color: 0xbaaa91, roughness: 1, bumpScale: .023 }));
  const concreteEdgeMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.concrete, color: 0xc5c7bd, roughness: 1, bumpScale: .022 }));
  const woodFloorMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.wood, color: 0xf0e3cb, roughness: 1, bumpScale: .025 }));
  const concreteFloorMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.concrete, color: 0xf1f0e8, roughness: 1, bumpScale: .018 }));
  const surroundingsMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.concrete, color: 0xaaa99c, roughness: 1, bumpScale: .035 }));
  const wallMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.stone, color: 0xeae5d6, roughness: 1, bumpScale: .045 }));
  const stairMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.metal, color: 0xb5c0ba, roughness: 1, metalness: 1, bumpScale: .008 }));
  const roofMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.roof, color: 0xe4d4b9, roughness: 1, bumpScale: .035, side: THREE.DoubleSide }));
  const roofEdgeMaterial = keep(new THREE.MeshStandardMaterial({ ...surfaces.wood, color: 0x8a7356, roughness: 1, bumpScale: .021 }));
  for (const [material, tileSize] of [[floorEdgeMaterial, 2.8], [concreteEdgeMaterial, 2.8], [wallMaterial, 1.8], [stairMaterial, .8], [roofEdgeMaterial, 2.8]]) material.userData.tileSize = tileSize;
  const tagMaterial = keep(new THREE.MeshBasicMaterial({ map: tagTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const ghostMaterial = keep(new THREE.LineBasicMaterial({ color: 0xa9c5c9, transparent: true, opacity: .28, depthWrite: false }));
  const pickMaterial = keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  const selectionMaterial = keep(new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: .86, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const selectionRing = new THREE.Mesh(ring, selectionMaterial);
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.visible = false;
  overlayGroup.add(selectionRing);
  const markerTextures = [keep(makeSelectionTexture('Ovdje su')), keep(makeSelectionTexture('Prazno mjesto'))];
  const markerMaterial = keep(new THREE.SpriteMaterial({ map: markerTextures[0], transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }));
  const selectionMarker = new THREE.Sprite(markerMaterial);
  selectionMarker.center.set(.5, 0); selectionMarker.renderOrder = 20; selectionMarker.visible = false;
  overlayGroup.add(selectionMarker);
  const selectedTags = new THREE.Group();
  overlayGroup.add(selectedTags);
  const selectedTagResources = new Set();
  const previewMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x549586, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }));
  const preview = new THREE.Group();
  const previewDisk = new THREE.Mesh(circle, previewMaterial);
  previewDisk.rotation.x = -Math.PI / 2;
  preview.add(previewDisk);
  const previewOutlineMaterial = keep(new THREE.MeshBasicMaterial({ color: 0x328471, transparent: true, opacity: .85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const previewOutline = new THREE.Mesh(ring, previewOutlineMaterial);
  previewOutline.rotation.x = -Math.PI / 2;
  previewOutline.position.y = .004;
  preview.add(previewOutline);
  preview.visible = false;
  overlayGroup.add(preview);

  let state = { stacks: [], tires: [] };
  let areaId = null;
  let selectedId = null;
  let lastTagState = null;
  let lastTagId = null;
  let lastTagArea = null;
  let pickMesh = null;
  let pickIndex = [];
  let floorMeshes = [];
  let currentMode = 'browse';
  let disposed = false;
  let suspended = false;
  let frame = 0, lastRenderAt = 0, renderedFrames = 0;
  let building = null, buildingEnabled = false, buildingBindings = {}, cutaway = 'open', buildingViewOverride = null;
  let focusedTireIds = new Set(), focusSpec = null, placementIssues = [], placements = new Map();
  let activityBlocked = false, ambientEnabled = true, staffEnabled = false, idleTimer = 0;
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduceMotion = !!motionQuery?.matches;
  const motion = createMotion({ now: performance.now(), reducedMotion: reduceMotion });
  let staff = null;
  let inventoryStats = { visibleTireCount: 0, focusedTireCount: 0, mutedTireCount: 0 };
  const edgeFocus = document.createElement('div');
  edgeFocus.setAttribute('aria-hidden', 'true');
  edgeFocus.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none;backdrop-filter:blur(1.2px);-webkit-backdrop-filter:blur(1.2px);mask-image:radial-gradient(ellipse at center,transparent 55%,#000 100%);-webkit-mask-image:radial-gradient(ellipse at center,transparent 55%,#000 100%);';
  container.appendChild(edgeFocus);
  let movingPointer = null;
  let hasUserCamera = false;
  let activeView = 'perspective';
  let pointerCount = 0;
  let suppressClickUntil = 0;
  let holdTimer = 0;
  let heldPointerId = null;
  let lastTouchTap = null;
  const raycaster = new THREE.Raycaster(), occlusionRay = new THREE.Raycaster();
  const occludedMeshes = new Map(), occlusionMaterials = new Map();
  const pointer = new THREE.Vector2();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const qFront = new THREE.Quaternion();
  const tyreRotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);

  function inputActive() {
    const active = document.activeElement;
    return !!(active?.matches?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open],[role="dialog"][aria-modal="true"]'));
  }
  function autoBlocked() { return activityBlocked || inputActive() || currentMode !== 'browse' || suspended || document.hidden; }
  function invalidate() { if (!disposed && !suspended && !document.hidden && !frame) frame = requestAnimationFrame(draw); }
  function pose(framePose) { if (framePose) { camera.position.fromArray(framePose.position); controls.target.fromArray(framePose.target); } }
  function draw(now) {
    frame = 0;
    if (disposed || suspended || document.hidden) return;
    // Static architecture shadows are cached; ambient animation is capped at 30 fps.
    if (buildingEnabled && !pointerCount && now - lastRenderAt < 32) { invalidate(); return; }
    lastRenderAt = now;
    if (autoBlocked() && ['orbit', 'idle', 'idle-flight'].includes(motion.state.mode)) motion.activity(now);
    pose(motion.sample(now));
    building?.update?.(now / 1000, reduceMotion || !ambientEnabled);
    staff?.update(now / 1000, { enabled: staffEnabled && buildingEnabled && areaId === 'all' && !['upper-review','upper-assembly'].includes(buildingViewOverride), officeVisible: !!building?.rooms.get('office')?.visible && !!building?.upperAssembly?.visible, focused: focusedTireIds.size > 0, reducedMotion: reduceMotion });
    const changed = controls.update();
    updateOcclusion();
    renderer.render(scene, camera);renderedFrames++;
    // Idle waiting uses a timer; an invisible/background scene never owns a RAF.
    if (changed || motion.state.active || (!reduceMotion && buildingEnabled && ambientEnabled && !autoBlocked())) invalidate();
  }
  function animateCamera(toPosition, toTarget, duration = 680, orbitAfter = false, idle = false) {
    if (!!motionQuery?.matches !== reduceMotion) motionPreferenceChanged();
    // Flush OrbitControls damping before an autonomous path takes ownership.
    const damping = controls.enableDamping, heldPosition = camera.position.clone(), heldTarget = controls.target.clone();
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    camera.position.copy(heldPosition); controls.target.copy(heldTarget);
    pose(motion.fly({ position: camera.position.toArray(), target: controls.target.toArray(), toPosition: toPosition.toArray(), toTarget: toTarget.toArray(), time: performance.now(), duration, orbitAfter: orbitAfter && !autoBlocked(), idle }));
    armIdle(); invalidate();
  }
  function armIdle() {
    clearTimeout(idleTimer); idleTimer = 0;
    if (disposed || suspended || document.hidden || reduceMotion || !ambientEnabled || !buildingEnabled) return;
    idleTimer = setTimeout(() => {
      idleTimer = 0;
      if (autoBlocked() || focusedTireIds.size || motion.state.active) { motion.activity(performance.now()); armIdle(); return; }
      if (motion.idleDue(performance.now())) {
        const bounds = building.bounds, target = new THREE.Vector3().fromArray(bounds.min).add(new THREE.Vector3().fromArray(bounds.max)).multiplyScalar(.5);
        const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]);
        animateCamera(target.clone().add(new THREE.Vector3(-.9, .65, .85).normalize().multiplyScalar(span * 1.8)), target, 3200, true, true);
      } else armIdle();
    }, Math.max(50, motion.idleRemaining(performance.now())));
  }
  function userActivity() { if (disposed) return; motion.activity(performance.now()); armIdle(); invalidate(); }
  const activityEvents = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'input', 'focusin'];
  for (const event of activityEvents) document.addEventListener(event, userActivity, { capture: true, passive: true });
  function visibilityChanged() { motion.setGuards({ hidden: document.hidden }, performance.now()); cancelAnimationFrame(frame); frame = 0; armIdle(); if (!document.hidden) invalidate(); }
  function motionPreferenceChanged() { reduceMotion = !!motionQuery?.matches; motion.setGuards({ reducedMotion: reduceMotion }, performance.now()); armIdle(); invalidate(); }
  document.addEventListener('visibilitychange', visibilityChanged);
  motionQuery?.addEventListener?.('change', motionPreferenceChanged);
  controls.addEventListener('change', invalidate);
  const beginOrbit = () => { userActivity(); hasUserCamera = true; };
  controls.addEventListener('start', beginOrbit);

  function areas() { return state.areas || AREAS; }
  function levelY(id) { return areaId === 'all' ? Math.max(0, areas().findIndex((item) => item.id === id)) * LEVEL_GAP : 0; }
  function getArea(id) { return areas().find((item) => item.id === id); }
  function areaOffset(id) {
    if (!buildingEnabled || areaId !== 'all') return 0;
    const unbound = areas().filter(area => !buildingBindings[area.id]);
    return 30 + unbound.findIndex(area => area.id === id) * 28;
  }
  function placePoint(id, x, z, radius = 0) {
    if (buildingEnabled && buildingBindings[id]) return mapAreaPoint(buildingBindings[id], getArea(id), x, z, radius);
    return { x: x + areaOffset(id), y: levelY(id), z, radiusScale: 1 };
  }
  function visibleStacks() { return state.stacks.filter((stack) => (areaId === 'all' || stack.areaId === areaId) && placements.has(stack.id)); }
  function updatePlacements() {
    placementIssues = []; placements = new Map();
    for (const stack of state.stacks || []) {
      const point = placePoint(stack.areaId, stack.x, stack.z, stack.radius || .27);
      if (point) placements.set(stack.id, point);
      else placementIssues.push({ stackId: stack.id, areaId: stack.areaId, spaceId: buildingBindings[stack.areaId], tireCount: (stack.tireIds || []).filter(Boolean).length, reason: 'outside-building-floor' });
    }
  }
  function makeBox(parent, dimensions, at, material, casts = false) {
    let geometry = unitBox;
    if (material.userData.tileSize) {
      // Scale texture coordinates only; the known wall/step dimensions stay exact.
      geometry = temporary(unitBox.clone());
      const uv = geometry.attributes.uv, tile = material.userData.tileSize;
      for (let face = 0; face < 6; face++) {
        const width = face < 2 ? dimensions[2] : dimensions[0];
        const height = face === 2 || face === 3 ? dimensions[2] : dimensions[1];
        for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * width / tile, uv.getY(i) * height / tile);
      }
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...dimensions); mesh.position.set(...at); mesh.castShadow = casts; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function buildFloor(parent, rect, y, timber, id) {
    makeBox(parent, [rect.w, .16, rect.d], [rect.x, y - .08, rect.z], timber ? floorEdgeMaterial : concreteEdgeMaterial);
    const geometry = temporary(plane.clone()), uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * rect.w + rect.x - rect.w / 2) / 2.8, (uv.getY(i) * rect.d + rect.z - rect.d / 2) / 2.8);
    // All floor pieces reuse one texture set; openings remain actual empty space.
    const top = new THREE.Mesh(geometry, timber ? woodFloorMaterial : concreteFloorMaterial);
    top.rotation.x = -Math.PI / 2; top.scale.set(rect.w, rect.d, 1); top.position.set(rect.x, y + .002, rect.z); top.receiveShadow = true;
    top.userData.areaId = id; top.userData.isFloor = true; parent.add(top); floorMeshes.push(top);
  }
  function buildStair(parent, stair, y, attic) {
    if (!stair) return;
    const steps = 15, rise = 2.65, treadDepth = stair.d / steps;
    // At the north end the attic flight meets the solid northern deck exactly.
    for (let index = 0; index < steps; index++) {
      const t = index / (steps - 1);
      const height = (1 - t) * rise;
      const stepY = attic ? y - rise + height : y + height;
      makeBox(parent, [stair.w, .065, treadDepth + .025], [stair.x, stepY - .035, stair.z - stair.d / 2 + treadDepth / 2 + index * treadDepth], stairMaterial, true);
    }
    // Open flight only: no invented parapet, enclosure, or landing in a void.
    const start = new THREE.Vector3(stair.x - stair.w * .41, attic ? y : y + rise, stair.z - stair.d / 2);
    const end = new THREE.Vector3(start.x, attic ? y - rise : y, stair.z + stair.d / 2);
    for (const x of [stair.x - stair.w * .41, stair.x + stair.w * .41]) {
      start.x = end.x = x;
      const beam = new THREE.Mesh(unitBox, stairMaterial);
      beam.position.copy(start).add(end).multiplyScalar(.5); beam.position.y -= .08;
      beam.scale.set(.05, start.distanceTo(end), .08);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
      parent.add(beam);
    }
  }
  function areaLabel(parent, area, y) {
    const texture = temporary(makeLabelTexture(`${area.id}  ${area.name || ''}`));
    const material = temporary(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    const sprite = new THREE.Sprite(material);
    sprite.position.set(-(area.width ? Math.min(area.width / 2, 3) : 3), y + .03, area.depth ? area.depth / 2 + .4 : 7.72); sprite.scale.set(3.2, .50, 1); parent.add(sprite);
  }
  function clearStatic() {
    staticGroup.clear(); floorMeshes = [];
    for (const resource of dynamicResources) resource.dispose(); dynamicResources.clear();
  }
  function buildArchitecture() {
    restoreOcclusion();clearStatic();
    if (buildingEnabled && !building) {
      building = createBuilding(THREE, { surfaces, logoUrl: window.ASCBrand?.logoURL || new URL('../assets/logo.png', import.meta.url).href, onChange: invalidate });
      world.add(building.root);
      staff = createStaff(THREE, { buildingRoot: building.root, reducedMotion: reduceMotion });
      world.add(staff.root);
    }
    if (building) {
      building.setView(buildingViewOverride || (areaId === 'all' ? 'all' : buildingBindings[areaId] || 'all'));
      building.root.visible = buildingEnabled && (areaId === 'all' || !!buildingBindings[areaId]);
      building.setCutaway(cutaway);
      if (building.root.visible) floorMeshes.push(...building.floorMeshes);
    }
    const shown = areaId === 'all' ? areas() : areas().filter(area => area.id === areaId);
    for (const area of shown) {
      if (buildingEnabled && buildingBindings[area.id]) continue;
      const group = new THREE.Group(), y = levelY(area.id);
      group.position.x = areaOffset(area.id); staticGroup.add(group);
      for (const rect of area.floorRects || []) buildFloor(group, rect, y, Boolean(area.timber), area.id);
      buildStair(group, area.stair, y, false);
      if (areaId === 'all') areaLabel(group, area, y);
    }
    // Prepare bounded occlusion materials once when geometry is built, never in a camera frame.
    for(const root of [building?.root,staticGroup])root?.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material.opacity>0)occlusionMaterial(material);});
    updatePlacements();
    renderer.shadowMap.needsUpdate = true;
    scene.background = buildingEnabled ? new THREE.Color(0x151a27) : null;
    armIdle();
  }
  function applyMatrix(mesh, index, xyz, sxyz, quaternion = rotation) {
    position.set(...xyz); scale.set(...sxyz); matrix.compose(position, quaternion, scale); mesh.setMatrixAt(index, matrix);
  }
  const mutedRubber = rubberMaterials.map(material => keep(material.clone()));
  const mutedTreads = treadMaterials.map(material => keep(material.clone()));
  const mutedBead = keep(beadMaterial.clone()), mutedTag = keep(tagMaterial.clone());
  for (const material of [...mutedRubber, ...mutedTreads, mutedBead, mutedTag]) { material.transparent = true; material.opacity = NEIGHBOR_OPACITY; material.depthWrite = false; }
  const glassMaterial = keep(new THREE.MeshPhysicalMaterial({ color: 0x54ed9d, emissive: 0x195c37, emissiveIntensity: .35, transparent: true, opacity: .31, roughness: .15, metalness: .08, clearcoat: 1, clearcoatRoughness: .12, depthWrite: false }));
  let ghostGeometry = null;
  function buildInventory() {
    for (const child of inventoryGroup.children) if (child.isInstancedMesh) child.dispose();
    inventoryGroup.clear(); if (ghostGeometry) { ghostGeometry.dispose(); ghostGeometry = null; }
    updatePlacements();
    const stacks = visibleStacks(), tiresById = new Map((state.tires || []).map(tire => [tire.id, tire]));
    const focusedPoints = stacks.filter(stack => stack.tireIds?.some(id => focusedTireIds.has(id))).map(stack => placements.get(stack.id));
    const mutedStack = stack => { const p = placements.get(stack.id); return focusedPoints.some(q => Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z) < 6); };
    const entries = [], ghostVertices = [];
    for (const stack of stacks) {
      const p = placements.get(stack.id), radius = (stack.radius || .27) * p.radiusScale, capacity = Math.max(1, Math.min(40, stack.capacity || 8));
      for (let tier = 0; tier < Math.max(capacity, stack.tireIds?.length || 0); tier++) {
        const id = stack.tireIds?.[tier], y = p.y + .014 + (tier+.5)*radius*TYRE_HEIGHT;
        if (id && tiresById.has(id)) entries.push({ id, tire: tiresById.get(id), p, radius, y, muted: mutedStack(stack) && !focusedTireIds.has(id), focused: focusedTireIds.has(id), appearance: tyreAppearance(id) });
        else if (!id) appendGhostTyre(ghostVertices,p.x,y,p.z,radius);
      }
    }
    const meshes = [];
    function batch(geometry, material, count) { const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1,count)); mesh.count=count; inventoryGroup.add(mesh); meshes.push(mesh); return mesh; }
    for (const muted of [false,true]) for (let variant=0;variant<TYRE_VARIANTS.length;variant++) {
      const items = entries.filter(entry => entry.muted===muted && entry.appearance.variant===variant);
      if (!items.length) continue;
      const body=batch(tyreGeometry,(muted?mutedRubber:rubberMaterials)[variant],items.length), tread=batch(treadGeometry,(muted?mutedTreads:treadMaterials)[variant],items.length);
      body.castShadow=!muted; body.receiveShadow=tread.receiveShadow=true;
      items.forEach((entry,index)=>{const {p,radius,y,appearance}=entry;tyreRotation.setFromAxisAngle(upAxis,appearance.rotation);for(const mesh of [body,tread]){applyMatrix(mesh,index,[p.x,y,p.z],[radius,radius,radius],tyreRotation);mesh.setColorAt(index,new THREE.Color().setScalar(appearance.brightness));}});
    }
    for (const muted of [false,true]) {
      const items=entries.filter(entry=>entry.muted===muted);if(!items.length)continue;
      const beads=batch(beadGeometry,muted?mutedBead:beadMaterial,items.length), tags=batch(plane,muted?mutedTag:tagMaterial,items.length);
      items.forEach(({p,radius,y},index)=>{applyMatrix(beads,index,[p.x,y+radius*.276,p.z],[radius,radius,radius]);applyMatrix(tags,index,[p.x+radius*.35,y+.003,p.z+radius*.947],[radius*.45,radius*.245,1],qFront);});
    }
    const selected=entries.filter(entry=>entry.focused);
    inventoryStats = { visibleTireCount: entries.length, focusedTireCount: selected.length, mutedTireCount: entries.filter(entry=>entry.muted).length };
    if(selected.length){const glass=batch(tyreGeometry,glassMaterial,selected.length);glass.renderOrder=5;selected.forEach(({p,radius,y},index)=>applyMatrix(glass,index,[p.x,y,p.z],[radius*1.024,radius*1.04,radius*1.024]));}
    pickMesh=batch(hitGeometry,pickMaterial,stacks.length);pickMesh.frustumCulled=false;pickIndex=[];
    stacks.forEach((stack,index)=>{const p=placements.get(stack.id),radius=(stack.radius||.27)*p.radiusScale,height=Math.max(stack.capacity||8,stack.tireIds?.length||0)*radius*TYRE_HEIGHT;applyMatrix(pickMesh,index,[p.x,p.y+height/2,p.z],[radius,height,radius]);pickIndex[index]=stack.id;});
    for(const mesh of meshes){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    if(ghostVertices.length){ghostGeometry=new THREE.BufferGeometry();ghostGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ghostVertices,3));inventoryGroup.add(new THREE.LineSegments(ghostGeometry,ghostMaterial));}
    edgeFocus.style.display=selected.length && !window.matchMedia?.('(pointer: coarse)').matches ? 'block':'none';
    renderer.shadowMap.needsUpdate = true;
    lastTagState=null;updateSelection();invalidate();
  }
  function updateSelection() {
    const stack = visibleStacks().find(item => item.id === selectedId);
    const placed = stack && placements.get(stack.id), radius = stack ? (stack.radius || .27) * placed.radiusScale : .27;
    selectionRing.visible = !!stack;
    selectionMarker.visible = !!stack;
    if (stack) {
      selectionRing.position.set(placed.x, placed.y + .014, placed.z);
      selectionRing.scale.setScalar(radius * 1.23);
      const hasTyres = (stack.tireIds || []).some(Boolean);
      markerMaterial.map = markerTextures[hasTyres ? 0 : 1];
      selectionMarker.position.set(placed.x, placed.y + .13 + Math.max(1, (stack.tireIds || []).length) * radius * TYRE_HEIGHT, placed.z);
      canvas.setAttribute('aria-label', `Trodimenzionalni prikaz hotela za gume. Odabran je stupac ${stack.id}. ${hasTyres ? 'Ovdje su gume.' : 'Mjesto je prazno.'} Pojedinosti su dostupne i na popisu.`);
    } else {
      canvas.setAttribute('aria-label', 'Trodimenzionalni prikaz hotela za gume. Odaberite stupac ili koristite pristupačan popis guma.');
    }
    if (lastTagState === state && lastTagId === stack?.id && lastTagArea === areaId) return;
    lastTagState = state; lastTagId = stack?.id; lastTagArea = areaId;
    selectedTags.clear(); for (const resource of selectedTagResources) resource.dispose(); selectedTagResources.clear();
    if (stack) {
      if (typeof window.qrcode === 'function') {
        (stack.tireIds || []).forEach((id, index) => {
          const tire = (state.tires || []).find((item) => item.id === id); if (!tire || !tire.code || (focusedTireIds.size && !focusedTireIds.has(id))) return;
          try {
            const qr = window.qrcode(0, 'M');
            qr.addData(`${location.origin}${location.pathname}#tyre=${encodeURIComponent(tire.code)}`); qr.make();
            const cells = qr.getModuleCount();
            const texture = canvasTexture((cells + 8) * 6, (cells + 8) * 6, (ctx, width, height) => {
              ctx.fillStyle = '#fffef7'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = '#151719';
              for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) if (qr.isDark(row, col)) ctx.fillRect((col + 4) * 6, (row + 4) * 6, 6, 6);
            }, false);
            texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.NearestFilter;
            const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
            selectedTagResources.add(texture); selectedTagResources.add(material);
            const tag = new THREE.Mesh(plane, material);
            tag.scale.setScalar(radius * .48);
            tag.position.set(placed.x + radius * .35, placed.y + .014 + (index + .5) * radius * TYRE_HEIGHT, placed.z + radius * .961);
            selectedTags.add(tag);
          } catch (_) { /* The neutral ASC label remains if QR generation is unavailable. */ }
        });
      }
    }
  }
  function occlusionMaterial(material) {
    let result=occlusionMaterials.get(material);
    if(!result){result=keep(material.clone());result.transparent=true;result.opacity=.055;result.depthWrite=false;result.onBeforeCompile=material.onBeforeCompile;result.customProgramCacheKey=material.customProgramCacheKey;occlusionMaterials.set(material,result);}
    return result;
  }
  function restoreOcclusion() {
    for(const [mesh,material] of occludedMeshes) mesh.material=material;
    occludedMeshes.clear();
  }
  function updateOcclusion() {
    restoreOcclusion();
    if(!focusedTireIds.size)return;
    const distance=camera.position.distanceTo(controls.target);if(distance<.15)return;
    occlusionRay.set(camera.position,controls.target.clone().sub(camera.position).normalize());
    occlusionRay.near=.01;occlusionRay.far=Math.max(.02,distance-.08);
    const candidates=[];
    for(const root of [building?.root,staticGroup]) if(root?.visible) root.traverseVisible(object=>{if(object.isMesh && (Array.isArray(object.material)?object.material:[object.material]).some(material=>material.visible && material.opacity>.08)) candidates.push(object);});
    const hits=occlusionRay.intersectObjects(candidates,false);
    for(const {object} of hits){
      if(occludedMeshes.has(object))continue;
      const original=object.material;
      occludedMeshes.set(object,original);object.material=Array.isArray(original)?original.map(occlusionMaterial):occlusionMaterial(original);
    }
  }
  function fitCamera(animated = true) {
    const all = areaId === 'all', area = getArea(areaId);
    let bounds = buildingEnabled && (all || buildingBindings[areaId]) ? (all ? building?.bounds : getSpaceBounds(buildingBindings[areaId])) : null;
    if(buildingEnabled && buildingViewOverride && building){const object=['upper-review','upper-assembly'].includes(buildingViewOverride)?building.upperAssembly:building.rooms.get(buildingViewOverride);if(object){building.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(object);if(!box.isEmpty())bounds={min:box.min.toArray(),max:box.max.toArray()};}}
    if(bounds && all && !buildingViewOverride){bounds={min:[...bounds.min],max:[...bounds.max]};for(const item of areas().filter(item=>!buildingBindings[item.id])){const x=areaOffset(item.id),w=item.width||12,d=item.depth||16,y=levelY(item.id);bounds.min[0]=Math.min(bounds.min[0],x-w/2);bounds.max[0]=Math.max(bounds.max[0],x+w/2);bounds.min[2]=Math.min(bounds.min[2],-d/2);bounds.max[2]=Math.max(bounds.max[2],d/2);bounds.max[1]=Math.max(bounds.max[1],y+3);}}
    const target = bounds ? new THREE.Vector3().fromArray(bounds.min).add(new THREE.Vector3().fromArray(bounds.max)).multiplyScalar(.5) : new THREE.Vector3(0, all ? 4.3 : .6, 0);
    const width = bounds ? bounds.max[0]-bounds.min[0] : area?.width || 12, depth = bounds ? bounds.max[2]-bounds.min[2] : area?.depth || 16;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const viewHeight = Math.max(depth*.85, width/Math.max(.45,camera.aspect), bounds ? (bounds.max[1]-bounds.min[1])*1.2 : all?22:0);
    const distance = viewHeight/(2*Math.tan(fov/2))*1.22;
    const direction = activeView==='top'?new THREE.Vector3(0,1,.001):new THREE.Vector3(-.7,.9,1).normalize();
    animateCamera(target.clone().addScaledVector(direction,distance),target,animated?650:0);
    controls.maxDistance=Math.max(55,distance*2.1);hasUserCamera=false;
  }
  function pointerRay(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function floorPoint(event) {
    if (areaId === 'all' || !getArea(areaId)) return null;
    pointerRay(event);
    const spaceId = buildingEnabled && buildingBindings[areaId];
    let point;
    if (spaceId) {
      const hit = raycaster.intersectObjects(floorMeshes.filter(mesh => mesh.userData.spaceId===spaceId),false)[0];
      if(!hit)return null;point=unmapAreaPoint(spaceId,getArea(areaId),hit.point.x,hit.point.z);
    } else {
      const hit=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-levelY(areaId)),new THREE.Vector3());
      if(!hit)return null;point={x:hit.x-areaOffset(areaId),z:hit.z};
    }
    return point ? { x:Math.round(point.x*1000)/1000,z:Math.round(point.z*1000)/1000,areaId } : null;
  }
  function handleDown(event) {
    pointerCount++;
    cancelHold();
    if (pointerCount > 1) { movingPointer = null; lastTouchTap = null; suppressClickUntil = performance.now() + 450; return; }
    movingPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    if (currentMode === 'browse' && (event.pointerType === 'touch' || event.pointerType === 'pen')) {
      const clientX = event.clientX, clientY = event.clientY, pointerId = event.pointerId;
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (disposed || pointerCount !== 1 || movingPointer?.id !== pointerId || currentMode !== 'browse') return;
        pointerRay({ clientX, clientY });
        const hit = pickMesh && raycaster.intersectObject(pickMesh, false)[0];
        if (hit && hit.instanceId !== undefined) {
          heldPointerId = pointerId; lastTouchTap = null;
          onLongPress(pickIndex[hit.instanceId]);
        }
      }, 550);
    }
  }
  function handleUp(event) {
    cancelHold();
    pointerCount = Math.max(0, pointerCount - 1);
    const start = movingPointer; movingPointer = null;
    if (heldPointerId === event.pointerId) { heldPointerId = null; suppressClickUntil = performance.now() + 350; return; }
    if (!start || event.pointerId !== start.id || performance.now() < suppressClickUntil || event.button > 0) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return;
    pointerRay(event);
    if (currentMode !== 'browse') {
      const point = floorPoint(event); if (point) onFloorPick(point); return;
    }
    const hit = pickMesh && raycaster.intersectObject(pickMesh, false)[0];
    if (hit && hit.instanceId !== undefined) {
      const id = pickIndex[hit.instanceId];
      onSelect(id);
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        const now = performance.now();
        if (lastTouchTap && lastTouchTap.id === id && now - lastTouchTap.at < 360 && Math.hypot(event.clientX - lastTouchTap.x, event.clientY - lastTouchTap.y) < 24) {
          lastTouchTap = null; api.focusStack(id);
        } else lastTouchTap = { id, at: now, x: event.clientX, y: event.clientY };
      }
    } else { lastTouchTap = null; const floorHit = raycaster.intersectObjects(floorMeshes.filter(mesh => mesh.parent?.visible), false)[0]; if (floorHit?.object.userData.spaceId) onRoomSelect(floorHit.object.userData.spaceId); }
  }
  function cancelHold() { if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; } }
  function handleCancel() { cancelHold(); pointerCount = Math.max(0, pointerCount - 1); movingPointer = null; heldPointerId = null; lastTouchTap = null; }
  function handleMove(event) {
    if (movingPointer && Math.hypot(event.clientX - movingPointer.x, event.clientY - movingPointer.y) > 7) { cancelHold(); lastTouchTap = null; }
    if (currentMode === 'browse' || event.pointerType === 'touch' || pointerCount) return;
    const point = floorPoint(event); if (point) onFloorHover(point);
  }
  function handleDouble(event) {
    if (currentMode !== 'browse') return;
    pointerRay(event); const hit = pickMesh && raycaster.intersectObject(pickMesh, false)[0];
    if (hit && hit.instanceId !== undefined) api.focusStack(pickIndex[hit.instanceId]);
  }
  function contextLost(event) { event.preventDefault(); api.pause(); onError(new Error('3D prikaz je prekinut. Podaci o gumama su sačuvani. Koristite popis ili ponovno otvorite prikaz.')); }
  canvas.addEventListener('pointerdown', handleDown);
  canvas.addEventListener('pointerup', handleUp);
  canvas.addEventListener('pointercancel', handleCancel);
  canvas.addEventListener('pointermove', handleMove);
  canvas.addEventListener('dblclick', handleDouble);
  canvas.addEventListener('webglcontextlost', contextLost);

  function resize() {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    const oldAspect = camera.aspect;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    const markerUnit = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / height;
    selectionMarker.scale.set(144 * markerUnit, 45 * markerUnit, 1);
    if (!hasUserCamera && areaId && Math.abs(oldAspect - camera.aspect) > .05) fitCamera(false);
    invalidate();
  }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  window.addEventListener('resize', resize);
  function focusPoints(ids, fallbackStackId = null) {
    const targets=[];
    for (const stack of visibleStacks()) {
      const p=placements.get(stack.id),radius=(stack.radius||.27)*p.radiusScale;
      (stack.tireIds||[]).forEach((id,tier)=>{if(ids.has(id))targets.push(new THREE.Vector3(p.x,p.y+.014+(tier+.5)*radius*TYRE_HEIGHT,p.z));});
    }
    if(!targets.length && fallbackStackId){const stack=visibleStacks().find(item=>item.id===fallbackStackId);if(stack){const p=placements.get(stack.id);targets.push(new THREE.Vector3(p.x,p.y+(stack.radius||.27)*p.radiusScale*TYRE_HEIGHT*3,p.z));}}
    if(!targets.length)return false;
    const target=targets.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/targets.length);
    const spread=Math.max(...targets.map(p=>p.distanceTo(target)),.4);
    const direction=camera.position.clone().sub(controls.target);if(direction.lengthSq()<.01)direction.set(-.8,.65,1);direction.normalize();direction.y=Math.max(.18,direction.y);direction.normalize();
    const distance=Math.max(3,2.3/Math.max(.65,camera.aspect),spread*3.8), to=target.clone().addScaledVector(direction,distance);
    animateCamera(to,target,travelDuration(camera.position.distanceTo(to)),true);hasUserCamera=true;return true;
  }
  const api = {
    setData(nextState, nextAreaId = areaId || 'all') {
      if(disposed || (state===nextState && areaId===nextAreaId))return;
      const changedLayout=JSON.stringify(state?.areas||null)!==JSON.stringify(nextState?.areas||null), changedArea=areaId!==nextAreaId;
      state=nextState||{stacks:[],tires:[]};areaId=nextAreaId;
      if(focusSpec)focusedTireIds=resolveFocusedTires(state.tires,focusSpec);
      if(changedArea||changedLayout){if(changedArea)motion.activity(performance.now());buildArchitecture();preview.visible=false;}
      buildInventory();if(changedArea||(changedLayout&&!hasUserCamera))fitCamera(false);
    },
    setBuildingEnabled(value) { const next=!!value;if(next===buildingEnabled)return;buildingEnabled=next;buildArchitecture();buildInventory();fitCamera(false); },
    setBuildingBindings(value={}) { value=value||{};const same=Object.keys(value).length===Object.keys(buildingBindings).length&&Object.keys(value).every(key=>value[key]===buildingBindings[key]);if(same)return;buildingBindings={...value};buildArchitecture();buildInventory();if(!hasUserCamera)fitCamera(false); },
    setBuildingView(value=null) { if(value!==null && !['all','building','exterior','upper-review','upper-assembly'].includes(value) && !getSpaceBounds(value))return false;if(buildingViewOverride===value)return true;buildingViewOverride=value;buildArchitecture();fitCamera(false);return true; },
    setSelection(id) { const changed = selectedId !== id; selectedId=id; if(changed && focusedTireIds.size && !state.stacks.find(stack=>stack.id===id)?.tireIds?.some(tireId=>focusedTireIds.has(tireId))) api.clearFocus();updateSelection();invalidate(); },
    setInventoryFocus(spec={}) { motion.activity(performance.now());focusSpec=spec;focusedTireIds=resolveFocusedTires(state.tires,spec);buildInventory();armIdle();return focusedTireIds.size; },
    focusSet(setId) { api.setInventoryFocus({setId});return focusPoints(focusedTireIds); },
    clearFocus() { restoreOcclusion();focusSpec=null;focusedTireIds=new Set();motion.activity(performance.now());buildInventory();armIdle(); },
    focusStack(id) {
      const stack=visibleStacks().find(item=>item.id===id);if(!stack)return false;
      selectedId=id;updateSelection();
      // Keep an exact customer-set focus when the app subsequently focuses its stack.
      return focusPoints(focusedTireIds.size?focusedTireIds:new Set(stack.tireIds||[]),id);
    },
    setMode(mode) { currentMode=mode;userActivity();canvas.style.cursor=mode==='browse'?'grab':'crosshair';if(mode==='browse')preview.visible=false;invalidate(); },
    setPlacementPreview(value) {
      const p=value&&placePoint(value.areaId||areaId,value.x,value.z,value.radius||.27);preview.visible=!!p&&areaId!=='all';
      if(p){preview.position.set(p.x,p.y+.018,p.z);preview.scale.setScalar((value.radius||.27)*p.radiusScale*1.07);previewMaterial.color.set(value.valid?0x549586:0xe95535);previewOutlineMaterial.color.set(value.valid?0x328471:0xff4e1b);}invalidate();
    },
    setActivityBlocked(value) { activityBlocked=!!value;motion.setGuards({blocked:activityBlocked},performance.now());armIdle();invalidate(); },
    setAmbientEnabled(value) { ambientEnabled=!!value;userActivity(); },
    setStaffEnabled(value) { staffEnabled=!!value;invalidate(); },
    setCutaway(value) { restoreOcclusion();cutaway=['open','shell','closed','review'].includes(value)?value:'open';building?.setCutaway(cutaway);renderer.shadowMap.needsUpdate=true;invalidate(); },
    setViewpoint({position:pos,target}) { if(![pos,target].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))return false;userActivity();animateCamera(new THREE.Vector3(...pos),new THREE.Vector3(...target),0);hasUserCamera=true;return true; },
    getMotionState() { return {...motion.state,focusedTireCount:focusedTireIds.size,buildingEnabled,buildingView:buildingViewOverride,cutaway,staffEnabled,cameraPosition:camera.position.toArray(),cameraTarget:controls.target.toArray()}; },
    getRenderStats() { return {...inventoryStats,disposed,renderedFrames,frameScheduled:!!frame,idleTimerScheduled:!!idleTimer,materialCount:[...resources,...dynamicResources,...selectedTagResources].filter(resource=>resource.isMaterial).length,programCount:renderer.info.programs?.length||0,buildingVisible:!!building?.root.visible,occludedArchitectureCount:occludedMeshes.size,neighborOpacity:mutedRubber[0].opacity,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures}; },
    getPlacementIssues() { return placementIssues.map(issue=>({...issue})); },
    setView(view) { activeView=view==='top'?'top':'perspective';fitCamera(); },
    zoom(delta) { const factor=delta>0?.78:1.28,offset=camera.position.clone().sub(controls.target).multiplyScalar(factor);offset.clampLength(controls.minDistance,controls.maxDistance);animateCamera(controls.target.clone().add(offset),controls.target.clone(),260);hasUserCamera=true; },
    reset() { api.clearFocus();activeView='perspective';fitCamera(); },
    resize,
    pause() { if(disposed)return;suspended=true;controls.enabled=false;cancelHold();clearTimeout(idleTimer);cancelAnimationFrame(frame);frame=0;motion.activity(performance.now());movingPointer=null;pointerCount=0; },
    resume() { if(disposed)return;suspended=false;controls.enabled=true;motion.activity(performance.now());resize();armIdle();invalidate(); },
    getCanvas() { if(!disposed){controls.update();updateOcclusion();renderer.render(scene,camera);renderedFrames++;}return canvas; },
    dispose() {
      if(disposed)return;disposed=true;cancelHold();clearTimeout(idleTimer);idleTimer=0;cancelAnimationFrame(frame);frame=0;resizeObserver?.disconnect();window.removeEventListener('resize',resize);
      for(const event of activityEvents)document.removeEventListener(event,userActivity,true);
      document.removeEventListener('visibilitychange',visibilityChanged);motionQuery?.removeEventListener?.('change',motionPreferenceChanged);
      controls.removeEventListener('change',invalidate);controls.removeEventListener('start',beginOrbit);controls.dispose();
      canvas.removeEventListener('pointerdown',handleDown);canvas.removeEventListener('pointerup',handleUp);canvas.removeEventListener('pointercancel',handleCancel);canvas.removeEventListener('pointermove',handleMove);canvas.removeEventListener('dblclick',handleDouble);canvas.removeEventListener('webglcontextlost',contextLost);
      restoreOcclusion();clearStatic();building?.dispose();staff?.dispose();for(const child of inventoryGroup.children)if(child.isInstancedMesh)child.dispose();if(ghostGeometry)ghostGeometry.dispose();for(const resource of selectedTagResources)resource.dispose();for(const resource of resources)resource.dispose();renderer.dispose();resources.clear();dynamicResources.clear();selectedTagResources.clear();occlusionMaterials.clear();canvas.remove();edgeFocus.remove();
    },
  };
  resize();
  queueMicrotask(() => { if (!disposed) onReady(); });
  return api;
}

function appendGhostTyre(vertices, x, y, z, radius) {
  const segments = 24;
  for (const [r, h] of [[.93, -.20], [.93, .20], [.54, .20]]) {
    for (let index = 0; index < segments; index++) {
      const a = index / segments * Math.PI * 2, b = (index + 1) / segments * Math.PI * 2;
      vertices.push(x + Math.cos(a) * radius * r, y + h * radius, z + Math.sin(a) * radius * r, x + Math.cos(b) * radius * r, y + h * radius, z + Math.sin(b) * radius * r);
    }
  }
  for (let index = 0; index < 4; index++) {
    const a = index / 4 * Math.PI * 2;
    vertices.push(x + Math.cos(a) * radius * .93, y - .20 * radius, z + Math.sin(a) * radius * .93, x + Math.cos(a) * radius * .93, y + .20 * radius, z + Math.sin(a) * radius * .93);
  }
}
function canvasTexture(width, height, draw, repeat = true) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4; return texture;
}
function makeTagTexture() {
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#f4f2e9'; ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = '#35383a'; ctx.font = '600 19px system-ui'; ctx.textAlign = 'center'; ctx.fillText('ASC', w / 2, 29);
    ctx.fillStyle = '#aaa79c'; ctx.fillRect(18, 42, 92, 3); ctx.fillRect(28, 49, 72, 2);
  }, false);
}
function makeLabelTexture(text) {
  return canvasTexture(768, 120, (ctx, w, h) => {
    ctx.fillStyle = 'rgba(247,247,244,.93)'; ctx.beginPath(); ctx.roundRect(0, 5, w, 105, 24); ctx.fill();
    ctx.fillStyle = '#454b48'; ctx.font = '500 45px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2, w - 55);
  }, false);
}

function makeSelectionTexture(text) {
  return canvasTexture(576, 180, (ctx, w, h) => {
    ctx.fillStyle = '#f0c052';
    ctx.beginPath(); ctx.roundRect(8, 8, w - 16, h - 42, 28); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w / 2 - 23, h - 37); ctx.lineTo(w / 2, h - 3); ctx.lineTo(w / 2 + 23, h - 37); ctx.fill();
    ctx.fillStyle = '#262316'; ctx.font = '600 53px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, 80, w - 50);
  }, false);
}
