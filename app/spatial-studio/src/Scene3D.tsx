import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Canvas as Scene,
  useThree,
  useFrame,
  type ThreeEvent,
} from "@react-three/fiber";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  capacityColor,
  geometry,
  isPlaceable,
  type RackShape,
  type Room,
} from "./canvas-geometry";
import {WalkRig, type WalkInput} from "./WalkRig";
import {walkGeometry, type Floor} from "./walk-space";
// @ts-ignore -- the warehouse and studio share this eight-corner perspective solver.
import {fitPerspectiveBounds} from "../../warehouse-preview/presentation.js";
import type {CanvasProps} from "./Canvas";
type Item = { rack: RackShape; pos: T.Vector3; dim: boolean };
type Wall = {world:T.Box3; local:T.Box3; matrix:T.Matrix4; inverse:T.Matrix4; scale:T.Vector3};
function Rig({
  room,
  selected,
  reset,
  wallBounds,
}: {
  room: Room;
  selected: T.Vector3 | null;
  reset: number;
  wallBounds: React.RefObject<Wall[]>;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const ctl = useRef<OrbitControls | null>(null);
  const aspect = size.width / Math.max(1,size.height);
  const touched = useRef(false);
  const point = useMemo(()=>new T.Vector3(),[]);
  const goal = useRef<{ eye: T.Vector3; target: T.Vector3 } | null>(null);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    ctl.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.14;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = Math.max(room.width, room.depth) * 4;
    controls.enablePan = true;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = false;
    controls.mouseButtons.LEFT = T.MOUSE.PAN;
    controls.mouseButtons.RIGHT = T.MOUSE.ROTATE;
    controls.touches.ONE = T.TOUCH.PAN;
    controls.touches.TWO = T.TOUCH.DOLLY_ROTATE;
    const el = gl.domElement;
    el.tabIndex = 0;
    el.setAttribute("aria-label","3D prikaz. Povucite za pomak, desnom tipkom za okretanje. Strelice pomiču pogled.");
    controls.listenToKeyEvents(el);
    const focusCanvas = () => el.focus({preventScroll:true});
    el.addEventListener("pointerdown",focusCanvas);
    const change = () => invalidate();
    const interrupt = () => {
      goal.current = null; touched.current = true;
    };
    controls.addEventListener("change", change);
    controls.addEventListener("start", interrupt);
    controls.update();
    return () => {
      el.removeEventListener("pointerdown", focusCanvas);
      controls.removeEventListener("change", change);
      controls.removeEventListener("start", interrupt);
      controls.dispose();
      ctl.current = null;
      goal.current = null;
    };
  }, [room, camera, gl, invalidate]);
  useEffect(() => { touched.current = false; },[reset,room]);
  useEffect(() => {
    const controls = ctl.current;
    if (!controls || touched.current) return;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = true;
    const bounds = geometry.getSpaceBounds(room.id);
    if(!bounds) return;
    const fit = fitPerspectiveBounds(bounds,{direction:[.78,.93,1.12],fov:46,aspect,padding:.88});
    camera.position.fromArray(fit.position);
    controls.target.fromArray(fit.target);
    controls.maxDistance=Math.max(controls.maxDistance,fit.distance*2);
    controls.update();
    invalidate();
  }, [room, camera, reset, aspect, invalidate]);
  const sx=selected?.x, sy=selected?.y, sz=selected?.z;
  useEffect(() => {
    if (sx === undefined || sy === undefined || sz === undefined || !ctl.current) {
      goal.current = null;
      return;
    }
    const target = new T.Vector3(sx,sy+0.45,sz);
    touched.current=true;
    const dir = camera.position.clone().sub(ctl.current.target).normalize();
    goal.current = {
      eye: target
        .clone()
        .addScaledVector(dir, Math.min(8, Math.max(3, room.width * 0.45))),
      target,
    };
    invalidate();
  }, [sx, sy, sz, camera, room, invalidate]);
  useFrame((_, dt) => {
    const c = ctl.current;
    if (!c) return;
    const g = goal.current;
    if (g) {
      const alpha = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? 1
        : 1 - Math.exp(-7 * Math.min(dt, 0.15));
      camera.position.lerp(g.eye, alpha);
      c.target.lerp(g.target, alpha);
      if (
        camera.position.distanceToSquared(g.eye) < 0.0004 &&
        c.target.distanceToSquared(g.target) < 0.0004
      )
        goal.current = null;
      else invalidate();
    }
    c.update();
    // Pad solid wall volumes by the near plane clearance. Keep the orbit eye on
    // the outside of structural surfaces, including invisible-cutaway transitions.
    for (const wall of wallBounds.current) {
      if (!wall.world.containsPoint(camera.position)) continue;
      const pos = point.copy(camera.position).applyMatrix4(wall.inverse);
      const box = wall.local;
      if (!box.containsPoint(pos)) continue;
      let axis: "x" | "y" | "z" = "x",
        value = pos.x,
        best = Infinity;
      for (const k of ["x", "y", "z"] as const) {
        for (const boundary of [box.min[k] - .01/wall.scale[k], box.max[k] + .01/wall.scale[k]]) {
          const distance = Math.abs(boundary - pos[k])*wall.scale[k];
          if (distance < best) {
            best = distance;
            axis = k;
            value = boundary;
          }
        }
      }
      pos[axis] = value;
      camera.position.copy(pos.applyMatrix4(wall.matrix));
      camera.lookAt(c.target);
      goal.current = null;
      invalidate();
    }
  });
  return null;
}
function Architecture({
  id,
  placing,
  onPick,
  walking,
  obstacles,
  wallBounds,
}: {
  id: string;
  walking: boolean;
  obstacles: React.RefObject<Floor | null>;
  placing: boolean;
  onPick: (x: number, z: number) => void;
  wallBounds: React.RefObject<Wall[]>;
}) {
  const building = useMemo(() => geometry.createBuilding(T), []);
  const { invalidate, raycaster } = useThree();
  useLayoutEffect(() => {
    building.setView(id);
    building.setCutaway(walking ? "closed" : "review");
    building.root.updateWorldMatrix(true, true);
    const boxes: Wall[] = [];
    building.root.traverseVisible((o) => {
      if (!(o instanceof T.Mesh) || o.userData.kind!=="wall") return;
      o.geometry.computeBoundingBox();
      const scale=o.getWorldScale(new T.Vector3());
      const local=o.geometry.boundingBox.clone().expandByVector(new T.Vector3(.12/scale.x,.12/scale.y,.12/scale.z));
      boxes.push({world:local.clone().applyMatrix4(o.matrixWorld),local,matrix:o.matrixWorld.clone(),inverse:o.matrixWorld.clone().invert(),scale});
    });
    wallBounds.current = boxes;
    const room = geometry.getSpace(id);
    obstacles.current = walking && room ? walkGeometry(building.root,room) : null;
    invalidate();
  }, [building, id, walking, obstacles, wallBounds, invalidate]);
  useEffect(() => () => building.dispose(), [building]);
  const pick = (ev: ThreeEvent<MouseEvent>) => {
    if (!placing || ev.delta > 5) return;
    const hits = raycaster.intersectObjects(
      building.targets.filter((t) => t.userData.spaceId === id),
      false,
    );
    if (hits[0]) {
      ev.stopPropagation();
      onPick(hits[0].point.x, hits[0].point.z);
    }
  };
  return (
    <primitive
      object={building.root}
      dispose={null}
      onClick={placing ? pick : undefined}
    />
  );
}
// One shared steel-column buffer across every populated spatial bucket.
const markerGeometry = (() => {
  const pieces: T.BufferGeometry[] = [];
  for (const x of [-.145, .145]) for (const z of [-.145, .145]) {
    pieces.push(new T.BoxGeometry(.036, .88, .036).translate(x, 0, z));
  }
  for (const y of [-.41, -.02, .41]) {
    pieces.push(new T.BoxGeometry(.326, .035, .326).translate(0, y, 0));
  }
  const shared = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  return shared;
})();
function Batch({
  items,
  onPick,
  onHover,
}: {
  items: Item[];
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const ref = useRef<T.InstancedMesh>(null);
  const { invalidate } = useThree();
  const dim = items[0].dim;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new T.Matrix4(),
      color = new T.Color();
    for (const [i, item] of items.entries()) {
      matrix.makeTranslation(item.pos.x, item.pos.y + 0.46, item.pos.z);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(capacityColor(item.rack)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [items, invalidate]);
  const hit = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? null : items[e.instanceId]?.rack.id;
  return (
    <instancedMesh
      ref={ref}
      args={[markerGeometry, undefined, items.length]}
      onPointerMove={(e) => {
        const id = hit(e);
        if (id) {
          e.stopPropagation();
          onHover(id);
        }
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        const id = hit(e);
        if (id && e.delta < 5) {
          e.stopPropagation();
          onPick(id);
        }
      }}
    >
      <meshStandardMaterial
        roughness={0.38}
        metalness={0.42}
        transparent={dim}
        opacity={dim ? 0.15 : 1}
        depthWrite={!dim}
      />
    </instancedMesh>
  );
}
function Stage(
  p: CanvasProps & {
    room: Room;
    input: React.RefObject<WalkInput>;
    onWalkBlocked: () => void;
    onUnavailable: () => void;
    warn: (s: string) => void;
  },
) {
  const { room } = p;
  const wallBounds = useRef<Wall[]>([]), obstacles = useRef<Floor | null>(null);
  const { gl } = useThree();
  const lightTarget=useMemo(()=>{
    const target=new T.Object3D();
    target.position.set(room.x,room.y,room.z);
    return target;
  },[room]);
  const shadowExtent=Math.max(room.width,room.depth)*.72+2;
  useLayoutEffect(()=>{
    // Geometry is static within a room. Camera movement reuses the light map.
    gl.shadowMap.autoUpdate=false;
    gl.shadowMap.needsUpdate=true;
  },[gl,room,p.mode]);
  useEffect(() => {
    const lost = (e: Event) => {
      e.preventDefault();
      p.onUnavailable();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, p.onUnavailable]);
  const [hover, setHover] = useState<string | null>(null);
  const matches = useMemo(
    () => (p.matchIds ? new Set(p.matchIds) : null),
    [p.matchIds],
  );
  const { buckets, index } = useMemo(() => {
    const buckets = new Map<string, Item[]>(),
      index = new Map<string, Item>();
    for (const rack of p.racks) {
      const pos = geometry.mapAreaPoint(p.spaceId, p, rack.x, rack.z, 0.27);
      if (!pos) continue;
      const dim = !!matches && !matches.has(rack.id);
      const item = { rack, pos: new T.Vector3(pos.x, pos.y, pos.z), dim };
      index.set(rack.id, item);
      const key = `${Math.floor(pos.x / 5)},${Math.floor(pos.z / 5)},${dim}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }
    return { buckets, index };
  }, [p.racks, p.width, p.depth, p.spaceId, matches]);
  const rackSolids = useMemo(() => [...index.values()].map(({rack}) =>
    ({x:rack.x*room.width/p.width,z:rack.z*room.depth/p.depth})), [index, room, p.width, p.depth]);
  const selected = index.get(p.selectedId || "")?.pos ?? null,
    active = index.get(hover || p.selectedId || "");
  const place = (x: number, z: number) => {
    const local = geometry.unmapAreaPoint(p.spaceId, p, x, z);
    if (local && isPlaceable(p.spaceId, p, local.x, local.z, p.racks)) {
      p.warn("");
      p.onPlace(local.x, local.z);
    } else p.warn("Odaberite slobodan dio čvrstog poda.");
  };
  return (
    <>
      <color attach="background" args={["#bdcecb"]} />
      <ambientLight intensity={.45} />
      <hemisphereLight args={["#e6f0ed", "#8a715b", 1.0]} />
      <primitive object={lightTarget}/>
      <directionalLight
        target={lightTarget}
        position={[room.x+11,room.y+18,room.z+8]} color="#fff1d6" intensity={2.55}
        castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={.3} shadow-camera-far={90} shadow-normalBias={.027}
        shadow-bias={-.0003}
      />
      <directionalLight
        position={[room.x - 7, room.y + 8, room.z - 7]}
        target={lightTarget} color="#c9e4ef" intensity={.62}
      />
      <gridHelper
        args={[90, 90, "#8fa8a4", "#a8bdb9"]}
        position={[room.x, room.y - 0.24, room.z]}
      />
      <Architecture
        id={p.spaceId}
        wallBounds={wallBounds}
        walking={p.mode==="walk"} obstacles={obstacles}
        placing={p.placing}
        onPick={place}
      />
      {[...buckets].map(([key, items]) => (
        <Batch
          key={key}
          items={items}
          onPick={(id) => {
            if (!p.placing) p.onSelect(id);
            else p.warn("Ovdje već postoji regal.");
          }}
          onHover={setHover}
        />
      ))}
      {active && (
        <group position={active.pos}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
            <ringGeometry args={[0.31, 0.39, 40]} />
            <meshBasicMaterial
              color="#176259"
              toneMapped={false}
              side={T.DoubleSide}
            />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <cylinderGeometry args={[0.278, 0.294, 0.94, 12, 1]} />
            <meshBasicMaterial wireframe color="#abffdc" toneMapped={false} />
          </mesh>
        </group>
      )}
      {p.mode==="walk" ?
        <WalkRig room={room} obstacles={obstacles} racks={rackSolids} input={p.input} reset={p.reset ?? 0} blocked={p.onWalkBlocked}/> :
        <Rig room={room} selected={selected} reset={p.reset ?? 0} wallBounds={wallBounds} />}
    </>
  );
}
export default function Scene3D(p: Parameters<typeof Stage>[0]) {
  return <Scene dpr={[1,1.6]} frameloop="demand" shadows="percentage"
    gl={{antialias:true,powerPreference:"low-power"}}
    camera={{fov:46,near:.07,far:800}}>
    <Stage {...p}/>
  </Scene>;
}
