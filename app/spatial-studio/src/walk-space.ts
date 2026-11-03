import * as T from "three";
import { geometry, type Room } from "./canvas-geometry.ts";

type Point = { x: number; z: number };
export type Pose = Point & { y: number; yaw: number; pitch: number };
type Solid = (x: number, z: number, floor: number) => boolean;
const radius = 0.25;
const eyeHeight = 1.52;

export function worldPoint(room: Room, x: number, z: number) {
  return room.rotationY ? { x: room.x + z, z: room.z - x }
    : { x: room.x + x, z: room.z + z };
}

export function walkGeometry(root: T.Group, room: Room) {
  const solids: Solid[] = [];
  const treads: T.Box3[] = [];
  const blocks = (bottom: number, top: number, floor: number) =>
    bottom < floor + eyeHeight && top > floor + 0.14;
  root.updateWorldMatrix(true, true);
  root.traverseVisible(object => {
    if (object.userData.kind === "wall") {
      // Evaluate the actual rotated wall. Its world AABB would fill the triangle.
      const inverse = object.matrixWorld.clone().invert();
      const scale = object.getWorldScale(new T.Vector3());
      const bounds = new T.Box3().setFromObject(object);
      const point = new T.Vector3();
      solids.push((x, z, floor) => {
        if (!blocks(bounds.min.y, bounds.max.y, floor)) return false;
        point.set(x, floor, z).applyMatrix4(inverse);
        return Math.abs(point.x) < 0.5 + radius / scale.x &&
          Math.abs(point.z) < 0.5 + radius / scale.z;
      });
    } else if (object.userData.shelving || object.userData.route || object.userData.kind === "door" || object.userData.kind === "stair") {
      const bounds = new T.Box3().setFromObject(object);
      solids.push((x, z, floor) => blocks(bounds.min.y, bounds.max.y, floor) &&
        x > bounds.min.x - radius && x < bounds.max.x + radius &&
        z > bounds.min.z - radius && z < bounds.max.z + radius);
    } else if (object.parent?.userData.kind === "platform-steps" && object instanceof T.InstancedMesh) {
      const matrix = new T.Matrix4();
      object.geometry.computeBoundingBox();
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);
        matrix.premultiply(object.matrixWorld);
        treads.push(object.geometry.boundingBox!.clone().applyMatrix4(matrix));
      }
    }
  });
  return (x: number, z: number, racks: readonly Point[]) => {
    if (!geometry.hasBuildingFloor(room.id, x, z, radius)) return null;
    if (racks.some(r => Math.hypot(r.x - x, r.z - z) < radius + 0.26)) return null;
    const world = worldPoint(room, x, z);
    const deck = room.platform;
    let y = room.y;
    if (deck && Math.abs(x - deck.x) <= deck.w / 2 && Math.abs(z - deck.z) <= deck.d / 2) y += deck.rise;
    for (const step of treads) {
      if (world.x >= step.min.x && world.x <= step.max.x && world.z >= step.min.z && world.z <= step.max.z)
        y = Math.max(y, step.max.y);
    }
    return solids.some(blocked => blocked(world.x, world.z, y)) ? null : y;
  };
}

export type Floor = ReturnType<typeof walkGeometry>;

export function startWalk(room: Room, floor: Floor, racks: readonly Point[]): Pose | null {
  // Prefer a viewpoint along the long aisle. Test each candidate against the
  // real floor, including shelves, rotated walls, voids and live rack positions.
  const target = room.floorRects[0] || { x: room.width / 6, z: room.depth / 6 };
  for (let row = 0; row < 28; row++) {
    const z = (0.35 - row / 32) * room.depth;
    for (let i = 0; i <= 26; i++) {
      const x = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * room.width / 28;
      const y = floor(x, z, racks);
      if (y !== null) return { x, z, y, yaw: Math.atan2(target.x - x, z - target.z), pitch: -0.14 };
    }
  }
  return null;
}

export function advance(pose: Pose, distance: number, strafe: number, floor: Floor, racks: readonly Point[]) {
  const dx = Math.sin(pose.yaw) * distance + Math.cos(pose.yaw) * strafe;
  const dz = -Math.cos(pose.yaw) * distance + Math.sin(pose.yaw) * strafe;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.085));
  // Slide along blocked edges and never tunnel through a wall on a slow frame.
  for (let i = 0; i < steps; i++) {
    for (const [sx, sz] of [[dx / steps, 0], [0, dz / steps]]) {
      const x = pose.x + sx, z = pose.z + sz, y = floor(x, z, racks);
      if (y !== null && Math.abs(y - pose.y) < 0.28) Object.assign(pose, { x, y, z });
    }
  }
}
export const WALK_EYE_HEIGHT = eyeHeight;

export function createWalker(room: Room, root: T.Group, racks: readonly Point[]) {
  const floor = walkGeometry(root, room);
  const pose = startWalk(room, floor, racks);
  const listeners = new Set<() => void>();
  return {
    pose,
    racks,
    subscribe(fn: () => void) {
      listeners.add(fn);
      fn();
      return () => { listeners.delete(fn); };
    },
    move(distance: number, strafe: number, yaw: number, pitch = 0) {
      if (!pose) return;
      pose.yaw += yaw;
      pose.pitch = Math.max(-1.1, Math.min(1.05, pose.pitch + pitch));
      if (distance || strafe) advance(pose, distance, strafe, floor, this.racks);
      for (const fn of listeners) fn();
    },
  };
}
export type Walker = ReturnType<typeof createWalker>;
