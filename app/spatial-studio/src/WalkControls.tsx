import { useEffect, useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { Room } from "./canvas-geometry";
import { worldPoint, WALK_EYE_HEIGHT, type Walker } from "./walk-space";

export function WalkCamera({ walker, room }: { walker: Walker; room: Room }) {
  const { camera, invalidate } = useThree();
  useLayoutEffect(() => walker.subscribe(() => {
    const pos = walker.pose;
    if (!pos) return;
    const world = worldPoint(room, pos.x, pos.z);
    camera.position.set(world.x, pos.y + WALK_EYE_HEIGHT, world.z);
    camera.rotation.set(pos.pitch, (room.rotationY || 0) - pos.yaw, 0, "YXZ");
    invalidate();
  }), [walker, room, camera, invalidate]);
  return null;
}

export function WalkMarker({walker}: {walker: Walker}) {
  const ref = useRef<SVGGElement>(null);
  useLayoutEffect(() => walker.subscribe(() => {
    const pos = walker.pose;
    if (pos) ref.current?.setAttribute("transform",
      `translate(${pos.x} ${pos.z}) rotate(${pos.yaw * 180 / Math.PI})`);
  }), [walker]);
  return <g ref={ref} role="img" aria-label="Vaš položaj i smjer pogleda" pointerEvents="none">
    <circle r=".52" fill="#162421" stroke="#d8f7ec" strokeWidth=".07"/>
    <path d="M0,-.38 .25,.25 0,.13 -.25,.25 Z" fill="#d8f7ec"/>
  </g>;
}

type Destination = { x: number; z: number; label: string };
function DestinationBearing({walker, destination}: { walker:Walker; destination:Destination }) {
  const arrow = useRef<SVGSVGElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => walker.subscribe(() => {
    const pose = walker.pose;
    if (!pose) return;
    const x = destination.x-pose.x, z = destination.z-pose.z;
    const angle = Math.atan2(x, -z) - pose.yaw;
    if (arrow.current) arrow.current.style.transform = `rotate(${angle}rad)`;
    if (label.current) {
      const relative = Math.atan2(Math.sin(angle),Math.cos(angle));
      const direction = Math.abs(relative)<0.45 ? "ispred vas" : Math.abs(relative)>2.70 ? "iza vas" : relative>0 ? "desno" : "lijevo";
      label.current.textContent = Math.hypot(x,z)<1.05 ? "U blizini regala" : "Smjer prema regalu · " + direction;
    }
  }), [walker, destination.x, destination.z]);
  return <div className="asc-walk-destination">
    <svg ref={arrow} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg>
    <span><small ref={label}>Smjer prema regalu</small><strong>Regal {destination.label}</strong></span>
  </div>;
}

