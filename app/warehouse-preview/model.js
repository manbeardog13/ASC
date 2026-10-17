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
export const LAYOUT_VERSION = 'operator-1';
export const MAX_AREAS = 40;
export const MAX_AREA_SIZE = 200;
export const AREA_UNITS = Object.freeze(['grid', 'm']);
const AREA_ID = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,23}$/u;
const RACK_ID = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,23}$/u;

// Nothing is predefined. Areas are created by the operator on site and live in
// state.areas; AREAS is only a live mirror of the current state for the scene,
// voice and tour modules (see syncAreas). Shape of an operator area:
// { id, name, width, depth, unit:'grid'|'m', measurementStatus:'operator-grid'|'operator-measured',
//   floorRects:[{x:0,z:0,w:width,d:depth}], voidRects:[], stair:null }
// `id` equals the zone code of the real `locations` rows it represents.
export const AREAS = [];

export function syncAreas(state) {
  AREAS.length = 0;
  if (Array.isArray(state?.areas)) AREAS.push(...state.areas);
  return AREAS;
}

function areasOf(state) {
  return Array.isArray(state?.areas) ? state.areas : (state && typeof state === 'object' ? [] : AREAS);
}

export function getArea(areaId, state) {
  return areasOf(state).find(area => area && area.id === areaId) || null;
}

export function normalizeAreaId(value) { return String(value ?? '').trim(); }
export function normalizeRack(value) { return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ''); }

