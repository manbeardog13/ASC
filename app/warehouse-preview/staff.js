// Decorative figures, not employee likenesses, attendance or live positions.
// Their motion is a small local animation; no inventory or backend is involved.
export const STAFF_IS_ILLUSTRATIVE = true;
export const STAFF_PROFILES = Object.freeze([
  Object.freeze({ id: 'marin', name: 'Marin', role: 'Voditelj' }),
  Object.freeze({ id: 'niksa', name: 'Nikša', role: 'Servis' }),
  Object.freeze({ id: 'chris', name: 'Chris', role: 'Servis' }),
  Object.freeze({ id: 'mladenka', name: 'Mladenka', role: 'Ured' }),
  Object.freeze({ id: 'office', name: 'Ured', role: 'Ured' }),
]);

// Relative scene units, not measured routes or records of anyone's whereabouts.
const DEFAULT_PATHS = [
  [[-19.5, 0, -7], [-19.5, 0, -1]],
  [[-20.5, 0, 2], [-20.5, 0, 7]],
  [[-19.5, 0, 10], [-19.5, 0, 16]],
];
const NO_PICK = () => {};
const isPoint = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

// Seat anchors come from the constructed scene, including all room transforms.
// This avoids leaving staff floating when the schematic office is rescaled.
export function officeSeatsFromBuilding(THREE, buildingRoot) {
  if (!buildingRoot?.traverse) return [];
  buildingRoot.updateMatrixWorld(true);
  const seats = [], matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  buildingRoot.traverse(object => {
    if (object.name !== 'Sjedalo' || !object.isMesh || seats.length >= 2) return;
    let parent = object.parent;
    while (parent && parent.userData.spaceId !== 'office') parent = parent.parent;
    if (!parent) return;
    matrix.copy(object.matrixWorld);
    if (object.isInstancedMesh) { object.getMatrixAt(0, instance); matrix.multiply(instance); }
    matrix.decompose(position, rotation, scale);
    const euler = new THREE.Euler().setFromQuaternion(rotation, 'YXZ');
    // The seat centre is .46 above its room floor, irrespective of box thickness.
    const worldSeat = new THREE.Vector3(); object.parent.getWorldPosition(worldSeat);
    seats.push({ position: [position.x, worldSeat.y, position.z], rotation: euler.y + Math.PI });
  });
  return seats;
}

function routeFor(value) {
  const source = Array.isArray(value) ? value : value?.points;
  if (!Array.isArray(source) || source.length < 2 || !source.every(isPoint)) return null;
  // Walking never interpolates through another floor or into an invented stair.
  if (source.some(point => point[1] !== source[0][1])) return null;
  const points = source.map(point => point.slice());
  const segments = [];
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
    if (distance > .001) { segments.push({ from, to, start: length, distance }); length += distance; }
  }
  return length > .001 ? { segments, length } : null;
}

/**
 * createStaff(THREE, { paths?, officePositions?, buildingRoot?, reducedMotion? })
 * paths: at most 3 approved horizontal polylines of [x,y,z] (or {points}).
 * officePositions: at most 2 {position:[x,y,z], rotation:radians} seated figures.
 * Office seats default to anchors in buildingRoot, or none without a building.
 * Pass [] to omit either group. The caller owns aisle/furniture clearance.
 * update(timeInSeconds, enabled | {enabled, focused, reducedMotion, officeVisible}) returns
 * whether visible animation needs another frame. No timers are created here.
 */
