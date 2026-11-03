import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Euler } from "three";
import type { Room } from "./canvas-geometry";
import { advance, startWalk, worldPoint, WALK_EYE_HEIGHT, type Floor, type Pose } from "./walk-space";

export type WalkInput = {keys: Set<string>; wake: () => void};
const keys = new Set(["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowLeft","ArrowDown","ArrowRight"]);
export function WalkRig({room, obstacles, racks, input, reset, blocked}: {
  room: Room; obstacles: RefObject<Floor|null>; racks: readonly {x:number;z:number}[];
  input: RefObject<WalkInput>; reset: number; blocked: () => void;
}) {
  const {gl,camera,invalidate} = useThree();
  const look = useRef(new Euler(0,0,0,"YXZ"));
  const yGoal = useRef(0);
  const pose=useRef<Pose|null>(null);
  const activeRacks=useRef(racks);
  activeRacks.current=racks;
  useLayoutEffect(() => {
    const floor=obstacles.current;
    const start = floor && startWalk(room,floor,activeRacks.current);
    if (!start) { blocked(); return; }
    pose.current=start;
    const pos=worldPoint(room,start.x,start.z);
    camera.position.set(pos.x,start.y+WALK_EYE_HEIGHT,pos.z);
    yGoal.current = camera.position.y;
    look.current.set(start.pitch,(room.rotationY||0)-start.yaw,0,"YXZ");
    camera.quaternion.setFromEuler(look.current);
    invalidate();
  },[camera, room, reset, blocked, invalidate,obstacles]);
  useEffect(() => {
    const el = gl.domElement, held = input.current.keys, abort = new AbortController();
    const options = {signal:abort.signal};
    let pointer: {id:number; x:number; y:number} | null = null;
    input.current.wake = invalidate;
    el.tabIndex = 0;
    el.setAttribute('aria-label','Šetnja skladištem. Tipke W A S D za kretanje, strelice za hodanje i pogled.');
    const focused=document.activeElement;
    if(focused===document.body || focused===document.documentElement || focused?.matches('.switch button[aria-pressed="true"]')){
      el.focus({preventScroll:true});
    }
    el.addEventListener('pointerdown', e => {
      if (e.button || pointer) return;
      el.focus({preventScroll:true}); el.setPointerCapture(e.pointerId);
      pointer = {id:e.pointerId, x:e.clientX, y:e.clientY};
    },options);
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== pointer?.id) return;
      look.current.y -= (e.clientX-pointer.x)*.005;
      look.current.x = Math.max(-1.22, Math.min(1.22, look.current.x-(e.clientY-pointer.y)*.005));
      pointer.x=e.clientX; pointer.y=e.clientY;
      camera.quaternion.setFromEuler(look.current); invalidate();
    }, options);
    const release = (e:PointerEvent) => { if (e.pointerId===pointer?.id) pointer=null; };
    el.addEventListener('lostpointercapture',release,options);
    el.addEventListener('pointerup',release,options);
    el.addEventListener('pointercancel',release,options);
    el.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || !keys.has(e.code)) return;
      e.preventDefault(); held.add(e.code); invalidate();
    },options);
    window.addEventListener('keyup', e => held.delete(e.code), options);
    const stop = () => {held.clear(); pointer=null;};
    el.addEventListener('blur',stop,options);
    window.addEventListener('blur',stop,options);
    document.addEventListener('visibilitychange',stop,options);
    return () => { abort.abort(); stop(); input.current.wake=()=>{}; };
  },[gl,camera,input,invalidate]);
  useFrame((_,delta) => {
    const k = input.current.keys, dt = Math.min(.05,delta);
    const forward = Number(k.has('KeyW')||k.has('ArrowUp')) - Number(k.has('KeyS')||k.has('ArrowDown'));
    const right = Number(k.has('KeyD'))-Number(k.has('KeyA'));
    const turn = Number(k.has('ArrowLeft'))-Number(k.has('ArrowRight'));
    if (turn) {
      look.current.y += turn*dt*1.6;
      camera.quaternion.setFromEuler(look.current);
    }
    if ((forward || right) && pose.current && obstacles.current) {
      const step=dt*3.1/Math.hypot(forward,right);
      pose.current.yaw=(room.rotationY||0)-look.current.y;
      advance(pose.current,forward*step,right*step,obstacles.current,activeRacks.current);
      const pos=worldPoint(room,pose.current.x,pose.current.z);
      camera.position.x=pos.x; camera.position.z=pos.z;
      yGoal.current=pose.current.y+WALK_EYE_HEIGHT;
    }
    camera.position.y += (yGoal.current-camera.position.y)*Math.min(1,dt*12);
    if(k.size || Math.abs(yGoal.current-camera.position.y)>.005) invalidate();
  });
  return null;
}
