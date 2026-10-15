/**
 * ASC warehouse spatial module — blank slate.
 * No warehouses, zones, stacks or tyres are hardcoded here. Areas are added
 * only from the real layout once it has been measured on site; until then the
 * map renders an empty state. Geometry uses schematic units, NOT metres.
 * Rectangle x/z are centres.
 */

const FIELD_NAMES = { setId:'komplet', customer:'kupac', plate:'registracija', brand:'marka', size:'dimenzija', color:'boja', code:'kod' };
const EPSILON = 1e-8;
export const DEFAULT_CAPACITY = 8;
export const MAX_CAPACITY = 16;
export const DEFAULT_RADIUS = 0.27;
export const LAYOUT_VERSION = 'blank-1';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Intentionally empty. Each area, once real, has the shape:
// { id, name, subtitle, width, depth, measurementStatus, floorRects:[{x,z,w,d}], voidRects:[], stair:null|{x,z,w,d}, description }
export const AREAS = deepFreeze([]);

export function getArea(areaId) {
  return AREAS.find(area => area.id === areaId) || null;
}

function bounds(rect) {
  return { left: rect.x - rect.w / 2, right: rect.x + rect.w / 2,
    north: rect.z - rect.d / 2, south: rect.z + rect.d / 2 };
}

function pointInRect(x, z, rect) {
  const b = bounds(rect);
  return x >= b.left - EPSILON && x <= b.right + EPSILON &&
    z >= b.north - EPSILON && z <= b.south + EPSILON;
}

function circleIntersectsRect(x, z, radius, rect) {
  const b = bounds(rect);
  const dx = x - Math.max(b.left, Math.min(x, b.right));
  const dz = z - Math.max(b.north, Math.min(z, b.south));
  return dx * dx + dz * dz < radius * radius - EPSILON;
}

/** Exact circle containment for the union of axis-aligned floor rectangles.
 * Splitting the bounding box at rectangle edges permits crossing a valid floor
 * seam, while detecting even a narrow unsupported portion of the tyre footprint.
 */
export function hasFloorSupport(areaId, x, z, radius = DEFAULT_RADIUS) {
  const area = getArea(areaId);
  if (!area || ![x, z, radius].every(Number.isFinite) || radius <= 0) return false;
  const minX = x - radius, maxX = x + radius;
  const minZ = z - radius, maxZ = z + radius;
  const xs = [minX, maxX], zs = [minZ, maxZ];
  for (const rect of area.floorRects) {
    const b = bounds(rect);
    for (const v of [b.left, b.right]) if (v > minX && v < maxX) xs.push(v);
    for (const v of [b.north, b.south]) if (v > minZ && v < maxZ) zs.push(v);
  }
  const sortedX = [...new Set(xs)].sort((a, b) => a - b);
  const sortedZ = [...new Set(zs)].sort((a, b) => a - b);
  for (let xi = 0; xi < sortedX.length - 1; xi++) {
    for (let zi = 0; zi < sortedZ.length - 1; zi++) {
      const cell = { x: (sortedX[xi] + sortedX[xi + 1]) / 2,
        z: (sortedZ[zi] + sortedZ[zi + 1]) / 2,
        w: sortedX[xi + 1] - sortedX[xi], d: sortedZ[zi + 1] - sortedZ[zi] };
      if (!area.floorRects.some(rect => pointInRect(cell.x, cell.z, rect)) &&
        circleIntersectsRect(x, z, radius, cell)) return false;
    }
  }
  return !area.voidRects.some(rect => circleIntersectsRect(x, z, radius, rect));
}

export function canPlace(state, areaId, x, z, radius = DEFAULT_RADIUS, excludeId = null) {
  const area = getArea(areaId);
  if (!area) return { valid: false, reason: 'Odaberite skladište.' };
  if (![x, z, radius].every(Number.isFinite) || radius <= 0) {
    return { valid: false, reason: 'Unesite valjan položaj i promjer stupca.' };
  }
  if (area.stair && circleIntersectsRect(x, z, radius, area.stair)) {
    return { valid: false, reason: 'Ostavite stubište slobodno.' };
  }
  if (!hasFloorSupport(areaId, x, z, radius)) {
    return { valid: false, reason: 'Cijeli stupac mora stajati na čvrstom podu, izvan otvora i rubova.' };
  }
  const collision = (state?.stacks || []).find(stack => stack.id !== excludeId &&
    stack.areaId === areaId && Math.hypot(stack.x - x, stack.z - z) < stack.radius + radius - EPSILON);
  if (collision) return { valid: false, reason: `Ovo se mjesto preklapa sa stupcem ${collision.id}.` };
  return { valid: true, reason: 'Pod je potpun. Visina prostora nije potvrđena.' };
}

