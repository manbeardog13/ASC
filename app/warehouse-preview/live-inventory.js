import { locationKey, locationKeyProblem } from '../../js/mapPin.js';

const ACTIVE_STATUSES = new Set(['in_storage', 'reserved']);
const tuple = (...parts) => JSON.stringify(parts);
const text = value => value == null ? null : String(value);
const present = value => value !== undefined && value !== null && value !== '';
const copy = value => structuredClone(value);
const count = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function address(row) {
  if (!row || typeof row.warehouse !== 'string' || !row.warehouse.trim()) return null;
  const parts = ['zone', 'rack', 'shelf', 'slot'].map(key => locationKey(row[key]));
  if (parts.some((part, i) => (i < 2 || part) && locationKeyProblem(part))) return null;
  // Warehouse identifiers are deliberately NOT case-folded or coerced to main.
  return { warehouse: row.warehouse, zone: parts[0], rack: parts[1], shelf: parts[2], slot: parts[3] };
}

const addressKey = a => tuple(a.warehouse, a.zone, a.rack, a.shelf, a.slot);
const seatKey = a => tuple(a.zone, a.rack, a.shelf, a.slot);
const rackKey = a => tuple(a.warehouse, a.zone, a.rack);
const zoneKey = a => tuple(a.warehouse, a.zone);

function addTo(index, key, value) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(value);
}

function resolveLocation(set, indexes) {
  let candidates;
  if (present(set.location_id)) {
    candidates = indexes.byId.get(String(set.location_id)) || [];
    if (!candidates.length) return { reason: 'location-id-not-found' };
  } else {
    const parts = ['zone', 'rack', 'shelf', 'slot'].map(key => locationKey(set[key]));
    if (parts.some((part, i) => (i < 2 || part) && locationKeyProblem(part))) return { reason: 'invalid-location' };
    candidates = indexes.bySeat.get(tuple(...parts)) || [];
    if (present(set.warehouse)) candidates = candidates.filter(loc => loc.warehouse === set.warehouse);
    if (!candidates.length) return { reason: 'location-not-found' };
  }
  if (candidates.length !== 1) return { reason: 'ambiguous-location' };
  const location = candidates[0];
  if (present(set.warehouse) && set.warehouse !== location.warehouse) return { reason: 'location-mismatch' };
  for (const key of ['zone', 'rack', 'shelf', 'slot']) {
    if (set[key] != null && locationKey(set[key]) !== location[key]) return { reason: 'location-mismatch' };
  }
  if ((indexes.byAddress.get(addressKey(location)) || []).length !== 1) return { reason: 'ambiguous-location' };
  if (location.status === 'blocked') return { reason: 'blocked-location' };
  if (location.status && !['free', 'occupied'].includes(location.status)) return { reason: 'invalid-location-status' };
  return { location };
}

function projectTires(set, quantity, location) {
  if (set.tires != null && !Array.isArray(set.tires)) return { reason: 'invalid-tire-details' };
  const details = (Array.isArray(set.tires) ? set.tires : []).filter(row => row && typeof row === 'object');
  if (details.length > quantity) return { reason: 'tire-count-exceeds-quantity' };
  if (Array.isArray(set.tires) && details.length !== set.tires.length) return { reason: 'invalid-tire-details' };
  const ids = details.filter(t => present(t.id)).map(t => String(t.id));
  if (new Set(ids).size !== ids.length) return { reason: 'duplicate-tire-id' };
  const positions = details.map(t => text(t.position)).filter(Boolean);
  const uniquePosition = position => position && positions.filter(p => p === position).length === 1;
  // Sorting makes presentation order independent of query order. A position or
  // ordinal key is a display identity only, never a new database tire record.
  const rows = details.map(detail => ({ detail, sort: present(detail.id) ? tuple('id', String(detail.id)) :
    tuple('position', text(detail.position), text(detail.brand), text(detail.size), text(detail.model), text(detail.dot_code), text(detail.tread_mm)) }))
    .sort((a, b) => compare(a.sort, b.sort));
  const vehicle = set.vehicle && !Array.isArray(set.vehicle) ? set.vehicle : {};
  const customer = vehicle.customer && !Array.isArray(vehicle.customer) ? vehicle.customer : {};
  const tires = [];
  for (let i = 0; i < quantity; i++) {
    const detail = rows[i]?.detail || null;
    const sourceTireId = present(detail?.id) ? String(detail.id) : null;
    const position = text(detail?.position);
    const identityKind = sourceTireId ? 'tire-id' : uniquePosition(position) ? 'set-position' : detail ? 'set-detail-ordinal' : 'set-quantity-ordinal';
    const identity = sourceTireId || (uniquePosition(position) ? position : String(detail ? i + 1 : i - rows.length + 1));
    tires.push({
      id: `live:${tuple(String(set.id), identityKind, identity)}`,
      presentationId: true, identityKind, sourceTireId, source: 'storage_sets',
      setId: String(set.id), publicCode: text(set.public_code), code: text(set.public_code),
      customerId: text(customer.id), customer: text(customer.name), vehicleId: text(vehicle.id), plate: text(vehicle.plate),
      brand: text(detail?.brand), size: text(detail?.size), model: text(detail?.model), position,
      dotCode: text(detail?.dot_code), treadMm: detail?.tread_mm ?? null,
      quantityOnly: !detail, location: { ...location },
    });
  }
  return { tires };
}

