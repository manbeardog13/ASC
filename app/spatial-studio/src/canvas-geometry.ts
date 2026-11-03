import type * as T from "three";
// The existing application owns these footprints, transforms, and shared meshes.
// @ts-ignore -- legacy JS module has no declaration file.
import * as original from "../../warehouse-preview/building.js";
export type RackShape = {
  id: string;
  label: string;
  x: number;
  z: number;
  capacity: number;
  occupied: number | null;
};
export type Rect = { x: number; z: number; w: number; d: number };
export type Room = {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  rotationY?: number;
  floorRects: Rect[];
  floorPolygon?: [number, number][];
  platform?: Rect & { rise: number };
};
type Area = { width: number; depth: number };
export const geometry = original as {
  getSpace: (id: string) => Room | null;
  getSpaceBounds: (id:string) => {min:number[];max:number[]} | null;
  hasBuildingFloor: (id: string, x: number, z: number, radius: number) => boolean;
  mapAreaPoint: (
    id: string,
    a: Area,
    x: number,
    z: number,
    r: number,
  ) => { x: number; y: number; z: number } | null;
  unmapAreaPoint: (
    id: string,
    a: Area,
    x: number,
    z: number,
  ) => { x: number; z: number } | null;
  createBuilding: (three: typeof T) => {
    root: T.Group;
    targets: T.Mesh[];
    setView: (id: string) => void;
    setCutaway: (mode: string) => void;
    dispose: () => void;
  };
};
export const capacityColor = (v: RackShape) =>
  v.occupied == null || !(v.capacity > 0)
    ? "#7a8a92"
    : v.occupied / v.capacity < 0.4
      ? "#41ce9a"
      : v.occupied / v.capacity <= 0.85
        ? "#edb852"
        : "#ed556d";
/** Unbound operator areas use their persisted rectangle, never a guessed physical room. */
export function operatorPlan(id: string, a: Area): Room | null {
  if (!id.startsWith("area:") || id.length <= 5 || ![a.width, a.depth].every(n => Number.isFinite(n) && n > 0)) return null;
  return { id, x:0, y:0, z:0, width:a.width, depth:a.depth, floorRects:[{x:0,z:0,w:a.width,d:a.depth}] };
}
export function supported(id:string, a:Area, x:number, z:number): boolean {
  if (id.startsWith("area:")) return !!operatorPlan(id, a) && Number.isFinite(x) && Number.isFinite(z) && Math.abs(x)+.27<=a.width/2+1e-8 && Math.abs(z)+.27<=a.depth/2+1e-8;
  return !!geometry.mapAreaPoint(id,a,x,z,.27);
}
export function isPlaceable(
  id: string,
  a: Area,
  x: number,
  z: number,
  racks: readonly RackShape[],
) {
  return (
    supported(id, a, x, z) &&
    !racks.some((r) => Math.hypot(x - r.x, z - r.z) < 0.54 - 1e-8)
  );
}