/** A device starts with nothing: no stacks, no tyres, no history. */
export function emptyState() {
  return { version: 1, revision: 0, stacks: [], tires: [], history: [] };
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return { valid: false, errors: ['Podaci nisu valjani.'] };
  if (state.version !== 1) errors.push('Ova verzija podataka nije podržana.');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) errors.push('Verzija zapisa nije valjana.');
  if (!Array.isArray(state.stacks) || !Array.isArray(state.tires) || !Array.isArray(state.history)) {
    return { valid: false, errors: [...errors, 'Popis stupaca, guma ili promjena nije valjan.'] };
  }
  if (state.history.length > 30) errors.push('Povijest prelazi lokalno ograničenje.');
  const eventIds = new Set();
  for (const event of state.history) {
    if (!event || typeof event !== 'object' || typeof event.id !== 'string' ||
      typeof event.type !== 'string' || !Number.isSafeInteger(event.revision) ||
      event.revision < 1 || event.revision > state.revision ||
      typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))) {
      errors.push('Zapis lokalne povijesti nije valjan.'); continue;
    }
    if (eventIds.has(event.id)) errors.push(`Ponovljen zapis promjene: ${event.id}.`);
    eventIds.add(event.id);
  }
  const stackIds = new Set(), tireIds = new Set(), codes = new Set(), assigned = new Map();
  for (const tire of state.tires) {
    if (!tire || typeof tire !== 'object' || typeof tire.id !== 'string' || !tire.id) {
      errors.push('Gumi nedostaje oznaka.'); continue;
    }
    if (tireIds.has(tire.id)) errors.push(`Ponovljena oznaka gume: ${tire.id}.`);
    tireIds.add(tire.id);
    for (const key of ['setId', 'customer', 'plate', 'brand', 'size', 'color', 'code']) {
      if (typeof tire[key] !== 'string' || !tire[key].trim()) errors.push(`${tire.id} ima nevaljano polje (${FIELD_NAMES[key] || 'podatak'}).`);
    }
    if (codes.has(tire.code)) errors.push(`Ponovljen kod gume: ${tire.code}.`);
    codes.add(tire.code);
  }
  for (const stack of state.stacks) {
    if (!stack || typeof stack !== 'object' || typeof stack.id !== 'string' || !stack.id) {
      errors.push('Stupcu nedostaje oznaka.'); continue;
    }
    if (stackIds.has(stack.id)) errors.push(`Ponovljena oznaka stupca: ${stack.id}.`);
    stackIds.add(stack.id);
    if (!Number.isInteger(stack.capacity) || stack.capacity < 1 || stack.capacity > MAX_CAPACITY) {
      errors.push(`${stack.id} ima nevaljan kapacitet.`);
    }
    if (!Number.isFinite(stack.radius) || stack.radius <= 0) errors.push(`${stack.id} ima nevaljan promjer.`);
    if (!Array.isArray(stack.tireIds)) { errors.push(`${stack.id} nema poredak guma.`); continue; }
    if (stack.tireIds.length > stack.capacity) errors.push(`${stack.id} prelazi svoj kapacitet.`);
    for (const id of stack.tireIds) {
      if (!tireIds.has(id)) errors.push(`${stack.id} upućuje na nepoznatu gumu: ${id}.`);
      assigned.set(id, (assigned.get(id) || 0) + 1);
    }
    // Defensive import validation avoids dereferencing malformed peer records.
    const peers = { stacks: state.stacks.filter(peer => peer && typeof peer === 'object') };
    const placement = canPlace(peers, stack.areaId, stack.x, stack.z, stack.radius, stack.id);
    if (!placement.valid) errors.push(`${stack.id}: ${placement.reason}`);
  }
  for (const id of tireIds) {
    if (!assigned.has(id)) errors.push(`Guma bez položaja: ${id}.`);
    else if (assigned.get(id) !== 1) errors.push(`Guma je dodijeljena više puta: ${id}.`);
  }
  return { valid: errors.length === 0, errors };
}

function assertState(state) {
  const result = validateState(state);
  if (!result.valid) throw new Error(`Nevaljani lokalni podaci: ${result.errors[0]}`);
}

function requireStack(state, stackId) {
  const stack = state.stacks.find(item => item.id === stackId);
  if (!stack) throw new Error('Ovaj stupac više ne postoji.');
  return stack;
}

function checkCapacity(capacity, occupied = 0) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new Error(`Kapacitet mora biti cijeli broj od 1 do ${MAX_CAPACITY}.`);
  }
  if (capacity < occupied) throw new Error(`Najprije premjestite ili uklonite gume. U stupcu je ${occupied} guma.`);
}

function committed(state, changes, type, details) {
  const revision = state.revision + 1;
  return { ...state, ...changes, revision,
    history: [...state.history, { id: `event-${revision}`, revision,
      type, at: new Date().toISOString(), ...details }].slice(-30) };
}

