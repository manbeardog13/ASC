import test from "node:test";
import assert from "node:assert/strict";
import { geometry, isPlaceable, capacityColor, operatorPlan, supported } from "./canvas-geometry.ts";

test("studio place/select coordinates round-trip through all six approved room transforms", () => {
  for (const [id, x, z] of [
    ["house-ground", 0, 0],
    ["house-platform", 0, 2],
    ["house-attic", 1, -2],
    ["attic-parts", -4, -9],
    ["attic-racks", 0, -3],
    ["triangular-store", 1, 2],
  ]) {
    const r = geometry.getSpace(id);
    assert.ok(r);
    const point = geometry.mapAreaPoint(id, r, x, z, 0.27);
    assert.ok(point);
    const local = geometry.unmapAreaPoint(id, r, point.x, point.z);
    assert.ok(local && Math.hypot(local.x - x, local.z - z) < 1e-8);
    assert.equal(isPlaceable(id, r, x, z, []), true);
    assert.equal(isPlaceable(id, r, x, z, [{ x: x + 0.2, z }]), false);
  }
});
test("picking refuses the office notch, triangular void, raised deck edge and unsupported ground", () => {
  for (const [id, x, z] of [
    ["attic-parts", 2, -9],
    ["triangular-store", -2, -3],
    ["house-platform", 3, 0],
    ["attic-racks", -2.8, -4],
  ]) {
    assert.equal(isPlaceable(id, geometry.getSpace(id), x, z, []), false);
  }
  assert.equal(
    isPlaceable("office", geometry.getSpace("office"), 0, 0, []),
    false,
  );
});
test("occupancy scale includes 40% and 85% as amber, and distinguishes missing data from empty", () => {
  const c = (occupied) => capacityColor({ capacity: 100, occupied });
  assert.notEqual(c(39), c(40));
  assert.equal(c(40), c(85));
  assert.notEqual(c(85), c(86));
  assert.notEqual(c(null), c(0));
});

test("unbound operator space uses only its saved dimensions and solid footprint", () => {
 const id="area:5226", area={width:9,depth:5};
 assert.deepEqual(operatorPlan(id,area).floorRects,[{x:0,z:0,w:9,d:5}]);
 assert.equal(isPlaceable(id,area,0,2,[]),true);
 assert.equal(isPlaceable(id,area,0,2,[{x:0,z:2.25}]),false);
 assert.equal(supported(id,area,4.3,0),false);
 assert.equal(operatorPlan(id,{width:Infinity,depth:0}),null);
 assert.equal(isPlaceable("unknown",area,0,0,[]),false);
});
