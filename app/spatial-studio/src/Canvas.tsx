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
  supported,
  operatorPlan,
  type RackShape,
  type Room,
} from "./canvas-geometry";
import { createWalker, type Walker } from "./walk-space";
import { WalkCamera, WalkControls, WalkMarker } from "./WalkControls";
import "./canvas.css";
type Building = ReturnType<typeof geometry.createBuilding>;
export type CanvasProps = {
  spaceId: string;
  width: number;
  depth: number;
  racks: readonly RackShape[];
  selectedId: string | null;
  matchIds?: readonly string[] | null;
  placing: boolean;
  onSelect: (id: string) => void;
  onPlace: (x: number, z: number) => void;
  mode?: "3d" | "plan" | "walk";
};
export type CanvasRack = RackShape;
type Item = { rack: RackShape; pos: T.Vector3; dim: boolean };
function Rig({
  room,
  selected,
  wallBounds,
}: {
  room: Room;
  selected: T.Vector3 | null;
  wallBounds: React.RefObject<T.Box3[]>;
}) {
  const { camera, gl, size, invalidate } = useThree();
  const ctl = useRef<OrbitControls | null>(null);
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
    controls.enablePan = false;
    controls.zoomToCursor = false;
    const change = () => invalidate();
    const interrupt = () => {
      goal.current = null;
    };
    controls.addEventListener("change", change);
    controls.addEventListener("start", interrupt);
    const focus = new T.Vector3(room.x, room.y + 0.45, room.z);
    const aspect = size.width / Math.max(1, size.height),
      span = Math.max(room.width, room.depth, 6);
    const dist = span * (aspect < 1 ? 1.38 / aspect : 1.28);
    camera.position
      .copy(focus)
      .addScaledVector(new T.Vector3(0.78, 0.93, 1.12).normalize(), dist);
    controls.target.copy(focus);
    controls.update();
    invalidate();
    return () => {
      controls.removeEventListener("change", change);
      controls.removeEventListener("start", interrupt);
      controls.dispose();
      ctl.current = null;
      goal.current = null;
    };
  }, [room, camera, gl, size.width, size.height, invalidate]);
  useEffect(() => {
    if (!selected || !ctl.current) {
      goal.current = null;
      return;
    }
    const target = selected.clone().add(new T.Vector3(0, 0.45, 0));
    const dir = camera.position.clone().sub(ctl.current.target).normalize();
    goal.current = {
      eye: target
        .clone()
        .addScaledVector(dir, Math.min(8, Math.max(3, room.width * 0.45))),
      target,
    };
    invalidate();
  }, [selected, camera, room, invalidate]);
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
    for (const box of wallBounds.current) {
      const pos = camera.position;
      if (!box.containsPoint(pos)) continue;
      let axis: "x" | "y" | "z" = "x",
        value = pos.x,
        best = Infinity;
      for (const k of ["x", "y", "z"] as const) {
        for (const boundary of [box.min[k] - 0.01, box.max[k] + 0.01]) {
          const distance = Math.abs(boundary - pos[k]);
          if (distance < best) {
            best = distance;
            axis = k;
            value = boundary;
          }
        }
      }
      pos[axis] = value;
      camera.lookAt(c.target);
      goal.current = null;
      invalidate();
    }
  });
  return null;
}
function Architecture({
  building,
  id,
  placing,
  onPick,
  wallBounds,
}: {
  building: Building;
  id: string;
  placing: boolean;
  onPick: (x: number, z: number) => void;
  wallBounds: React.RefObject<T.Box3[]>;
}) {
  const { invalidate, raycaster } = useThree();
  useLayoutEffect(() => {
    building.root.updateWorldMatrix(true, true);
    const boxes: T.Box3[] = [];
    building.root.traverseVisible((o) => {
      if (o.userData.kind === "wall")
        boxes.push(new T.Box3().setFromObject(o).expandByScalar(0.12));
    });
    wallBounds.current = boxes;
    invalidate();
  }, [building, id, wallBounds, invalidate]);
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
    building: Building;
    walker: Walker | null;
    room: Room;
    onUnavailable: () => void;
    warn: (s: string) => void;
  },
) {
  const { room } = p;
  const wallBounds = useRef<T.Box3[]>([]);
  const { gl, invalidate } = useThree();
  // A faint grid on the existing pick surfaces makes movement legible on the
  // bare schematics. Voids and shelves keep their actual silhouettes.
  useLayoutEffect(() => {
    if (!p.walker) return;
    const lines = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      vertexShader: `varying vec2 plan;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.);
          plan = world.xz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `varying vec2 plan;
        void main() {
          vec2 w = max(fwidth(plan), vec2(.0001));
          vec2 grid = abs(fract(plan + .5) - .5) / w;
          float edge = 1. - min(min(grid.x, grid.y), 1.);
          float fade = 1. - smoothstep(.04, .22, max(w.x, w.y));
          gl_FragColor = vec4(.16,.20,.19,.13 * edge * fade);
        }`,
    });
    const surfaces = p.building.targets.filter(t => t.userData.spaceId === p.spaceId);
    const original = surfaces.map(t => t.material);
    for (const surface of surfaces) surface.material = lines;
    invalidate();
    return () => {
      surfaces.forEach((surface,i) => {surface.material = original[i]});
      lines.dispose();
    };
  }, [p.walker, p.building, p.spaceId, invalidate]);
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
  const selected = index.get(p.selectedId || "")?.pos ?? null,
    active = index.get(hover || p.selectedId || "");
  const place = (x: number, z: number) => {
    const local = geometry.unmapAreaPoint(p.spaceId, p, x, z);
    if (local && isPlaceable(p.spaceId, p, local.x, local.z, p.racks)) {
      p.warn("");
      p.onPlace(local.x, local.z);
    } else p.warn("Odaberite slobodan dio čvrstog poda.");
  };
  const walk = !!p.walker;
  const span = Math.max(room.width,room.depth) * 0.65;
  const sunTarget = useMemo(() => {
    const target = new T.Object3D();
    if (walk) target.position.set(room.x,room.y,room.z);
    return target;
  }, [room,walk]);
  return (
    <>
      <color attach="background" args={[walk ? "#333e42" : "#111719"]} />
      {walk && <fog attach="fog" args={["#647171", 14, 58]} />}
      <ambientLight intensity={walk ? 0.39 : 1.3} />
      <hemisphereLight args={["#e4ecf4", walk ? "#645950" : "#707376", walk ? 0.95 : 1.7]} />
      <primitive object={sunTarget} />
      <directionalLight
        position={[room.x + 8, room.y + 15, room.z + 11]}
        target={sunTarget}
        intensity={walk ? 1.85 : 2.6}
        color={walk ? "#ffecd4" : "#ffffff"}
        castShadow={walk}
        shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-left={-span} shadow-camera-right={span}
        shadow-camera-top={span} shadow-camera-bottom={-span}
        shadow-camera-near={0.1} shadow-camera-far={65}
        shadow-normalBias={0.025} shadow-bias={-0.0002}
      />
      <directionalLight
        position={[room.x - 7, room.y + 8, room.z - 7]}
        color="#a2c9ff"
        intensity={walk ? 0.36 : 1.1}
      />
      <gridHelper
        args={[90, 90, "#526264", "#303c3c"]}
        position={[room.x, room.y - 0.24, room.z]}
      />
      <Architecture
        building={p.building}
        id={p.spaceId}
        wallBounds={wallBounds}
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
              color="#aaffde"
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
      {p.walker ? <WalkCamera room={room} walker={p.walker} /> :
        <Rig room={room} selected={selected} wallBounds={wallBounds} />}
    </>
  );
}
function Plan(p: CanvasProps & { room: Room; walker?: Walker | null; warn: (s: string) => void }) {
  const s = p.room,
    hw = s.width / 2,
    hd = s.depth / 2,
    pad = Math.max(s.width, s.depth) * 0.08;
  const svg = useRef<SVGSVGElement>(null);
  const matches = useMemo(
    () => (p.matchIds ? new Set(p.matchIds) : null),
    [p.matchIds],
  );
  function pick(e: React.MouseEvent<SVGSVGElement>) {
    if (!p.placing || !svg.current) return;
    const m = svg.current.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const x = (pt.x * p.width) / s.width,
      z = (pt.y * p.depth) / s.depth;
    if (isPlaceable(p.spaceId, p, x, z, p.racks)) {
      p.warn("");
      p.onPlace(x, z);
    } else p.warn("Odaberite slobodan dio čvrstog poda.");
  }
  return (
    <svg
      className="asc-map-plan"
      ref={svg}
      viewBox={`${-hw - pad} ${-hd - pad} ${s.width + 2 * pad} ${s.depth + 2 * pad}`}
      role="group"
      aria-label="Tlocrt prostora i označeni regali"
      onClick={pick}
    >
      <defs>
        <pattern
          id="ascmapgrid"
          width="1"
          height="1"
          patternUnits="userSpaceOnUse"
        >
          <rect width="1" height="1" fill="#202d30" />
          <path d="M0 1V0H1" fill="none" stroke="#445450" strokeWidth=".034" />
        </pattern>
      </defs>
      <g fill="url(#ascmapgrid)" stroke="#8d9e9a" strokeWidth=".055">
        {s.floorRects.map((r, i) => (
          <rect
            key={i}
            x={r.x - r.w / 2}
            y={r.z - r.d / 2}
            width={r.w}
            height={r.d}
          />
        ))}
        {s.floorPolygon && (
          <polygon
            points={s.floorPolygon.map((pt) => pt.join(",")).join(" ")}
          />
        )}
      </g>
      {s.platform && (
        <rect
          x={s.platform.x - s.platform.w / 2}
          y={s.platform.z - s.platform.d / 2}
          width={s.platform.w}
          height={s.platform.d}
          stroke="#c9b08a"
          fill="#b29a73"
          fillOpacity={0.15}
          strokeDasharray=".2 .1"
          strokeWidth=".06"
        />
      )}
      {p.racks.map((r) => {
        if (!supported(p.spaceId, p, r.x, r.z)) return null;
        return (
          <g
            key={r.id}
            tabIndex={0}
            role="button"
            aria-label={`${r.label}: ${r.occupied == null ? "nepoznata popunjenost" : r.occupied + " od " + r.capacity}`}
            aria-pressed={p.selectedId === r.id}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                p.onSelect(r.id);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!p.placing) p.onSelect(r.id);
              else p.warn("Ovdje već postoji regal.");
            }}
            transform={`translate(${(r.x * s.width) / p.width} ${(r.z * s.depth) / p.depth})`}
            opacity={matches && !matches.has(r.id) ? 0.15 : 1}
          >
            <title>{r.label}</title>
            <circle r={0.43} fill="transparent" />
            <circle
              r={0.265}
              fill={capacityColor(r)}
              stroke={p.selectedId === r.id ? "#fff" : "#0b1010"}
              strokeWidth={0.075}
            />
            {p.selectedId === r.id && (
              <circle r=".38" stroke="#aaffde" fill="none" strokeWidth=".065" />
            )}
          </g>
        );
      })}
      {p.walker?.pose && <WalkMarker walker={p.walker} />}
    </svg>
  );
}
class Boundary extends React.Component<
  { onFailure: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function WarehouseCanvas(p: CanvasProps) {
  const [failed, setFailed] = useState(false),
    [chosen, choose] = useState<"3d" | "plan" | "walk">("3d"),
    [message, warn] = useState("");
  const architecture = geometry.getSpace(p.spaceId);
  const room = architecture || operatorPlan(p.spaceId, p);
  const host = useRef<HTMLDivElement>(null);
  const requested = p.mode || chosen;
  const walking = requested === "walk" && !!architecture;
  const wantsBuilding = !!architecture && requested !== "plan";
  const building = useMemo(() => {
    if (!wantsBuilding) return null;
    const model = geometry.createBuilding(T);
    model.setView(p.spaceId);
    model.setCutaway(walking ? "closed" : "review");
    return model;
  }, [p.spaceId, wantsBuilding, walking]);
  useEffect(() => () => building?.dispose(), [building]);
  const rackPoints = useMemo(() => !architecture ? [] : p.racks.map(r => ({
    x: r.x * architecture.width / p.width, z: r.z * architecture.depth / p.depth,
  })), [architecture, p.width, p.depth, p.racks]);
  const walker = useMemo(() => walking && building && architecture ?
    createWalker(architecture, building.root, rackPoints) : null,
    [walking, building, architecture]);
  useLayoutEffect(() => { if (walker) walker.racks = rackPoints; }, [walker, rackPoints]);
  useEffect(() => {
    warn("");
  }, [p.spaceId, p.placing]);
  const unavailable = React.useCallback(() => setFailed(true), []);
  if (!room)
    return (
      <div className="asc-map-error">
        Geometrija ovog prostora nije povezana.
      </div>
    );
  const plan = !building || failed || (walking && !walker?.pose);
  const target = walker && p.racks.find(r => r.id === p.selectedId && supported(p.spaceId, p, r.x, r.z));
  const destination = target ? {label: target.label, x: target.x*room.width/p.width, z: target.z*room.depth/p.depth} : undefined;
  return (
    <div ref={host} role={walking ? "group" : undefined}
      aria-label={walking ? "Obilazak prostora. Kretanje strelicama, pogled povlačenjem." : undefined}
      tabIndex={walking ? 0 : undefined}
      className={"asc-spatial-canvas" + (p.placing ? " placing" : "") + (walking ? " walking" : "")}>
      {plan ? (
        <Plan {...p} room={room} walker={walker} warn={warn} />
      ) : (
        <Boundary onFailure={unavailable}>
          <Scene
            shadows={walking ? "percentage" : false}
            dpr={[1, 1.6]}
            frameloop="demand"
            gl={{ antialias: true, powerPreference: "low-power" }}
            camera={{ fov: 46, near: 0.07, far: 800 }}
            fallback={<Plan {...p} room={room} walker={walker} warn={warn} />}
          >
            <Stage {...p} room={room} building={building!} walker={walker} onUnavailable={unavailable} warn={warn} />
          </Scene>
        </Boundary>
      )}
      {walker && <WalkControls walker={walker} host={host} destination={destination} />}
      {!p.mode && (
        <div
          className="asc-map-switch"
          role="group"
          aria-label="Prikaz prostora"
        >
          <button
            type="button"
            aria-pressed={!plan && !walking}
            disabled={failed || !architecture}
            onClick={() => choose("3d")}
          >
            3D
          </button>
          <button type="button" disabled={!architecture} aria-pressed={walking}
            onClick={() => choose("walk")}>Obilazak</button>
          <button
            type="button"
            aria-pressed={plan && !walking}
            onClick={() => choose("plan")}
          >
            Tlocrt
          </button>
        </div>
      )}
      {(failed || message || !architecture) && (
        <div className="asc-map-status" role="status">
          {message || (!architecture ? "Tlocrt prema unesenim dimenzijama prostora" : "3D nije dostupan · prikazan je tlocrt")}
        </div>
      )}
      {!walking && <span className="asc-map-compass" aria-hidden="true">
        {plan ? "↑ S" : "◇"} <span>{plan ? "TLOCRT" : "AKSONOMETRIJA"}</span>
      </span>}
    </div>
  );
}
