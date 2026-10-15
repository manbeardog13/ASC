import * as THREE from './vendor/three.module.js';
import { CAR_POSITIONS, planPoint } from './building-layout.js';

// The architecture never owns a car/person transform. Actor IDs are independent
// of warehouse/stock IDs. No actor is included in the static building batches.
export function createActors({ onChange = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'Pokretni objekti';
  root.userData = { layer: 'actors', schema: 'asc-actors-1' };
  const cars = new THREE.Group(), people = new THREE.Group();
  cars.name = 'Vozila'; people.name = 'Osobe';
  root.add(cars, people);
  const records = new Map(), resources = new Set();
  const keep = value => (resources.add(value), value);
  const material = (color, props = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: .4, ...props }));
  const m = {
    paint: material(0x64686b, { metalness: .5, roughness: .26 }),
    lightPaint: material(0xe6e5e1, { metalness: .35, roughness: .28 }),
    glass: material(0x233440, { metalness: .35, roughness: .14 }),
    chrome: material(0xc5c9ca, { metalness: .65, roughness: .22 }),
    rubber: material(0x202325, { roughness: .87 }),
    black: material(0x171b1d, { roughness: .6 }),
    lamp: material(0xf4efdc, { emissive: 0xfff0cd, emissiveIntensity: .35 }),
    red: material(0xad2323, { emissive: 0x510808, emissiveIntensity: .25 }),
  };
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const tyre = keep(new THREE.TorusGeometry(.345, .11, 10, 24));
  const rim = keep(new THREE.CylinderGeometry(.25, .25, .065, 20).rotateX(Math.PI / 2));
  const hub = keep(new THREE.CylinderGeometry(.073, .073, .085, 12).rotateX(Math.PI / 2));
  function mesh(parent, geometry, mat, name, at = [0,0,0], scale = [1,1,1]) {
    const object = new THREE.Mesh(geometry, mat);
    object.name = name; object.position.set(...at); object.scale.set(...scale);
    object.castShadow = true; object.receiveShadow = true;
    parent.add(object); return object;
  }
  function prism(points, depth, bevel) {
    const shape = new THREE.Shape();
    points.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y));
    shape.closePath();
    return keep(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, steps: 1,
      curveSegments: 10 }).translate(0,0,-depth/2));
  }
  const body = prism([[-2.28,.48],[-2.28,.8],[-1.68,.95],[1.3,.92],[2.26,.76],[2.33,.49],[1.85,.4],[-1.85,.4]], 1.65, .08);
  const cabin = prism([[-1.53,.89],[-1.04,1.43],[-.65,1.52],[.46,1.5],[1.15,.91]], 1.42, .035);
  const roof = prism([[-1.05,1.44],[-.65,1.54],[.46,1.52],[.56,1.47]], 1.44, .025);
  const hood = prism([[.95,.95],[2.22,.81],[2.17,.77],[.94,.9]], 1.58, .025);
  function car(definition) {
    const object = new THREE.Group(), paint = definition.color ? m.lightPaint : m.paint;
    const bodyGroup = new THREE.Group(); bodyGroup.name = 'Karoserija'; object.add(bodyGroup);
    mesh(bodyGroup, body, paint, 'Karoserija');
    mesh(bodyGroup, cabin, m.glass, 'Stakla');
    mesh(bodyGroup, roof, paint, 'Krov');
    mesh(bodyGroup, hood, paint, 'Poklopac motora');
    mesh(bodyGroup, box, m.black, 'Prednja maska', [2.34,.58,0], [.035,.2,.84]);
    mesh(bodyGroup, box, m.chrome, 'Prednji rub', [2.36,.43,0], [.035,.055,1.48]);
    mesh(bodyGroup, box, m.black, 'Stražnji odbojnik', [-2.35,.46,0], [.06,.13,1.5]);
    for (const side of [-1,1]) {
      mesh(bodyGroup, box, m.lamp, 'Prednje svjetlo', [2.28,.76,side*.62], [.08,.14,.43]);
      mesh(bodyGroup, box, m.red, 'Stražnje svjetlo', [-2.32,.75,side*.63], [.065,.13,.4]);
      mesh(bodyGroup, box, m.chrome, 'Donji rub prozora', [-.12,.93,side*.75], [2.45,.035,.03]);
      mesh(bodyGroup, box, m.black, 'Središnji stup', [-.36,1.21,side*.733], [.1,.55,.04]);
      mesh(bodyGroup, box, paint, 'Retrovizor', [.6,1.12,side*.94], [.24,.13,.2]);
      for (const x of [-.93,.2]) mesh(bodyGroup, box, m.chrome, 'Kvaka', [x,.87,side*.86], [.19,.04,.035]);
    }
    const wheels = [];
    for (const x of [-1.49,1.49]) for (const side of [-1,1]) {
      const pivot = new THREE.Group();
      pivot.name = `Kotač-${x>0?'prednji':'stražnji'}-${side>0?'desni':'lijevi'}`;
      pivot.position.set(x,.46,side*.88);
      pivot.userData = { component: 'wheel', rollingAxis: 'z', radius: .455 };
      object.add(pivot); wheels.push(pivot);
      mesh(pivot, tyre, m.rubber, 'Guma');
      mesh(pivot, rim, m.black, 'Unutrašnjost naplatka', [0,0,side*.075]);
      mesh(pivot, hub, m.chrome, 'Glavčina', [0,0,side*.12]);
      const spokes = new THREE.InstancedMesh(box, m.chrome, 5);
      spokes.name = 'Kraci naplatka';
      const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
      for (let i=0;i<5;i++) {
        const a=i*Math.PI*2/5;
        q.setFromAxisAngle(new THREE.Vector3(0,0,1),-a);
        matrix.compose(new THREE.Vector3(Math.sin(a)*.12,Math.cos(a)*.12,side*.12),q,new THREE.Vector3(.045,.22,.035));
        spokes.setMatrixAt(i,matrix);
      }
      pivot.add(spokes);
    }
    return { object, wheels };
  }
  const poseKeys = ['u','v','elevation','heading'];
  function poseFrom(input = {}) {
    const pose = { u: input.u ?? 0, v: input.v ?? 0, elevation: input.elevation ?? 0, heading: input.heading ?? 0 };
    if (!poseKeys.every(key => Number.isFinite(pose[key]))) throw new TypeError('Actor pose must contain finite numbers.');
    return pose;
  }
  function applyPose(record, pose) {
    const p=planPoint(pose.u,pose.v,pose.elevation);
    record.object.position.set(p.x,p.y,p.z);
    record.object.rotation.set(0,-Math.PI/2-pose.heading,0);
    record.pose=pose; record.object.userData.pose={...pose};
  }
  function register({ id, name=id, kind='person', object, pose, roomId='workshop', wheels=[] }) {
    if (!id || records.has(id)) throw new Error('Actor ID must be unique.');
    if (!['car','person'].includes(kind) || !object?.isObject3D || object.parent) throw new Error('Supply a detached car or person Object3D.');
    const initial=poseFrom(pose), record={id,name,kind,object,roomId,wheels,initial,pose:initial};
    object.name=`${kind==='car'?'Vozilo':'Osoba'} · ${id}`;
    object.userData={...object.userData,actorId:id,kind,roomId,movable:true};
    (kind==='car'?cars:people).add(object);records.set(id,record);applyPose(record,initial);onChange();
    return object;
  }
  for(const definition of CAR_POSITIONS) register({...definition,kind:'car',pose:definition,...car(definition)});
  return {
    root, cars, people, register,
    list(){return [...records.values()].map(({id,name,kind,roomId,pose})=>({id,name,kind,roomId,pose:{...pose}}));},
    get(id){return records.get(id)?.object ?? null;},
    setPose(id,change){
      const record=records.get(id);if(!record)throw new Error('Unknown actor: '+id);
      const pose=poseFrom({...record.pose,...change});applyPose(record,pose);onChange();return {...pose};
    },
    rollWheels(id,distance){
      const record=records.get(id);if(!record||!Number.isFinite(distance))return;
      for(const wheel of record.wheels)wheel.rotation.z-=distance/.455;
      onChange();
    },
    reset(id){for(const record of records.values())if(!id||record.id===id){applyPose(record,{...record.initial});for(const wheel of record.wheels)wheel.rotation.z=0;}onChange();},
    setView(view){root.visible=view==='ground'||view==='all'||view==='workshop';},
    setVisible(visible){cars.visible=people.visible=Boolean(visible);onChange();},
    dispose(){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});root.removeFromParent();records.clear();for(const resource of resources)resource.dispose();},
  };
}