export function createStaff(THREE, options = {}) {
  const root = new THREE.Group();
  root.name = 'illustrative-staff';
  root.visible = false;
  root.userData = { illustrative: true, livePresence: false, decorative: true };
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 10));
  const sphere = own(new THREE.SphereGeometry(1, 10, 8));
  const box = own(new THREE.BoxGeometry(1, 1, 1));
  const material = color => own(new THREE.MeshStandardMaterial({ color, roughness: .88 }));
  // Shared neutral workwear; these variations are not an assertion of appearance.
  const skin = material(0xc9a78c), hair = material(0x37302a), boots = material(0x252b30);
  const trousers = material(0x343d45), seam = material(0xa8afb1);
  const shirts = [material(0x52616b), material(0x3c4d58), material(0x665a4c), material(0x666b70), material(0x58676a)];
  const figures = [];
  let officeRoot = null;
  options.buildingRoot?.traverse(object => {
    if (object.isGroup && object.userData.spaceId === 'office') officeRoot = object;
  });
  let disposed = false, lastTime = null, animationTime = 0;

  function part(parent, geometry, dimensions, position, surface) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.scale.set(...dimensions);
    mesh.position.set(...position);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = NO_PICK;
    mesh.userData = { illustrative: true, decorative: true };
    parent.add(mesh);
    return mesh;
  }

  function person(profileIndex, seated) {
    const node = new THREE.Group();
    const profile = STAFF_PROFILES[profileIndex];
    node.name = `illustrative-${profile.id}`;
    node.userData = { ...profile, illustrative: true, livePresence: false, decorative: true, pose: seated ? 'seated' : 'walking' };
    const body = new THREE.Group();
    node.add(body);
    const offset = seated ? -.38 : 0;
    const shirt = shirts[profileIndex];
    part(body, sphere, [.235, .29, .135], [0, 1.18 + offset, 0], shirt);
    part(body, box, [.32, .17, .23], [0, .9 + offset, 0], trousers);
    part(body, cylinder, [.065, .10, .065], [0, 1.49 + offset, 0], skin);
    part(body, sphere, [.135, .17, .13], [0, 1.68 + offset, 0], skin);
    part(body, sphere, [.14, .09, .135], [0, 1.78 + offset, -.012], hair);
    part(body, box, [.012, .39, .018], [0, 1.18 + offset, .135], seam);
    part(body, box, [.10, .10, .018], [.115, 1.28 + offset, .12], shirt);
    const arms = [], legs = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(side * .255, 1.38 + offset, 0); body.add(arm);
      part(arm, cylinder, [.065, .30, .065], [0, -.15, 0], shirt);
      const forearm = new THREE.Group(); forearm.position.y = -.30; arm.add(forearm);
      part(forearm, cylinder, [.054, .25, .054], [0, -.125, 0], skin);
      part(forearm, sphere, [.058, .068, .045], [0, -.28, 0], skin);
      arm.rotation.x = seated ? -.62 : 0;
      forearm.rotation.x = seated ? -.65 : -.12;
      arms.push(arm);
      const leg = new THREE.Group(); leg.position.set(side * .105, .85 + offset, 0); body.add(leg);
      part(leg, cylinder, [.083, .38, .083], [0, -.19, 0], trousers);
      const shin = new THREE.Group(); shin.position.y = -.38; leg.add(shin);
      part(shin, cylinder, [.071, .36, .071], [0, -.18, 0], trousers);
      part(shin, box, [.15, .10, .25], [0, -.40, .055], boots);
      leg.rotation.x = seated ? -Math.PI / 2 : 0;
      shin.rotation.x = seated ? Math.PI / 2 : 0;
      legs.push(leg);
    }
    root.add(node);
    return { node, body, arms, legs, seated, phase: profileIndex * 1.7 };
  }

  const paths = Array.isArray(options.paths) ? options.paths : DEFAULT_PATHS;
  paths.slice(0, 3).forEach((path, index) => {
    const route = routeFor(path);
    if (!route) return;
    const figure = person(index, false);
    figure.route = route;
    figure.node.position.set(...route.segments[0].from);
    figures.push(figure);
  });
  const seats = Array.isArray(options.officePositions) ? options.officePositions : officeSeatsFromBuilding(THREE, options.buildingRoot);
  seats.slice(0, 2).forEach((seat, index) => {
    if (!isPoint(seat?.position) || (seat.rotation !== undefined && !Number.isFinite(seat.rotation))) return;
    const figure = person(index + 3, true);
    figure.node.position.set(...seat.position);
    figure.node.rotation.y = seat.rotation || 0;
    figures.push(figure);
  });

  function update(time, state = false) {
    if (disposed) return false;
    const enabled = typeof state === 'boolean' ? state : Boolean(state?.enabled && !state.focused && !state.reducedMotion);
    const reducedMotion = typeof state === 'object' && state !== null && state.reducedMotion !== undefined
      ? Boolean(state.reducedMotion) : Boolean(options.reducedMotion);
    let officeVisible = typeof state === 'object' && state !== null ? state.officeVisible : undefined;
    if (officeVisible === undefined) {
      officeVisible = true;
      for (let parent = officeRoot; parent; parent = parent.parent) officeVisible &&= parent.visible;
    }
    for (const figure of figures) figure.node.visible = !figure.seated || Boolean(officeVisible);
    const visible = enabled && !reducedMotion && figures.some(figure => figure.node.visible);
    root.visible = visible;
    if (!visible || !Number.isFinite(time)) { lastTime = null; return false; }
    // Freeze while hidden; clamp tab-resume gaps rather than teleporting people.
    if (lastTime !== null) animationTime += Math.min(.1, Math.max(0, time - lastTime));
    lastTime = time;
    for (const figure of figures) {
      if (!figure.node.visible) continue;
      const t = animationTime + figure.phase;
      if (figure.seated) {
        figure.body.rotation.y = Math.sin(t * .38) * .025;
        continue;
      }
      const route = figure.route;
      const travelTime = route.length / .38;
      const cycle = travelTime * 2 + 4;
      const step = t % cycle;
      const forward = step < travelTime + 2;
      const walking = step < travelTime || (step >= travelTime + 2 && step < travelTime * 2 + 2);
      const distance = forward ? Math.min(route.length, step * .38) : Math.max(0, route.length - (step - travelTime - 2) * .38);
      const segment = route.segments.find(item => distance <= item.start + item.distance) || route.segments.at(-1);
      const progress = Math.max(0, Math.min(1, (distance - segment.start) / segment.distance));
      const { from, to } = segment;
      figure.node.position.set(from[0] + (to[0] - from[0]) * progress, from[1], from[2] + (to[2] - from[2]) * progress);
      const heading = Math.atan2(to[0] - from[0], to[2] - from[2]) + (forward ? 0 : Math.PI);
      // A gentle turn at a waypoint, including the two end pauses.
      const turn = Math.atan2(Math.sin(heading - figure.node.rotation.y), Math.cos(heading - figure.node.rotation.y));
      figure.node.rotation.y += turn * .08;
      const gait = walking ? Math.sin(t * 4.2) * .26 : 0;
      figure.legs[0].rotation.x = gait; figure.legs[1].rotation.x = -gait;
      figure.arms[0].rotation.x = -gait * .7; figure.arms[1].rotation.x = gait * .7;
      figure.body.position.y = walking ? Math.abs(Math.sin(t * 4.2)) * .012 : 0;
    }
    return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true; root.visible = false;
    root.removeFromParent(); root.clear(); figures.length = 0;
    for (const resource of resources) resource.dispose();
    resources.clear();
  }
  return { root, update, dispose };
}
