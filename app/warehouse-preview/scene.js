import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { AREAS } from './model.js';
import { createMaterialTextures, createSurroundingsGeometry, TYRE_VARIANTS, tyreAppearance } from './materials.js';

/* The model uses relative layout units, not surveyed building dimensions. */
const TYRE_HEIGHT = 0.58;
// Floors stack in AREAS order when every area is shown together.
const LEVEL_GAP = 4.4;
const ACCENT = 0xf0c052;

export function createScene(container, callbacks = {}) {
  const { onSelect = () => {}, onLongPress = () => {}, onFloorPick = () => {}, onFloorHover = () => {}, onReady = () => {}, onError = () => {} } = callbacks;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) { onError(error); throw error; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xf0f1ed, 0);
  const canvas = renderer.domElement;
  canvas.className = 'spatial-canvas';
  canvas.setAttribute('aria-label', 'Trodimenzionalni prikaz hotela za gume. Odaberite stupac ili koristite pristupačan popis guma.');
  canvas.setAttribute('role', 'img');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.08, 180);
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

  scene.add(new THREE.HemisphereLight(0xffffff, 0xa7aa9d, 2.7));
  const sun = new THREE.DirectionalLight(0xfff7e8, 3.0);
  sun.position.set(-8, 19, 11);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 15, bottom: -15, near: 1, far: 60 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00035;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xe9efff, 1.2);
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
  let frame = 0;
  let tween = null;
  let movingPointer = null;
  let hasUserCamera = false;
  let activeView = 'perspective';
  let pointerCount = 0;
  let suppressClickUntil = 0;
  let holdTimer = 0;
  let heldPointerId = null;
  let lastTouchTap = null;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const qFront = new THREE.Quaternion();
  const tyreRotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);

  function invalidate() { if (!disposed && !suspended && !frame) frame = requestAnimationFrame(draw); }
  function draw(now) {
    frame = 0;
    if (disposed || suspended) return;
    if (tween) {
      const progress = Math.min(1, (now - tween.started) / tween.duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(tween.fromPosition, tween.toPosition, ease);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease);
      if (progress >= 1) tween = null;
    }
    const changed = controls.update();
    renderer.render(scene, camera);
    if (changed || tween) invalidate();
  }
  function animateCamera(toPosition, toTarget, duration = 680) {
    if (reduceMotion || !duration) {
      camera.position.copy(toPosition); controls.target.copy(toTarget); tween = null;
    } else {
      tween = { fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), toPosition, toTarget, started: performance.now(), duration };
    }
    invalidate();
  }
  controls.addEventListener('change', invalidate);
  const beginOrbit = () => { tween = null; hasUserCamera = true; };
  controls.addEventListener('start', beginOrbit);

  function levelY(id) { return areaId === 'all' ? Math.max(0, AREAS.findIndex((item) => item.id === id)) * LEVEL_GAP : 0; }
  function getArea(id) { return AREAS.find((item) => item.id === id); }
  function visibleStacks() { return state.stacks.filter((stack) => areaId === 'all' || stack.areaId === areaId); }
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
    sprite.position.set(-3, y + .03, 7.72); sprite.scale.set(3.2, .50, 1); parent.add(sprite);
  }
  function clearStatic() {
    staticGroup.clear(); floorMeshes = [];
    for (const resource of dynamicResources) resource.dispose(); dynamicResources.clear();
  }
  function buildArchitecture() {
    clearStatic();
    const areas = areaId === 'all' ? AREAS : AREAS.filter((area) => area.id === areaId);
    for (const area of areas) {
      const group = new THREE.Group(), y = levelY(area.id);
      staticGroup.add(group);
      for (const rect of area.floorRects || []) buildFloor(group, rect, y, Boolean(area.timber), area.id);
      buildStair(group, area.stair, y, false);
      if (areaId === 'all') areaLabel(group, area, y);
    }
  }
  function applyMatrix(mesh, index, xyz, sxyz, quaternion = rotation) {
    position.set(...xyz); scale.set(...sxyz); matrix.compose(position, quaternion, scale); mesh.setMatrixAt(index, matrix);
  }
  let ghostGeometry = null;
  function buildInventory() {
    for (const child of inventoryGroup.children) if (child.isInstancedMesh) child.dispose();
    inventoryGroup.clear(); if (ghostGeometry) { ghostGeometry.dispose(); ghostGeometry = null; }
    const stacks = visibleStacks(), tiresById = new Map((state.tires || []).map((tire) => [tire.id, tire]));
    const occupied = stacks.reduce((sum, stack) => sum + (stack.tireIds || []).filter(Boolean).length, 0);
    const counts = TYRE_VARIANTS.map(() => 0);
    for (const stack of stacks) for (const id of stack.tireIds || []) if (id) counts[tyreAppearance(id).variant]++;
    // Four shared batches keep material diversity bounded, including on phones.
    const tyreBatches = counts.map((count, variant) => {
      const body = new THREE.InstancedMesh(tyreGeometry, rubberMaterials[variant], Math.max(1, count));
      const tread = new THREE.InstancedMesh(treadGeometry, treadMaterials[variant], Math.max(1, count));
      body.count = tread.count = count;
      body.castShadow = true; body.receiveShadow = true; tread.receiveShadow = true;
      inventoryGroup.add(body, tread);
      return { body, tread, index: 0 };
    });
    const beads = new THREE.InstancedMesh(beadGeometry, beadMaterial, Math.max(1, occupied));
    const tags = new THREE.InstancedMesh(plane, tagMaterial, Math.max(1, occupied));
    beads.count = tags.count = occupied;
    inventoryGroup.add(beads, tags);
    pickMesh = new THREE.InstancedMesh(hitGeometry, pickMaterial, Math.max(1, stacks.length));
    pickMesh.count = stacks.length; pickMesh.frustumCulled = false; inventoryGroup.add(pickMesh); pickIndex = [];
    let index = 0; const ghostVertices = [];
    stacks.forEach((stack, stackIndex) => {
      const radius = stack.radius || .27, y = levelY(stack.areaId), step = radius * TYRE_HEIGHT;
      const capacity = Math.max(1, Math.min(40, stack.capacity || 8));
      const stackHeight = capacity * step;
      applyMatrix(pickMesh, stackIndex, [stack.x, y + stackHeight / 2, stack.z], [radius, stackHeight, radius]);
      pickIndex[stackIndex] = stack.id;
      for (let tier = 0; tier < Math.max(capacity, (stack.tireIds || []).length); tier++) {
        const tireId = (stack.tireIds || [])[tier], centerY = y + .014 + (tier + .5) * step;
        if (tireId) {
          const tire = tiresById.get(tireId);
          const appearance = tyreAppearance(tireId), batch = tyreBatches[appearance.variant];
          tyreRotation.setFromAxisAngle(upAxis, appearance.rotation);
          applyMatrix(batch.body, batch.index, [stack.x, centerY, stack.z], [radius, radius, radius], tyreRotation);
          applyMatrix(batch.tread, batch.index, [stack.x, centerY, stack.z], [radius, radius, radius], tyreRotation);
          const color = new THREE.Color().setScalar(appearance.brightness);
          if (tire?.color) { try { color.lerp(new THREE.Color(tire.color), .035); } catch (_) { /* Unknown tint leaves honest rubber. */ } }
          batch.body.setColorAt(batch.index, color); batch.tread.setColorAt(batch.index, color);
          batch.index++;
          applyMatrix(beads, index, [stack.x, centerY + radius * .276, stack.z], [radius, radius, radius]);
          applyMatrix(tags, index, [stack.x + radius * .35, centerY + .003, stack.z + radius * .947], [radius * .45, radius * .245, 1], qFront);
          index++;
        } else {
          appendGhostTyre(ghostVertices, stack.x, centerY, stack.z, radius);
        }
      }
    });
    for (const mesh of [...tyreBatches.flatMap(batch => [batch.body, batch.tread]), beads, tags, pickMesh]) {
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (ghostVertices.length) {
      ghostGeometry = new THREE.BufferGeometry(); ghostGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ghostVertices, 3));
      inventoryGroup.add(new THREE.LineSegments(ghostGeometry, ghostMaterial));
    }
    updateSelection(); invalidate();
  }
  function updateSelection() {
    const stack = state.stacks.find((item) => item.id === selectedId && (areaId === 'all' || item.areaId === areaId));
    selectionRing.visible = !!stack;
    selectionMarker.visible = !!stack;
    if (stack) {
      selectionRing.position.set(stack.x, levelY(stack.areaId) + .014, stack.z);
      selectionRing.scale.setScalar((stack.radius || .27) * 1.23);
      const hasTyres = (stack.tireIds || []).some(Boolean);
      markerMaterial.map = markerTextures[hasTyres ? 0 : 1];
      selectionMarker.position.set(stack.x, levelY(stack.areaId) + .13 + Math.max(1, (stack.tireIds || []).length) * (stack.radius || .27) * TYRE_HEIGHT, stack.z);
      canvas.setAttribute('aria-label', `Trodimenzionalni prikaz hotela za gume. Odabran je stupac ${stack.id}. ${hasTyres ? 'Ovdje su gume.' : 'Mjesto je prazno.'} Pojedinosti su dostupne i na popisu.`);
    } else {
      canvas.setAttribute('aria-label', 'Trodimenzionalni prikaz hotela za gume. Odaberite stupac ili koristite pristupačan popis guma.');
    }
    if (lastTagState === state && lastTagId === stack?.id && lastTagArea === areaId) return;
    lastTagState = state; lastTagId = stack?.id; lastTagArea = areaId;
    selectedTags.clear(); for (const resource of selectedTagResources) resource.dispose(); selectedTagResources.clear();
    if (stack) {
      if (typeof window.qrcode === 'function') {
        const radius = stack.radius || .27;
        (stack.tireIds || []).forEach((id, index) => {
          const tire = (state.tires || []).find((item) => item.id === id); if (!tire) return;
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
            tag.position.set(stack.x + radius * .35, levelY(stack.areaId) + .014 + (index + .5) * radius * TYRE_HEIGHT, stack.z + radius * .961);
            selectedTags.add(tag);
          } catch (_) { /* An UZORAK label remains if QR generation is unavailable. */ }
        });
      }
    }
  }
  function fitCamera(animated = true) {
    const all = areaId === 'all', area = getArea(areaId), platformOnly = false;
    const target = new THREE.Vector3(0, all ? 4.3 : .6, platformOnly ? 2.8 : 0);
    const width = platformOnly ? 6.7 : 12.0, depth = platformOnly ? 8.0 : 16;
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const viewHeight = all ? 22 : Math.max(depth * .79, width / Math.max(.45, camera.aspect));
    const distance = viewHeight / (2 * Math.tan(fov / 2)) * 1.14;
    const direction = activeView === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(.57, .88, 1).normalize();
    animateCamera(target.clone().addScaledVector(direction, distance), target, animated ? 650 : 0);
    controls.maxDistance = Math.max(55, distance * 2.1);
    hasUserCamera = false;
  }
  function pointerRay(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  }
  function floorPoint(event) {
    if (areaId === 'all' || !getArea(areaId)) return null;
    pointerRay(event);
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit) return null;
    return { x: Math.round(hit.x * 1000) / 1000, z: Math.round(hit.z * 1000) / 1000, areaId };
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
    } else lastTouchTap = null;
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
  function contextLost(event) { event.preventDefault(); onError(new Error('3D prikaz je prekinut. Podaci o gumama su sačuvani. Koristite popis ili ponovno otvorite prikaz.')); }
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
  const api = {
    setData(nextState, nextAreaId = areaId || 'all') {
      if (disposed) return;
      if (state === nextState && areaId === nextAreaId) return;
      state = nextState || { stacks: [], tires: [] };
      const changedArea = areaId !== nextAreaId;
      areaId = nextAreaId;
      if (changedArea) { buildArchitecture(); preview.visible = false; }
      buildInventory();
      if (changedArea) fitCamera(false);
    },
    setSelection(id) { selectedId = id; updateSelection(); invalidate(); },
    focusStack(id) {
      const stack = state.stacks.find((item) => item.id === id); if (!stack) return;
      if (areaId !== 'all' && stack.areaId !== areaId) return;
      selectedId = id; updateSelection();
      const target = new THREE.Vector3(stack.x, levelY(stack.areaId) + (stack.radius || .27) * TYRE_HEIGHT * Math.min(stack.capacity || 8, 8) * .42, stack.z);
      const direction = camera.position.clone().sub(controls.target).normalize();
      const distance = Math.max(3.8, 2.3 / Math.max(.65, camera.aspect));
      animateCamera(target.clone().addScaledVector(direction, distance), target); hasUserCamera = true;
    },
    setMode(mode) { currentMode = mode; canvas.style.cursor = mode === 'browse' ? 'grab' : 'crosshair'; if (mode === 'browse') preview.visible = false; invalidate(); },
    setPlacementPreview(value) {
      preview.visible = !!value && areaId !== 'all';
      if (value) { preview.position.set(value.x, levelY(value.areaId || areaId) + .018, value.z); preview.scale.setScalar((value.radius || .27) * 1.07); previewMaterial.color.set(value.valid ? 0x549586 : 0xe95535); previewOutlineMaterial.color.set(value.valid ? 0x328471 : 0xff4e1b); }
      invalidate();
    },
    setView(view) { activeView = view === 'top' ? 'top' : 'perspective'; fitCamera(); },
    zoom(delta) { const factor = delta > 0 ? .78 : 1.28; const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor); offset.clampLength(controls.minDistance, controls.maxDistance); animateCamera(controls.target.clone().add(offset), controls.target.clone(), 260); hasUserCamera = true; },
    reset() { activeView = 'perspective'; fitCamera(); },
    resize,
    pause() { if(disposed)return;suspended=true;controls.enabled=false;cancelHold();cancelAnimationFrame(frame);frame=0;tween=null;movingPointer=null;pointerCount=0; },
    resume() { if(disposed)return;suspended=false;controls.enabled=true;resize();invalidate(); },
    getCanvas() { if (!disposed) { controls.update(); renderer.render(scene, camera); } return canvas; },
    dispose() {
      if (disposed) return; disposed = true; cancelHold(); cancelAnimationFrame(frame); resizeObserver?.disconnect(); window.removeEventListener('resize', resize);
      controls.removeEventListener('change', invalidate); controls.removeEventListener('start', beginOrbit); controls.dispose();
      canvas.removeEventListener('pointerdown', handleDown); canvas.removeEventListener('pointerup', handleUp); canvas.removeEventListener('pointercancel', handleCancel); canvas.removeEventListener('pointermove', handleMove); canvas.removeEventListener('dblclick', handleDouble); canvas.removeEventListener('webglcontextlost', contextLost);
      clearStatic(); for (const child of inventoryGroup.children) if (child.isInstancedMesh) child.dispose(); if (ghostGeometry) ghostGeometry.dispose(); for (const resource of selectedTagResources) resource.dispose(); for (const resource of resources) resource.dispose(); renderer.dispose(); canvas.remove();
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
    ctx.fillStyle = '#35383a'; ctx.font = '600 19px system-ui'; ctx.textAlign = 'center'; ctx.fillText('UZORAK', w / 2, 29);
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
