import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../app/warehouse-preview/vendor/three.module.js';
import { createStaff, officeSeatsFromBuilding, STAFF_IS_ILLUSTRATIVE, STAFF_PROFILES } from '../app/warehouse-preview/staff.js';
import { createBuilding } from '../app/warehouse-preview/building.js';

test('ambient people are explicitly illustrative and cannot intercept inventory picking', () => {
  const staff = createStaff(THREE);
  assert.equal(STAFF_IS_ILLUSTRATIVE, true);
  assert.equal(staff.root.visible, false, 'explicit opt-in before visible animation');
  assert.equal(staff.root.children.length, 3, 'office figures require real scene seat anchors');
  assert.deepEqual(STAFF_PROFILES.map(profile => profile.name), ['Marin', 'Nikša', 'Chris', 'Mladenka', 'Ured']);
  staff.update(0, true);
  const rays = new THREE.Raycaster(new THREE.Vector3(-19.5, 1, 30), new THREE.Vector3(0, 0, -1));
  staff.root.updateMatrixWorld(true);
  assert.deepEqual(rays.intersectObject(staff.root, true), []);
  assert.equal(staff.root.userData.livePresence, false);
  for (const figure of staff.root.children) assert.equal(figure.userData.livePresence, false);
  staff.root.traverse(object => {
    if (object.isMesh) assert.equal(object.userData.illustrative, true);
  });
  staff.dispose();
});

test('office figures follow constructed chair anchors instead of stale room coordinates', () => {
  const building = createBuilding(THREE);
  const seats = officeSeatsFromBuilding(THREE, building.root);
  assert.equal(seats.length, 2);
  const staff = createStaff(THREE, { paths: [], buildingRoot: building.root });
  assert.equal(staff.root.children.length, 2);
  staff.update(0, true);
  staff.root.children.forEach((figure, index) => {
    assert.deepEqual(figure.position.toArray(), seats[index].position);
    assert.equal(figure.userData.pose, 'seated');
    assert.ok(Number.isFinite(figure.rotation.y));
  });
  staff.dispose(); building.dispose();
});

test('walkers stay on approved horizontal paths; seats stay fixed', () => {
  const staff = createStaff(THREE, {
    paths: [[[1, 0, 21], [3, 0, 21], [3, 0, 23]]],
    officePositions: [{ position: [-5, 3.2, -6], rotation: Math.PI / 2 }],
  });
  let moved = false;
  for (let frame = 0; frame < 6000; frame++) {
    staff.update(frame / 60, true);
    const { x, y, z } = staff.root.children[0].position;
    assert.equal(y, 0);
    assert.ok(x >= 1 && x <= 3 && z >= 21 && z <= 23);
    assert.ok(Math.abs(z - 21) < 1e-9 || Math.abs(x - 3) < 1e-9, 'never cuts diagonally across the corner');
    moved ||= x > 1.1;
    assert.deepEqual(staff.root.children[1].position.toArray(), [-5, 3.2, -6]);
  }
  assert.ok(moved);
  staff.dispose();
});

test('office staff follow room visibility and cannot float above a hidden upper assembly', () => {
  const building = createBuilding(THREE);
  const staff = createStaff(THREE, { buildingRoot: building.root });
  building.setView('all'); staff.update(0, true);
  assert.equal(staff.root.visible, true, 'exterior workers remain available');
  assert.ok(staff.root.children.filter(figure => figure.userData.pose === 'seated').every(figure => !figure.visible));
  building.setView('upper-assembly'); staff.update(.1, true);
  assert.ok(staff.root.children.filter(figure => figure.userData.pose === 'seated').every(figure => figure.visible));
  staff.update(.2, { enabled: true, officeVisible: false });
  assert.ok(staff.root.children.filter(figure => figure.userData.pose === 'seated').every(figure => !figure.visible));
  staff.dispose();
  const officeOnly = createStaff(THREE, { buildingRoot: building.root, paths: [] });
  assert.equal(officeOnly.update(0, { enabled: true, officeVisible: false }), false, 'no animation frames requested for an entirely hidden group');
  assert.equal(officeOnly.root.visible, false);
  officeOnly.dispose(); building.dispose();
});

test('focus, disabled mode and reduced motion hide and freeze the figures', () => {
  const staff = createStaff(THREE);
  staff.update(0, true); staff.update(.1, true);
  const before = staff.root.children[0].position.clone();
  for (const state of [false, { enabled: true, focused: true }, { enabled: true, reducedMotion: true }]) {
    assert.equal(staff.update(300, state), false);
    assert.equal(staff.root.visible, false);
    assert.deepEqual(staff.root.children[0].position.toArray(), before.toArray());
  }
  staff.update(900, true);
  assert.deepEqual(staff.root.children[0].position.toArray(), before.toArray(), 'resume must not jump through hidden time');
  staff.dispose();
  const reduced = createStaff(THREE, { reducedMotion: true });
  assert.equal(reduced.update(1, true), false);
  assert.equal(reduced.root.visible, false);
  assert.equal(reduced.update(2, { enabled: true, reducedMotion: false }), true, 'a changed system preference replaces the initial snapshot');
  assert.equal(reduced.root.visible, true);
  reduced.dispose();
});

test('invalid routes are omitted and explicit empty groups remain empty', () => {
  const empty = createStaff(THREE, { paths: [], officePositions: [] });
  assert.equal(empty.root.children.length, 0);
  assert.equal(empty.update(0, true), false);
  empty.dispose();
  const invalid = createStaff(THREE, {
    paths: [[[0, 0, 0], [1, 3.2, 0]], [[NaN, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 0, 0]]],
    officePositions: [{ position: [1, Infinity, 1] }],
  });
  assert.equal(invalid.root.children.length, 0);
  invalid.dispose();
});

test('population is bounded and disposal releases shared resources exactly once', () => {
  const staff = createStaff(THREE, {
    paths: Array.from({ length: 12 }, () => [[0, 0, 21], [1, 0, 21]]),
    officePositions: Array.from({ length: 12 }, () => ({ position: [-5, 3.2, -6] })),
  });
  assert.equal(staff.root.children.length, 5);
  const resources = new Set();
  staff.root.traverse(object => { if (object.isMesh) { resources.add(object.geometry); resources.add(object.material); } });
  const counts = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
  const scene = new THREE.Scene(); scene.add(staff.root);
  staff.dispose(); staff.dispose();
  assert.equal(staff.root.parent, null);
  assert.equal(staff.root.children.length, 0);
  assert.equal(staff.update(100, true), false);
  for (const resource of resources) assert.equal(counts.get(resource), 1);
});