export function createStack(state, { areaId, x, z, capacity = DEFAULT_CAPACITY } = {}) {
  assertState(state);
  checkCapacity(capacity);
  const placement = canPlace(state, areaId, x, z);
  if (!placement.valid) throw new Error(placement.reason);
  let sequence = 1;
  while (state.stacks.some(stack => stack.id === `${areaId}-S${String(sequence).padStart(3, '0')}`)) sequence++;
  const stack = { id: `${areaId}-S${String(sequence).padStart(3, '0')}`, areaId,
    x, z, radius: DEFAULT_RADIUS, capacity, tireIds: [] };
  return committed(state, { stacks: [...state.stacks, stack] }, 'stack-created', { stackId: stack.id, areaId, x, z });
}

export function moveStack(state, stackId, { areaId, x, z } = {}) {
  assertState(state);
  const stack = requireStack(state, stackId);
  const destination = areaId ?? stack.areaId;
  const placement = canPlace(state, destination, x, z, stack.radius, stackId);
  if (!placement.valid) throw new Error(placement.reason);
  return committed(state, { stacks: state.stacks.map(item => item.id === stackId ?
    { ...item, areaId: destination, x, z } : item) }, 'stack-moved', {
    stackId, from: { areaId: stack.areaId, x: stack.x, z: stack.z }, to: { areaId: destination, x, z },
  });
}

export function setCapacity(state, stackId, capacity) {
  assertState(state);
  const stack = requireStack(state, stackId);
  checkCapacity(capacity, stack.tireIds.length);
  return committed(state, { stacks: state.stacks.map(item => item.id === stackId ?
    { ...item, capacity } : item) }, 'capacity-changed', { stackId, from: stack.capacity, to: capacity });
}

export function addTire(state, stackId, template = {}) {
  assertState(state);
  const stack = requireStack(state, stackId);
  if (stack.tireIds.length >= stack.capacity) throw new Error('Stupac je pun. Povećajte kapacitet ili odaberite drugi.');
  if (!template || typeof template !== 'object' || Array.isArray(template)) throw new Error('Podaci o gumi nisu valjani.');
  const revision = state.revision + 1;
  let serial = 1, id;
  do { id = `T-D${String(revision).padStart(6, '0')}-${serial++}`; } while (state.tires.some(tire => tire.id === id));
  const defaults = { setId: `SET-D${String(revision).padStart(6, '0')}`, brand: 'Nepoznato', color: '#8a9cac' };
  const tire = { id, code: `ASC-${id}` };
  for (const key of ['customer', 'plate', 'size']) {
    if (typeof template[key] !== 'string' || !template[key].trim()) throw new Error(`Unesite valjano polje: ${FIELD_NAMES[key] || 'podatak'}.`);
    tire[key] = template[key].trim();
  }
  for (const [key, fallback] of Object.entries(defaults)) {
    if (template[key] !== undefined && (typeof template[key] !== 'string' || !template[key].trim())) {
      throw new Error(`Unesite valjano polje: ${FIELD_NAMES[key] || 'podatak'}.`);
    }
    tire[key] = template[key]?.trim() || fallback;
  }
  return committed(state, { tires: [...state.tires, tire], stacks: state.stacks.map(item => item.id === stackId ?
    { ...item, tireIds: [...item.tireIds, tire.id] } : item) }, 'tyre-added', { stackId, tireId: tire.id });
}

export function removeTire(state, stackId, tireId) {
  assertState(state);
  const stack = requireStack(state, stackId);
  const id = tireId ?? stack.tireIds.at(-1);
  if (!id) throw new Error('Ovaj stupac je prazan.');
  if (!stack.tireIds.includes(id)) throw new Error('Ta guma nije u ovom stupcu.');
  return committed(state, { tires: state.tires.filter(tire => tire.id !== id),
    stacks: state.stacks.map(item => item.id === stackId ?
      { ...item, tireIds: item.tireIds.filter(value => value !== id) } : item) },
  'tyre-removed', { stackId, tireId: id });
}

const normalize = value => String(value ?? '').replace(/[đĐ]/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const compact = value => normalize(value).replace(/[^a-z0-9]/g, '');

export function findMatches(state, query = '') {
  const text = normalize(query);
  if (!text) return [...state.stacks];
  const words = text.split(/\s+/);
  const tires = new Map(state.tires.map(tire => [tire.id, tire]));
  return state.stacks.filter(stack => {
    const values = [stack.id, stack.areaId, getArea(stack.areaId)?.name];
    for (const id of stack.tireIds) {
      const tire = tires.get(id);
      if (tire) values.push(tire.id, tire.setId, tire.customer, tire.plate, tire.code, tire.brand, tire.size);
    }
    const haystack = normalize(values.join(' '));
    return words.every(word => haystack.includes(word)) || (compact(text).length > 0 && values.some(value => compact(value).includes(compact(text))));
  });
}

export function stats(state, areaId = null) {
  const selected = areaId == null ? state.stacks : state.stacks.filter(stack => stack.areaId === areaId);
  const occupied = selected.reduce((sum, stack) => sum + stack.tireIds.length, 0);
  const capacity = selected.reduce((sum, stack) => sum + stack.capacity, 0);
  return { stacks: selected.length, occupied, capacity, vacant: capacity - occupied };
}
