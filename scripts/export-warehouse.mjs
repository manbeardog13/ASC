#!/usr/bin/env node
// Export the implemented THREE geometry for an independent offline renderer.
// This script never loads a browser, database, account session or customer data.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from '../app/warehouse-preview/vendor/three.module.js';
import { createStaff } from '../app/warehouse-preview/staff.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(repository, 'app/warehouse-preview/building.js');
const source = await readFile(sourcePath);
const { createBuilding, SPACE_MANIFEST, BUILDING_VERSION, BUILDING_TOPOLOGY } = await import('../app/warehouse-preview/building.js');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const output = resolve(option('--output', resolve(repository, 'out/warehouse-review/geometry.json')));
const view = option('--view', 'all'), cutaway = option('--cutaway', 'open');
if (!['all', 'building', 'exterior', 'upper-assembly', 'upper-review', ...SPACE_MANIFEST.map(space => space.id)].includes(view)) throw new Error('Unknown view');
if (!['open', 'review', 'shell', 'closed', 'exterior'].includes(cutaway)) throw new Error('Unknown cutaway mode');
// The same supplied logo used by the browser. Texture pixels are embedded so
// the offline render does not require a DOM or substitute lettering.
const logoBytes = await readFile(resolve(repository, 'app/assets/logo.png'));
const logoTexture = new THREE.Texture();
const textures = [{ id: 0, source: 'app/assets/logo.png', mimeType: 'image/png',
  sourceSha256: createHash('sha256').update(logoBytes).digest('hex'), dataBase64: logoBytes.toString('base64') }];
const building = createBuilding(THREE, { logoTexture });
building.setView(view); building.setCutaway(cutaway);
const scene = new THREE.Group(); scene.add(building.root);
let staff = null;
if (args.includes('--staff')) {
  staff = createStaff(THREE, { buildingRoot: building.root, ...(['upper-assembly', 'upper-review'].includes(view) ? { paths: [] } : {}) });
  staff.update(0, true); staff.update(.1, true);
  scene.add(staff.root);
}
scene.updateMatrixWorld(true);
const geometries = [], materials = [], objects = [];
const geometryIds = new Map(), materialIds = new Map();
const matrix = new THREE.Matrix4(), instance = new THREE.Matrix4();
const geometryId = geometry => {
  if (geometryIds.has(geometry.uuid)) return geometryIds.get(geometry.uuid);
  const id = geometries.length;
  geometryIds.set(geometry.uuid, id);
  const vertices = [], position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) vertices.push([position.getX(i), position.getY(i), position.getZ(i)]);
  const indices = geometry.index ? Array.from(geometry.index.array) : vertices.map((_, i) => i);
  const faces = [];
  for (let i = 0; i + 2 < indices.length; i += 3) faces.push(indices.slice(i, i + 3));
  const uv = geometry.getAttribute('uv'), uvs = uv ? Array.from({ length: uv.count }, (_, i) => [uv.getX(i), uv.getY(i)]) : null;
  geometries.push({ id, type: geometry.type, vertices, faces, uvs });
  return id;
};
const materialId = material => {
  if (materialIds.has(material.uuid)) return materialIds.get(material.uuid);
  const id = materials.length; materialIds.set(material.uuid, id);
  materials.push({ id, name: material.name, color: material.userData.offlineColor || material.color?.toArray() || [1, 1, 1],
    emissive: material.emissive?.toArray() || [0, 0, 0], emissiveIntensity: material.emissiveIntensity || 0,
    roughness: material.roughness ?? .8, metalness: material.metalness ?? 0,
    opacity: material.transparent ? material.opacity : 1, doubleSided: material.side === THREE.DoubleSide,
    unlit: Boolean(material.isMeshBasicMaterial), clearcoat: material.clearcoat || 0,
    clearcoatRoughness: material.clearcoatRoughness || 0,
    map: material.map === logoTexture ? 0 : null,
    mapAlphaOnly: Boolean(material.userData.offlineColor) });
  return id;
};
scene.traverseVisible(object => {
  if (!object.isMesh || Array.isArray(object.material) || object.material.colorWrite === false || object.material.opacity <= 0) return;
  const geometry = geometryId(object.geometry), material = materialId(object.material);
  const record = transform => objects.push({ name: object.name || object.parent?.name || 'Mesh',
    geometry, material, matrix: transform.toArray(), metadata: object.userData });
  if (object.isInstancedMesh) {
    for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, instance); matrix.multiplyMatrices(object.matrixWorld, instance); record(matrix); }
  } else record(object.matrixWorld);
});
const renderBox = new THREE.Box3(), point = new THREE.Vector3();
for (const object of objects) {
  matrix.fromArray(object.matrix);
  for (const vertex of geometries[object.geometry].vertices) renderBox.expandByPoint(point.fromArray(vertex).applyMatrix4(matrix));
}
if (!source.equals(await readFile(sourcePath))) throw new Error('Building source changed during export; rerun after edits finish.');
const result = {
  format: 'asc-three-offline-geometry-1', buildingVersion: BUILDING_VERSION,
  source: 'app/warehouse-preview/building.js', sourceSha256: createHash('sha256').update(source).digest('hex'),
  exportedAt: new Date().toISOString(), view, cutaway, units: 'unmeasured-schematic', axes: { up: 'y', east: 'x', south: 'z' },
  inventory: { source: 'none', tireCount: 0, customerRecords: 0 }, staffIllustrative: Boolean(staff),
  topology: BUILDING_TOPOLOGY,
  notes: ['Geometry instantiated directly from repository source; dimensions remain unmeasured.', 'No live or synthetic inventory was loaded.', 'Supplied ASC logo is embedded; optional browser canvas surface textures are omitted.', ...(BUILDING_TOPOLOGY?.integrationReady === false ? [BUILDING_TOPOLOGY.unresolvedReason] : [])],
  bounds: { min: renderBox.min.toArray(), max: renderBox.max.toArray() }, sourceBounds: building.bounds,
  spaces: SPACE_MANIFEST, textures, geometries, materials, objects,
};
await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(result));
staff?.dispose(); building.dispose(); logoTexture.dispose();
console.log(JSON.stringify({ output, geometryCount: geometries.length, materialCount: materials.length, objectCount: objects.length, sourceSha256: result.sourceSha256 }));