function areaErrors(area) {
  const errors = [];
  if (!area || typeof area !== 'object' || typeof area.id !== 'string' || !AREA_ID.test(area.id)) return ['Prostor nema valjanu oznaku zone.'];
  const label = area.id;
  if (typeof area.name !== 'string' || !area.name.trim() || area.name.length > 60) errors.push(`${label}: naziv prostora nije valjan.`);
  for (const key of ['width', 'depth']) {
    if (!Number.isFinite(area[key]) || area[key] <= 0 || area[key] > MAX_AREA_SIZE) errors.push(`${label}: veličina prostora nije valjana.`);
  }
  if (!AREA_UNITS.includes(area.unit)) errors.push(`${label}: jedinica nije valjana.`);
  const expectedStatus = area.unit === 'm' ? 'operator-measured' : 'operator-grid';
  if (area.measurementStatus !== expectedStatus) errors.push(`${label}: status mjerenja nije valjan.`);
  const rect = Array.isArray(area.floorRects) && area.floorRects.length === 1 ? area.floorRects[0] : null;
  if (!rect || rect.x !== 0 || rect.z !== 0 || rect.w !== area.width || rect.d !== area.depth) errors.push(`${label}: tlocrt ne odgovara unesenoj veličini.`);
  if (!Array.isArray(area.voidRects) || area.voidRects.length) errors.push(`${label}: otvori nisu podržani.`);
  if (area.stair !== null) errors.push(`${label}: stubište nije podržano.`);
  return errors;
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
export function hasFloorSupport(areaId, x, z, radius = DEFAULT_RADIUS, state) {
  const area = getArea(areaId, state);
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
  const area = getArea(areaId, state);
  if (!area) return { valid: false, reason: 'Odaberite skladište.' };
  if (![x, z, radius].every(Number.isFinite) || radius <= 0) {
    return { valid: false, reason: 'Unesite valjan položaj i promjer stupca.' };
  }
  if (area.stair && circleIntersectsRect(x, z, radius, area.stair)) {
    return { valid: false, reason: 'Ostavite stubište slobodno.' };
  }
  if (!hasFloorSupport(areaId, x, z, radius, state)) {
    return { valid: false, reason: 'Cijeli stupac mora stajati na čvrstom podu, izvan otvora i rubova.' };
  }
  const collision = (state?.stacks || []).find(stack => stack.id !== excludeId &&
    stack.areaId === areaId && Math.hypot(stack.x - x, stack.z - z) < stack.radius + radius - EPSILON);
  if (collision) return { valid: false, reason: `Ovo se mjesto preklapa sa stupcem ${collision.id}.` };
  return { valid: true, reason: area.unit === 'm' ? 'Pod je potpun. Visina prostora nije potvrđena.' : 'Mjesto je unutar okvira. Mjere nisu potvrđene (mreža).' };
}

/** A device starts with nothing: no stacks, no tyres, no history. */
export function emptyState() {
  return { version: 1, revision: 0, areas: [], stacks: [], tires: [], history: [] };
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
  if (state.areas !== undefined) {
    if (!Array.isArray(state.areas)) return { valid: false, errors: [...errors, 'Popis prostora nije valjan.'] };
    if (state.areas.length > MAX_AREAS) errors.push('Previše prostora.');
    const areaIds = new Set();
    for (const area of state.areas) {
      errors.push(...areaErrors(area));
      if (area && typeof area === 'object') {
        if (areaIds.has(area.id)) errors.push(`Ponovljena oznaka prostora: ${area.id}.`);
        areaIds.add(area.id);
      }
    }
  }
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
    if (stack.rack !== undefined && (typeof stack.rack !== 'string' || !RACK_ID.test(stack.rack) || stack.rack !== normalizeRack(stack.rack))) errors.push(`${stack.id} ima nevaljanu oznaku regala.`);
    if (stack.rack !== undefined && state.stacks.some(peer => peer !== stack && peer?.areaId === stack.areaId && peer?.rack === stack.rack)) errors.push(`${stack.id}: regal ${stack.rack} je već na karti.`);
    if (!Array.isArray(stack.tireIds)) { errors.push(`${stack.id} nema poredak guma.`); continue; }
    if (stack.tireIds.length > stack.capacity) errors.push(`${stack.id} prelazi svoj kapacitet.`);
    for (const id of stack.tireIds) {
      if (!tireIds.has(id)) errors.push(`${stack.id} upućuje na nepoznatu gumu: ${id}.`);
      assigned.set(id, (assigned.get(id) || 0) + 1);
    }
    // Defensive import validation avoids dereferencing malformed peer records.
    const peers = { areas: Array.isArray(state.areas) ? state.areas : [], stacks: state.stacks.filter(peer => peer && typeof peer === 'object') };
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

export function createStack(state, { areaId, x, z, capacity = DEFAULT_CAPACITY, rack } = {}) {
  assertState(state);
  checkCapacity(capacity);
  const placement = canPlace(state, areaId, x, z);
  if (!placement.valid) throw new Error(placement.reason);
  const rackId = rack == null || rack === '' ? '' : normalizeRack(rack);
  if (rackId && !RACK_ID.test(rackId)) throw new Error('Oznaka regala smije imati slova, brojeve, točku, crticu ili podvlaku.');
  if (rackId && state.stacks.some(stack => stack.areaId === areaId && stack.rack === rackId)) throw new Error(`Regal ${rackId} je već na karti.`);
  let id;
  if (rackId) {
    id = `${areaId}-${rackId}`;
    if (state.stacks.some(stack => stack.id === id)) throw new Error(`Oznaka ${id} već postoji.`);
  } else {
    let sequence = 1;
    while (state.stacks.some(stack => stack.id === `${areaId}-S${String(sequence).padStart(3, '0')}`)) sequence++;
    id = `${areaId}-S${String(sequence).padStart(3, '0')}`;
  }
  const stack = { id, areaId, x, z, radius: DEFAULT_RADIUS, capacity, tireIds: [], ...(rackId ? { rack: rackId } : {}) };
  return committed(state, { stacks: [...state.stacks, stack] }, 'stack-created', { stackId: stack.id, areaId, x, z, ...(rackId ? { rack: rackId } : {}) });
}

/** Operator-entered area. Width/depth are required input; nothing is defaulted.
 * unit 'grid' = relative squares paced or estimated on site (unmeasured);
 * unit 'm' = the operator measured the room in metres. */
export function createArea(state, { id, name, width, depth, unit } = {}) {
  assertState(state);
  const areas = Array.isArray(state.areas) ? state.areas : [];
  const areaId = normalizeAreaId(id);
  if (!AREA_ID.test(areaId)) throw new Error('Unesite oznaku zone (kao na naljepnicama mjesta), do 24 znaka.');
  if (areas.some(area => area.id === areaId)) throw new Error(`Prostor ${areaId} već postoji.`);
  if (areas.length >= MAX_AREAS) throw new Error('Dosegnut je najveći broj prostora.');
  if (!AREA_UNITS.includes(unit)) throw new Error('Odaberite jesu li mjere izmjerene ili okvirne.');
  const w = Number(width), d = Number(depth);
  if (![w, d].every(v => Number.isFinite(v) && v > 0 && v <= MAX_AREA_SIZE)) throw new Error(`Unesite širinu i dubinu od 0 do ${MAX_AREA_SIZE}.`);
  const label = String(name ?? '').trim() || `Zona ${areaId}`;
  if (label.length > 60) throw new Error('Naziv je predug.');
  const area = { id: areaId, name: label, width: w, depth: d, unit,
    measurementStatus: unit === 'm' ? 'operator-measured' : 'operator-grid',
    floorRects: [{ x: 0, z: 0, w, d }], voidRects: [], stair: null };
  return committed(state, { areas: [...areas, area] }, 'area-created', { areaId });
}

/** Only an empty area can be removed, so no stack or tyre is ever orphaned. */
export function removeArea(state, areaId) {
  assertState(state);
  const areas = Array.isArray(state.areas) ? state.areas : [];
  if (!areas.some(area => area.id === areaId)) throw new Error('Ovaj prostor više ne postoji.');
  if (state.stacks.some(stack => stack.areaId === areaId)) throw new Error('Najprije premjestite ili uklonite stupce iz ovog prostora.');
  return committed(state, { areas: areas.filter(area => area.id !== areaId) }, 'area-removed', { areaId });
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
    const values = [stack.id, stack.areaId, stack.rack, getArea(stack.areaId, state)?.name];
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
