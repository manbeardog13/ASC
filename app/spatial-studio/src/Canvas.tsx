import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  capacityColor,
  geometry,
  isPlaceable,
  supported,
  operatorPlan,
  type RackShape,
  type Room,
} from "./canvas-geometry";
import { attachPlanCamera } from "../../warehouse-preview/plan-camera.js";
import type { WalkInput } from "./WalkRig";
const Scene3D = React.lazy(() => import("./Scene3D"));
import "./canvas.css";
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
  reset?: number;
  onWebGLFailure?: () => void;
  onWalkBlocked?: () => void;
};
export type CanvasRack = RackShape;
function Plan(p: CanvasProps & { room: Room; warn: (s: string) => void }) {
  const s = p.room,
    hw = s.width / 2,
    hd = s.depth / 2,
    pad = Math.max(s.width, s.depth) * 0.08;
  const svg = useRef<SVGSVGElement>(null);
  const camera = useRef<ReturnType<typeof attachPlanCamera> | null>(null);
  useLayoutEffect(() => {
    if (!svg.current) return;
    const controls = attachPlanCamera(svg.current);
    camera.current = controls;
    return () => { controls.dispose(); camera.current=null; };
  },[p.spaceId,p.width,p.depth]);
  useEffect(() => { camera.current?.reset(); },[p.reset]);
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
      tabIndex={0}
      aria-describedby="asc-camera-hint"
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
          <rect width="1" height="1" fill="#dfE9e3" />
          <path d="M0 1V0H1" fill="none" stroke="#8da9a3" strokeWidth=".034" />
        </pattern>
      </defs>
      <g fill="url(#ascmapgrid)" stroke="#496c67" strokeWidth=".055">
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
          stroke="#8c6c46"
          fill="#b49368"
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
    [chosen, choose] = useState<"3d" | "plan">("3d"),
    [message, warn] = useState("");
  const architecture = geometry.getSpace(p.spaceId);
  const room = architecture || operatorPlan(p.spaceId, p);
  useEffect(() => {
    warn("");
  }, [p.spaceId, p.placing]);
  const gesture=useRef({pointers:new Map<number,{x:number;y:number}>(), dragged:false});
  const input = useRef<WalkInput>({keys:new Set(),wake:()=>{}});
  const unavailable = React.useCallback(() => {setFailed(true); p.onWebGLFailure?.();}, [p.onWebGLFailure]);
  const walkBlocked = React.useCallback(() => {
    choose("plan");
    p.onWalkBlocked?.();
    warn("Nema slobodnog prolaza. Prikazan je tlocrt prostora.");
  }, [p.onWalkBlocked]);
  if (!room)
    return (
      <div className="asc-map-error">
        Geometrija ovog prostora nije povezana.
      </div>
    );
  const plan = !architecture || (p.mode || chosen) === "plan" || failed;
  return (
    <div className={"asc-spatial-canvas" + (p.placing ? " placing" : "")}
      onPointerDownCapture={e=>{
        if (!(e.target instanceof HTMLCanvasElement)) return;
        const g=gesture.current;
        g.dragged=g.pointers.size>0; g.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      }}
      onPointerMoveCapture={e=>{const start=gesture.current.pointers.get(e.pointerId);
        if(start && Math.hypot(e.clientX-start.x,e.clientY-start.y)>5) gesture.current.dragged=true;}}
      onPointerUpCapture={e=>gesture.current.pointers.delete(e.pointerId)}
      onPointerCancelCapture={e=>gesture.current.pointers.delete(e.pointerId)}
      onClickCapture={e=>{if(e.target instanceof HTMLCanvasElement && gesture.current.dragged) e.stopPropagation();}}
    >
      {plan ? (
        <Plan key={p.spaceId} {...p} room={room} warn={warn} />
      ) : (
        <Boundary onFailure={unavailable}>
          <React.Suspense fallback={<div className="boot" role="status">Učitavanje 3D prikaza…</div>}>
            <Scene3D {...p} input={input} room={room} onWalkBlocked={walkBlocked} onUnavailable={unavailable} warn={warn} />
          </React.Suspense>
        </Boundary>
      )}
      {!p.mode && (
        <div
          className="asc-map-switch"
          role="group"
          aria-label="Prikaz prostora"
        >
          <button
            type="button"
            aria-pressed={!plan}
            disabled={failed || !architecture}
            onClick={() => choose("3d")}
          >
            3D
          </button>
          <button
            type="button"
            aria-pressed={plan}
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
      {!plan && p.mode==="walk" && <div className="walk-pad" aria-label="Kretanje kroz prostor">
        {([["KeyW","Naprijed","↑"],["KeyS","Natrag","↓"],["KeyA","Lijevo","←"],["KeyD","Desno","→"]] as const).map(([key,label,icon])=>
          <button key={key} type="button" aria-label={label} data-step={key}
            onPointerDown={e=>{e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); input.current.keys.add(key); input.current.wake();}}
            onLostPointerCapture={()=>input.current.keys.delete(key)}
            onPointerUp={()=>input.current.keys.delete(key)} onPointerCancel={()=>input.current.keys.delete(key)}
            onKeyDown={e=>{if(e.key===" " || e.key==="Enter"){e.preventDefault();input.current.keys.add(key);input.current.wake();}}}
            onKeyUp={()=>input.current.keys.delete(key)} onBlur={()=>input.current.keys.delete(key)}>{icon}</button>)}
      </div>}
      <span className="asc-camera-hint" id="asc-camera-hint">
        {plan ? <>Povucite za pomak · približite s dva prsta ili kotačićem.</> :
          p.mode==="walk" ? <>Povucite za pogled · hodajte strelicama ili tipkama WASD.</> :
          <><span className="pointer-fine">Povucite za pomak · desnom tipkom okrenite · kotačićem približite.</span>
          <span className="pointer-coarse">Povucite za pomak · dvama prstima približite ili okrenite.</span></>}
      </span>
    </div>
  );
}