/**
 * Read-only adapter from real storage_sets + locations to the existing scene.
 *
 * `layout` remains the editable/persisted source. Never persist this returned
 * state or pass it through model.validateState: true overcapacity and missing
 * metadata are display facts, not fake local inventory to repair or write.
 *
 * Location IDs are authoritative and must resolve in `locations`. Legacy rows
 * without an ID require one unique complete seat tuple across ALL supplied
 * warehouses. Pass the complete locations result, not just the viewed warehouse.
 * Area warehouse defaults to the explicit scope; set/location warehouse never
 * does. Stack rack must be explicitly bound; stack-ID guesses are prohibited.
 *
 * All quantities are accounted for as mapped or explicitly unplaced. The scene
 * budget refuses whole sets instead of truncating them. Detail-less units retain
 * stable presentation IDs and null metadata. Within-rack order is schematic.
 */
export function projectLiveInventory({ layout, sets, locations, warehouse = 'main', selectedSetId = null, maxTires = 100000 }) {
  if (!layout || !Array.isArray(layout.areas) || !Array.isArray(layout.stacks) || !Array.isArray(sets) || !Array.isArray(locations)) {
    throw new TypeError('Live inventory needs a layout, storage sets and locations arrays.');
  }
  if (typeof warehouse !== 'string' || !warehouse.trim() || !Number.isSafeInteger(maxTires) || maxTires < 0) throw new TypeError('Invalid warehouse or scene budget.');
  const state = { ...copy(layout), tires: [], readOnly: true, inventorySource: 'storage_sets' };
  state.stacks = state.stacks.map(stack => ({ ...stack, tireIds: [], setIds: [], occupiedQuantity: 0, overflowQuantity: 0, selectedTireIds: [] }));
  const issues = [], unplaced = [], excluded = [], setPlacements = [], selectedTireIds = [];
  const coverage = { totalSets: sets.length, activeSets: 0, activeQuantity: 0, mappedSets: 0, mappedQuantity: 0,
    unplacedSets: 0, unplacedQuantity: 0, unknownQuantitySets: 0, excludedSets: 0, invalidSets: 0,
    overflowStacks: 0, overflowQuantity: 0, conflictingLocations: 0, locationRecords: locations.length, invalidLocationRecords: 0 };
  const indexes = { byId: new Map(), bySeat: new Map(), byAddress: new Map() };
  locations.forEach((row, inputIndex) => {
    const a = address(row);
    if (!a) { coverage.invalidLocationRecords++; issues.push({ kind: 'location', reason: 'invalid-location-record', inputIndex, locationId: text(row?.id) }); return; }
    const loc = { ...a, id: text(row.id), status: text(row.status) };
    if (loc.id) addTo(indexes.byId, loc.id, loc);
    addTo(indexes.bySeat, seatKey(loc), loc);
    addTo(indexes.byAddress, addressKey(loc), loc);
  });
  const areasById = new Map(), areasByZone = new Map(), stacksByRack = new Map(), stackIdCounts = new Map();
  for (const area of state.areas) {
    if (!area || !present(area.id)) continue;
    addTo(areasById, area.id, area);
    const zone = locationKey(area.zone ?? area.id), wh = area.warehouse ?? warehouse;
    if (!locationKeyProblem(zone) && typeof wh === 'string' && wh) addTo(areasByZone, tuple(wh, zone), area);
  }
  for (const stack of state.stacks) stackIdCounts.set(stack.id, (stackIdCounts.get(stack.id) || 0) + 1);
  for (const stack of state.stacks) {
    const areas = areasById.get(stack.areaId) || [];
    if (areas.length !== 1 || locationKeyProblem(stack.rack)) continue;
    const area = areas[0], wh = stack.warehouse ?? area.warehouse ?? warehouse;
    addTo(stacksByRack, tuple(wh, locationKey(area.zone ?? area.id), locationKey(stack.rack)), stack);
  }
  const active = sets.filter((set, inputIndex) => {
    if (!set || typeof set !== 'object') { coverage.invalidSets++; issues.push({ kind: 'set', reason: 'invalid-set-record', inputIndex }); return false; }
    const reason = present(set.deleted_at) ? 'deleted' : !ACTIVE_STATUSES.has(set.status) ? 'inactive-status' : present(set.picked_up_at) ? 'picked-up' : null;
    if (reason) { excluded.push({ setId: text(set.id), publicCode: text(set.public_code), status: text(set.status), quantity: count(set.quantity), reason }); return false; }
    return true;
  }).sort((a, b) => compare(String(a.id ?? ''), String(b.id ?? '')));
  coverage.excludedSets = excluded.length;
  const setIdCounts = new Map();
  for (const set of active) if (present(set.id)) setIdCounts.set(String(set.id), (setIdCounts.get(String(set.id)) || 0) + 1);
  const assignedLocations = new Map();
  for (const set of active) {
    const quantity = count(set.quantity);
    const placement = { setId: text(set.id), publicCode: text(set.public_code), quantity, status: 'unplaced',
      reason: null, areaId: null, stackId: null, tireIds: [], location: null, source: copy(set) };
    coverage.activeSets++;
    if (quantity === null) coverage.unknownQuantitySets++; else coverage.activeQuantity += quantity;
    const reject = reason => {
      placement.reason = reason; setPlacements.push(placement); unplaced.push(placement);
      coverage.unplacedSets++; coverage.unplacedQuantity += quantity || 0;
      issues.push({ kind: 'set', reason, setId: placement.setId, publicCode: placement.publicCode, quantity });
    };
    if (!present(set.id)) { reject('missing-set-id'); continue; }
    if (setIdCounts.get(String(set.id)) !== 1) { reject('duplicate-set-id'); continue; }
    if (quantity === null) { reject('invalid-quantity'); continue; }
    const resolved = resolveLocation(set, indexes);
    if (!resolved.location) { reject(resolved.reason); continue; }
    placement.location = resolved.location;
    addTo(assignedLocations, addressKey(resolved.location), String(set.id));
    if (resolved.location.warehouse !== warehouse) { reject('outside-warehouse'); continue; }
    const areas = areasByZone.get(zoneKey(resolved.location)) || [];
    if (areas.length !== 1) { reject(areas.length ? 'ambiguous-area' : 'unmapped-area'); continue; }
    placement.areaId = areas[0].id;
    const stacks = stacksByRack.get(rackKey(resolved.location)) || [];
    if (stacks.length !== 1) { reject(stacks.length ? 'ambiguous-rack' : 'unmapped-rack'); continue; }
    const stack = stacks[0];
    if (!present(stack.id) || stackIdCounts.get(stack.id) !== 1 || !Number.isFinite(stack.x) || !Number.isFinite(stack.z) ||
      (stack.radius != null && (!Number.isFinite(stack.radius) || stack.radius <= 0)) || count(stack.capacity) === null) {
      reject('invalid-stack'); continue;
    }
    if (state.tires.length + quantity > maxTires) { reject('scene-budget-exceeded'); continue; }
    const projection = projectTires(set, quantity, resolved.location);
    if (!projection.tires) { reject(projection.reason); continue; }
    placement.status = 'mapped'; placement.stackId = stack.id; placement.tireIds = projection.tires.map(tire => tire.id);
    state.tires.push(...projection.tires); stack.tireIds.push(...placement.tireIds); stack.setIds.push(String(set.id));
    stack.occupiedQuantity += quantity;
    if (String(selectedSetId ?? '') === String(set.id)) {
      selectedTireIds.push(...placement.tireIds); stack.selectedTireIds.push(...placement.tireIds);
    }
    if (resolved.location.status === 'free') issues.push({ kind: 'set', reason: 'location-status-mismatch', setId: String(set.id), locationId: resolved.location.id });
    setPlacements.push(placement); coverage.mappedSets++; coverage.mappedQuantity += quantity;
  }
  for (const [location, setIds] of assignedLocations) {
    if (setIds.length > 1) {
      coverage.conflictingLocations++;
      issues.push({ kind: 'location', reason: 'multiple-active-sets-at-location', address: JSON.parse(location), setIds });
    }
  }
  for (const stack of state.stacks) {
    stack.overflowQuantity = Math.max(0, stack.occupiedQuantity - (count(stack.capacity) || 0));
    if (stack.overflowQuantity) {
      coverage.overflowStacks++; coverage.overflowQuantity += stack.overflowQuantity;
      issues.push({ kind: 'stack', reason: 'capacity-overflow', stackId: stack.id, capacity: stack.capacity,
        quantity: stack.occupiedQuantity, overflowQuantity: stack.overflowQuantity, setIds: [...stack.setIds] });
    }
  }
  return { state, coverage, setPlacements, unplaced, excluded, issues, selectedTireIds };
}
