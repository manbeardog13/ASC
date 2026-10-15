// Building coordinates follow Toni's ground-floor sketch: street at u=-17,
// gates 3, 2, 1 from north to south. These are schematic units, not a survey.
// The existing warehouse's x/z coordinates and inventory IDs never change.
export const BUILDING_VERSION = 'asc-ground-floor-2';
export const STORAGE_LEVELS = Object.freeze({ '2.1': 0, '2.2': 1.6, '2.3': 3.2 });
export const ATTIC_LEVEL = 4.2;
export const BUILDING_ROOMS = Object.freeze([
  { id: 'workshop', name: 'Radionica', code: 'PRIZEMLJE', bounds: [-17, 0, 14, 29], level: 0 },
  { id: 'reception', name: 'Recepcija', code: 'PRIZEMLJE', bounds: [-5.7, 12.5, 1.7, 19], level: 0 },
  { id: 'triangle', name: 'Trokutasto skladište', code: 'PRIZEMLJE', bounds: [-22, -7, -17, 0], level: 0 },
]);
export const BUILDING_VIEWS = Object.freeze([
  { id: 'ground', name: 'Cijelo prizemlje', code: 'PRIZEMLJE', bounds: [-23, -7, 14, 29], level: 0 },
  ...BUILDING_ROOMS,
]);
export const isBuildingView = id => BUILDING_VIEWS.some(room => room.id === id);
export const buildingView = id => BUILDING_VIEWS.find(room => room.id === id);
// Quarter turn relative to the old warehouse view: its entrance meets gate 3.
export const planPoint = (u, v, y = 0) => ({ x: 5 - v, y, z: u - 7 });
export const CAR_POSITIONS = Object.freeze([
  { id: 'tyre-service', name: 'Zamjena guma', u: -10.8, v: 18.5, elevation: 0, heading: 0, lift: 'air-jack' },
  { id: 'gate-3', name: 'Vozilo · ulaz 3', u: -10, v: 5.1, elevation: 0, heading: 0, lift: 'two-post' },
  { id: 'mechanic-a', name: 'Vozilo · dizalica 1', u: 5.4, v: 18, elevation: 1.15, heading: -Math.PI / 2, lift: 'two-post' },
  { id: 'mechanic-b', name: 'Vozilo · dizalica 2', u: 11, v: 18, elevation: 1.15, heading: -Math.PI / 2, lift: 'two-post', color: 0xe6e5e1 },
].map(Object.freeze));
export const LUNCH_TABLE = Object.freeze({ u: -13.1, v: -1.85, width: 1.7, depth: 3.5 });