const buttons = [
  ["ArrowLeft","Okreni ulijevo","M17 16v-3a4 4 0 0 0-4-4H6m4-4-4 4 4 4"],
  ["ArrowUp","Korak naprijed","M12 19V5m-5 5 5-5 5 5"],
  ["ArrowDown","Korak natrag","M12 5v14m-5-5 5 5 5-5"],
  ["ArrowRight","Okreni udesno","M7 16v-3a4 4 0 0 1 4-4h7m-4-4 4 4-4 4"],
] as const;
const supportedKeys = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","s","a","d"]);
export function WalkControls({walker, host, destination}: { walker: Walker; host: React.RefObject<HTMLDivElement | null>; destination?: Destination }) {
  const pad = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = host.current, controls = pad.current;
    if (!panel || !controls || !walker.pose) return;
    const active = new Map<string,string>();
    let frame = 0, last = 0;
    let drag: { id: number; x: number; y:number } | null = null;
    const tick = (now: number) => {
      const dt = Math.min((now-last)/1000, 0.07);
      last = now;
      const keys = new Set(active.values());
      const forward = Number(keys.has("ArrowUp")||keys.has("w")) - Number(keys.has("ArrowDown")||keys.has("s"));
      const side = Number(keys.has("d")) - Number(keys.has("a"));
      const length = Math.max(1, Math.hypot(forward,side));
      const turn = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
      walker.move(forward*2.1*dt/length, side*2.1*dt/length, turn*1.62*dt);
      frame = active.size ? requestAnimationFrame(tick) : 0;
    };
    const start = (id:string,key:string) => {
      if (active.has(id)) return;
      active.set(id,key);
      const initial = 0.065;
      walker.move(key==="ArrowUp"||key==="w" ? initial : key==="ArrowDown"||key==="s" ? -initial : 0,
        key==="d" ? initial : key==="a" ? -initial : 0,
        key==="ArrowRight" ? initial : key==="ArrowLeft" ? -initial : 0);
      if (!frame) {last=performance.now();frame=requestAnimationFrame(tick);}
    };
    const stop = () => { active.clear(); drag=null; cancelAnimationFrame(frame); frame=0; };
    const keydown = (e:KeyboardEvent) => {
      if (e.altKey||e.ctrlKey||e.metaKey||!supportedKeys.has(e.key)) return;
      e.preventDefault();
      start("key-"+e.key,e.key);
    };
    const keyup = (e:KeyboardEvent) => active.delete("key-"+e.key);
    const down = (e:PointerEvent) => {
      if (e.button!==0 || !(e.target instanceof Element)) return;
      const button = e.target.closest<HTMLButtonElement>("button[data-walk]");
      if (button) {
        button.focus({preventScroll:true}); button.setPointerCapture(e.pointerId);
        start("pointer-"+e.pointerId,button.dataset.walk!);
      } else if (!e.target.closest("button, [role=button]") && e.isPrimary) {
        panel.focus({preventScroll:true});
        drag={id:e.pointerId,x:e.clientX,y:e.clientY};
        e.target.setPointerCapture(e.pointerId);
      }
    };
    const move = (e:PointerEvent) => {
      if (!drag || e.pointerId!==drag.id) return;
      walker.move(0,0,(drag.x-e.clientX)*0.006,(e.clientY-drag.y)*0.005);
      drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    };
    const up = (e:PointerEvent) => {
      active.delete("pointer-"+e.pointerId);
      if (drag?.id===e.pointerId) drag=null;
    };
    const blur = (e:FocusEvent) => {
      if (!(e.relatedTarget instanceof Node) || !panel.contains(e.relatedTarget)) stop();
    };
    const controller = new AbortController(), options={signal:controller.signal};
    panel.addEventListener("keydown",keydown,options);
    window.addEventListener("keyup",keyup,options);
    panel.addEventListener("pointerdown",down,options);
    panel.addEventListener("pointermove",move,options);
    for (const event of ["pointerup","pointercancel","lostpointercapture"] as const) panel.addEventListener(event,up,options);
    panel.addEventListener("focusout",blur,options);
    window.addEventListener("blur",stop,options);
    document.addEventListener("visibilitychange",stop,options);
    // Arrow keys are scoped to the focused map, never to a search or form.
    const activeElement=document.activeElement;
    if(activeElement===document.body || activeElement===document.documentElement || activeElement?.matches('.switch button[aria-pressed="true"]')) panel.focus({preventScroll:true});
    return () => { stop();controller.abort(); };
  }, [walker,host]);
  if (!walker.pose) return <span className="asc-map-status" role="status">Nema slobodnog položaja za obilazak. Odaberite tlocrt.</span>;
  return <div className="asc-walk-hud">
    {destination ? <DestinationBearing walker={walker} destination={destination} /> :
      <span className="asc-walk-hint">Povucite za pogled <span>· Strelice za kretanje</span></span>}
    <div className="asc-walk-pad" ref={pad} role="group" aria-label="Kretanje kroz prostor">
      {buttons.map(([key,label,path])=><button type="button" data-walk={key} key={key} aria-label={label} title={label}
        onClick={e=>{if(e.detail===0) walker.move(key==="ArrowUp"?.35:key==="ArrowDown"?-.35:0,0,key==="ArrowLeft"?-.22:key==="ArrowRight"?.22:0);}}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>
      </button>)}
    </div>
  </div>;
}
