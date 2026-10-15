import * as THREE from './vendor/three.module.js';
import { ATTIC_LEVEL, BUILDING_ROOMS, CAR_POSITIONS, LUNCH_TABLE, planPoint } from './building-layout.js';

// A reusable shell around the original 2.1/2.2/2.3 scene, never a replacement
// inventory. Every room is a named group; static repetitions are instanced.
export function createBuilding({ surfaces = {}, tyreGeometry, rubberMaterial } = {}) {
  const root = new THREE.Group(); root.name = 'ASC — prizemlje'; root.userData.layer = 'architecture';
  const resources = new Set(), batches = new Map(), rooms = new Map(), targets = [];
  const keep = x => (resources.add(x), x);
  const mat = (color, rest = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: .65, ...rest }));
  const m = {
    stone: mat(0xd5c9b7, { ...surfaces.stone, roughness: .95 }),
    floor: mat(0xc8c6bf, { ...surfaces.concrete, roughness: .87 }),
    plaster: mat(0xe1dcd3, { roughness: .9 }),
    wood: mat(0xa8865e, { ...surfaces.wood, roughness: .68 }),
    dark: mat(0x333b40), black: mat(0x171b1d), white: mat(0xf1f0e9),
    blue: mat(0x276098, { metalness: .35 }), red: mat(0xb62e28, { metalness: .25 }),
    orange: mat(0xc97932, { metalness: .4 }), gold: mat(0xbc8c35, { metalness: .85, roughness: .21 }),
    chrome: mat(0xc9d4db, { metalness: .9, roughness: .18 }),
    glass: mat(0xb3d7db, { transparent: true, opacity: .19, metalness: .05, roughness: .1, depthWrite: false, side: THREE.DoubleSide }),
    car: mat(0x626c75, { metalness: .67, roughness: .27 }),
    carWhite: mat(0xe5e8e5, { metalness: .3, roughness: .3 }),
    window: mat(0x253740, { metalness: .45, roughness: .16 }),
    green: mat(0x437247), soil: mat(0x33322c), yellow: mat(0xdbb94b),
    rubber: rubberMaterial || mat(0x22272a), lamp: mat(0xf4ebce, { emissive: 0xfff3d4, emissiveIntensity: .35 }),
  };
  const geom = {
    box: keep(new THREE.BoxGeometry(1, 1, 1)),
    cylinder: keep(new THREE.CylinderGeometry(1, 1, 1, 14)),
    sphere: keep(new THREE.SphereGeometry(1, 10, 7)),
    torus: keep(new THREE.TorusGeometry(.72, .24, 7, 18)),
    wheel: keep(new THREE.CylinderGeometry(1, 1, 1, 18)),
    tyre: tyreGeometry || keep(new THREE.TorusGeometry(.75, .25, 7, 20).rotateX(Math.PI / 2)),
  };
  const instanceMatrix = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const vector = new THREE.Vector3(), scale = new THREE.Vector3();
  function room(id, name) { const group = new THREE.Group(); group.name = name; group.userData.roomId = id; root.add(group); rooms.set(id, group); return group; }
  const ground = room('workshop', 'Radionica i blagovaonica');
  const reception = room('reception', 'Staklena recepcija');
  const triangle = room('triangle', 'Trokutasto skladište');

  function mesh(parent, geometry, material, at, size, rotation = [0, 0, 0], name = '') {
    const p = planPoint(at[0], at[2], at[1]);
    // Geometry axes here are (u, height, v); rotate the whole local frame.
    q.setFromEuler(e.set(...rotation));
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
    q.premultiply(turn);
    instanceMatrix.compose(vector.set(p.x, p.y, p.z), q, scale.set(...size));
    if (material.transparent) {
      const object = new THREE.Mesh(geometry, material); object.name = name;
      object.matrix.copy(instanceMatrix); object.matrix.decompose(object.position, object.quaternion, object.scale);
      parent.add(object); return object;
    }
    const key = `${parent.uuid}/${geometry.uuid}/${material.uuid}`;
    let batch = batches.get(key); if (!batch) { batch = { parent, geometry, material, matrices: [], names: [] }; batches.set(key, batch); }
    batch.matrices.push(instanceMatrix.clone()); batch.names.push(name);
  }
  const box = (g, u, y, v, w, h, d, material = m.stone, rot = 0, name = '') => mesh(g, geom.box, material, [u,y,v], [w,h,d], [0,rot,0], name);
  const floor = (g, u0,v0,u1,v1,y=0, material=m.floor) => box(g,(u0+u1)/2,y-.1,(v0+v1)/2,u1-u0,.2,v1-v0,material,0,'Pod');
  function wall(g,u0,v0,u1,v1,y=0,height=1.25,material=m.plaster) {
    const length=Math.hypot(u1-u0,v1-v0), angle=-Math.atan2(v1-v0,u1-u0);
    box(g,(u0+u1)/2,y+height/2,(v0+v1)/2,length,height,.22,material,angle,'Zid');
    if(height>.5)box(g,(u0+u1)/2,y+height+.015,(v0+v1)/2,length,.03,.24,m.dark,angle,'Rub presjeka');
  }
  function beam(g,a,b,width=.09,material=m.dark){
    const A=planPoint(a[0],a[2],a[1]),B=planPoint(b[0],b[2],b[1]);
    const va=new THREE.Vector3(A.x,A.y,A.z), vb=new THREE.Vector3(B.x,B.y,B.z);
    const object=new THREE.Mesh(geom.box,material);object.position.copy(va).add(vb).multiplyScalar(.5);
    object.scale.set(width,va.distanceTo(vb),width);object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());g.add(object);
  }
  function stack(g,u,v,height=6,y=0,r=.42){for(let i=0;i<height;i++)mesh(g,geom.tyre,m.rubber,[u,y+(i+.5)*r*.58,v],[r,r,r], [0,0,0],'Gume — ilustracija');}
  function wheel(g,u,y,v,r=.4,material=m.chrome){
    mesh(g,geom.torus,m.rubber,[u,y,v],[r,r,r],[0,0,0],'Kotač');
    mesh(g,geom.cylinder,material,[u,y,v],[r*.45,.08,r*.45],[Math.PI/2,0,0]);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;mesh(g,geom.box,material,[u+Math.sin(a)*r*.22,y+Math.cos(a)*r*.22,v-.04],[.045,r*.43,.05],[0,0,-a]);}
  }
  function plant(g,u,v,y=0){
    mesh(g,geom.cylinder,m.dark,[u,y+.33,v],[.28,.66,.28]);
    for(let i=0;i<5;i++){const a=i*2.4;const h=.8+i*.17;beam(g,[u,y+.4,v],[u+Math.cos(a)*.17,y+h,v+Math.sin(a)*.17],.025,m.green);
      mesh(g,geom.sphere,m.green,[u+Math.cos(a)*.24,y+h,v+Math.sin(a)*.24],[.13,.38,.08],[.1,a,.35]);}
  }
  function chair(g,u,v,y=0,rot=0){box(g,u,y+.47,v,.56,.1,.55,m.dark);box(g,u,y+.9,v+.23,.56,.72,.09,m.dark,rot);for(const a of [-.2,.2])for(const b of [-.2,.2])box(g,u+a,y+.22,v+b,.045,.44,.045,m.chrome);}
  function machine(g,u,v){box(g,u,.55,v,.8,1.1,.75,m.red);box(g,u,1.15,v,.9,.1,.8,m.black);box(g,u,1.6,v+.22,.16,.9,.15,m.dark);mesh(g,geom.cylinder,m.chrome,[u,1.25,v],[.3,.12,.3]);}
  function label(g,text,u,v,y=0,size=1){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#394650';c.font='600 64px system-ui';c.textAlign='center';c.fillText(text,256,85);
    const tex=keep(new THREE.CanvasTexture(canvas));tex.colorSpace=THREE.SRGBColorSpace;
    const material=keep(new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    mesh(g,keep(new THREE.PlaneGeometry(4*size,size)),material,[u,y+.015,v],[1,1,1],[-Math.PI/2,0,0],text);
  }
  // Lifts and jacks are fixtures. Cars live in actors.js, never in these batches.
  function serviceFixture(g,{u,v,heading,lift,id,elevation=0}){
    const local=(du,dv)=>[u+du*Math.cos(heading)-dv*Math.sin(heading),v+du*Math.sin(heading)+dv*Math.cos(heading)];
    if(lift==='two-post'){
      for(const dv of [-1.5,1.5]){
        const [a,c]=local(0,dv);
        box(g,a,1.6,c,.22,3.2,.28,m.blue,0,'Dizalica — '+id);
        box(g,a,.06,c,.8,.12,.9,m.blue);
        box(g,a,elevation+.32,c,1.65,.12,.15,m.blue,-heading);
      }
    } else {
      const [a,c]=local(.15,1.16);
      for(let j=0;j<3;j++)mesh(g,geom.cylinder,m.rubber,[a,.14+j*.12,c],[.23,.11,.23]);
      box(g,a,.04,c,.65,.08,.5,m.red);stack(g,a+.8,c+.5,1,0,.43);
      beam(g,[a,.08,c],[a+.75,.08,c+.25],.025,m.blue);
    }
  }

  // GROUND FLOOR. The original warehouse 2.1 occupies u=0..14, v=0..10.
  floor(ground,-17,0,0,10);floor(ground,-17,10,14,29);floor(ground,-17,-7,0,0);
  floor(ground,-23,0,-17,29, -.05,m.stone);
  wall(ground,-17,-7,0,-7);wall(ground,0,-7,0,0);wall(ground,-17,-7,-17,0);
  wall(ground,-14.5,0,0,0);wall(ground,-17,0,-16,0);
  wall(ground,0,2,0,10);wall(ground,0,0,0,.45);
  wall(ground,0,10,14,10);wall(ground,14,10,14,29);wall(ground,-17,29,14,29);
  for(const [a,b]of [[0,1.5],[8.2,13.3],[19,22],[27.7,29]])wall(ground,-17,a,-17,b,0,1.3);
  for(const [number,v]of [[3,4.8],[2,16.2],[1,24.8]]){
    label(ground,String(number),-20,v,0,1.2);for(const end of [v-2.85,v+2.85])box(ground,-17,2,end,.22,4,.24,m.dark);
    box(ground,-17,3.9,v,.3,.2,5.8,m.dark);box(ground,-17,4.03,v,.36,.12,5.85,m.chrome);
  }
  // L-shaped enclosed stone flight; no railings.
  wall(ground,-17,10,-4,10,0,1.4);wall(ground,-17,13,-5.7,13,0,1.4);wall(ground,-3,10,-3,12.5,0,1.4);
  floor(ground,-4.7,10.5,-3,12.5, .4,m.stone);
  for(let i=0;i<17;i++){const h=.45+(i+1)*(ATTIC_LEVEL-.45)/17;box(ground,-4.7-(i+.5)*.66,h/2,11.5,.68,h,1.3,m.stone);}
  for(const pos of CAR_POSITIONS)serviceFixture(ground,pos);
  for(const u of [-15,-12.7,-10.4])machine(ground,u,14.1);
  for(const u of [-5,-2.6])machine(ground,u,1.5);
  for(const v of [13,23,26])machine(ground,13.1,v);
  box(ground,8,.08,26.8,2.5,.16,4,m.blue);box(ground,8,.19,26.8,.06,.03,4,m.chrome);
  for(const u of [-7.5,4.5,10]){box(ground,u,.5,11.2,1.5,1, .6,m.red);for(let i=0;i<4;i++)box(ground,u,.2+i*.2,10.88,1.3,.035,.035,m.chrome);}
  const table=LUNCH_TABLE;box(ground,table.u,.82,table.v,table.width,.12,table.depth,m.wood);
  for(const a of [-.65,.65])for(const b of [-1.45,1.45])box(ground,table.u+a,.4,table.v+b,.07,.8,.07,m.dark);
  for(const u of [table.u-1.18,table.u+1.18])for(const v of [-1,-2.3,-3.2])chair(ground,u,v);
  plant(ground,-1,-1);box(ground,-16,.85,-4.7,1,1.7,2,m.dark);
  // Tiny room behind reception is enclosed, with its passage kept free.
  wall(ground,-1,10,-1,12.2);wall(ground,-1,12.2,1.7,12.2);wall(ground,1.7,10,1.7,12.2);

  floor(reception,-5.7,12.5,1.7,19, .015,m.white);
  function glazing(g,u0,v0,u1,v1){const length=Math.hypot(u1-u0,v1-v0),angle=-Math.atan2(v1-v0,u1-u0);box(g,(u0+u1)/2,1.35,(v0+v1)/2,length,2.7,.045,m.glass,angle);for(let i=0;i<=Math.ceil(length/1.35);i++){const t=i/Math.ceil(length/1.35);box(g,u0+(u1-u0)*t,1.35,v0+(v1-v0)*t,.05,2.7,.05,m.dark);}wall(g,u0,v0,u1,v1,2.65,.05,m.dark);}
  glazing(reception,-5.7,12.5,-5.7,17.8);glazing(reception,-4.4,19,1.7,19);glazing(reception,1.7,12.5,1.7,19);
  // Open glass leaf at the lower-left corner.
  glazing(reception,-5.7,17.8,-6.5,18.7);
  box(reception,-1.4,.58,16.4,4.6,1.16,1,m.red);box(reception,-1.4,1.2,16.4,4.9,.12,1.2,m.dark);
  box(reception,.45,.58,15.2,1,1.16,1.5,m.red);box(reception,.45,1.2,15.2,1.2,.12,1.7,m.dark);
  box(reception,-1,1.53,16.2,.85,.5,.07,m.black);box(reception,-1,1.29,16.2,.12,.15,.12,m.chrome);chair(reception,-1,15.1);
  for(const [u,v]of [[-5,13.2],[-4.9,18.3],[1,18.3],[1,13]])plant(reception,u,v);

  // Triangular annex: doorway on its wide end, outside beside gate 3.
  const triangleShape=new THREE.Shape();triangleShape.moveTo(-22,0);triangleShape.lineTo(-17,-7);triangleShape.lineTo(-17,0);triangleShape.closePath();
  const triGeo=keep(new THREE.ShapeGeometry(triangleShape));const triFloor=new THREE.Mesh(triGeo,m.floor);
  triFloor.rotation.x=-Math.PI/2; // directly map each 2D vertex into warehouse coordinates below
  const attr=triGeo.attributes.position;for(let i=0;i<attr.count;i++){const p=planPoint(attr.getX(i),attr.getY(i));attr.setXYZ(i,p.x,-p.z,0);}triGeo.computeVertexNormals();triangle.add(triFloor);
  wall(triangle,-22,0,-17,-7,0,1.3,m.stone);wall(triangle,-17,-7,-17,0,0,1.3,m.stone);wall(triangle,-22,0,-18.5,0,0,1.3,m.stone);
  for(let i=0;i<8;i++){const t=(i+.6)/9;stack(triangle,-21.5+4.2*t,-.6-5.7*t,5,0,.33);}
  for(let i=0;i<5;i++)stack(triangle,-17.55,-.55-i*1.08,6,0,.33);

  label(ground,'ASC',-20,10.5,0,.7);

  for(const batch of batches.values()){
    const instances=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);
    instances.name=batch.parent.name+' · '+(batch.names.find(Boolean)||'Dijelovi');
    batch.matrices.forEach((matrix,i)=>instances.setMatrixAt(i,matrix));instances.instanceMatrix.needsUpdate=true;
    instances.castShadow=true;instances.receiveShadow=true;instances.computeBoundingSphere();batch.parent.add(instances);
  }
  const targetMaterial=keep(new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false,side:THREE.DoubleSide}));
  for(const [index,room] of BUILDING_ROOMS.entries()){
    const bounds=room.id==='workshop'?[[-17,10,14,29],[-17,0,0,10]]:[room.bounds];
    for(const [u0,v0,u1,v1] of bounds){const p=planPoint((u0+u1)/2,(v0+v1)/2,room.level+.03+index*.002);const hit=new THREE.Mesh(keep(new THREE.PlaneGeometry(v1-v0,u1-u0)),targetMaterial);hit.rotation.x=-Math.PI/2;hit.position.set(p.x,p.y,p.z);hit.userData.roomId=room.id;rooms.get(room.id).add(hit);targets.push(hit);}
  }
  return {
    root, rooms, targets,
    setView(id){root.visible=id==='all'||id==='ground'||rooms.has(id);for(const [key,group]of rooms)group.visible=id==='all'||id==='ground'||key===id;},
    dispose(){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});for(const resource of resources)resource.dispose();root.removeFromParent();}
  };
}
