/** ASC architectural context. Schematic units only; never inventory or locations.
 * House floor/void geometry recovered from d8a3552:model.js (before PR #26).
 * New adjacency follows Toni's references. No automatic zone/rack bindings.
 */
export const DIMENSIONS_UNMEASURED = true;
export const BUILDING_VERSION = 'asc-upper-assembly-review-2';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const UPPER_SPACE_IDS = Object.freeze(['attic-parts','attic-racks','office']);
// One placement transform for the entire reconstructed reference assembly.
// Its connection to the fixed source house is unresolved, so the two are never
// silently shown as an integrated building. These are unmeasured drawing units.
export const UPPER_ASSEMBLY_TRANSFORM=freeze({translation:[-5,1,0],rotationY:0,scale:[1,1,1]});
const rackReferenceDepth=32/18;
const houseFloor = [{x:0,z:0,w:10,d:14}];
const LOCAL_SPACES = [
  { id:'house-ground', name:'Kuća · prizemlje', x:5,y:0,z:-7,width:10,depth:14,floorRects:houseFloor,voidRects:[],source:'d8a3552:2.1',inventory:true },
  { id:'house-platform', name:'Kuća · drvena platforma', x:5,y:1.6,z:-7,width:10,depth:14,floorRects:[{x:0,z:2.93,w:5,d:5.42}],voidRects:[],source:'d8a3552:2.2',inventory:true },
  { id:'house-attic', name:'Kuća · potkrovlje', x:5,y:3.2,z:-7,width:10,depth:14,floorRects:[{x:0,z:-3.35,w:10,d:7.3},{x:.825,z:3.65,w:4.35,d:6.7}],voidRects:[{x:-3.175,z:3.65,w:3.65,d:6.7},{x:4,z:3.65,w:2,d:6.7}],source:'d8a3552:2.3',inventory:true },
  { id:'attic-parts', name:'Potkrovlje · bijele police', x:-6,y:3.2,z:2,width:12,depth:32,floorRects:[{x:0,z:7,w:12,d:18},{x:-4,z:-9,w:4,d:14}],voidRects:[{x:2,z:-9,w:8,d:14}],source:'Toni reference 1',inventory:true },
  { id:'attic-racks', name:'Potkrovlje · regali i platforma', x:5,y:3.2,z:2,width:10,depth:32,floorRects:[{x:0,z:0,w:10,d:32}],voidRects:[],platform:{x:0,z:-3.5*rackReferenceDepth,w:8.2,d:9.4*rackReferenceDepth,rise:1.2},source:'Toni reference 2 + approved combined common front/rear edges',inventory:true },
  { id:'office', name:'Ured', x:-4,y:3.2,z:-7,width:8,depth:14,floorRects:[{x:0,z:0,w:8,d:14}],voidRects:[],source:'Toni reference 5',inventory:false },
  {id:'workshop',name:'Radionica · ulazni prostor',x:-1.5,y:0,z:4.5,width:31,depth:29,floorRects:[{x:-7,z:-9.5,w:17,d:10},{x:0,z:5,w:31,d:19}],voidRects:[],inventory:false},
  {id:'table-room',name:'Soba sa stolom',x:-8.5,y:0,z:-13.5,width:17,depth:7,floorRects:[{x:0,z:0,w:17,d:7}],voidRects:[],inventory:false},
  {id:'reception',name:'Recepcija',x:-2,y:0.015,z:5.75,width:7.4,depth:6.5,floorRects:[{x:0,z:0,w:7.4,d:6.5}],voidRects:[],inventory:false},
  {id:'triangular-store',name:'Trokutasto skladište',x:-19.5,y:0,z:-13.5,width:5,depth:7,floorRects:[],floorPolygon:[[-2.5,3.5],[2.5,-3.5],[2.5,3.5]],voidRects:[],inventory:true},
];
export const SPACE_MANIFEST=freeze(LOCAL_SPACES.map(s=>{
  if(s.id.startsWith('house-'))return {...s,x:7,z:-5,rotationY:Math.PI/2};
  if(UPPER_SPACE_IDS.includes(s.id)){
    const [dx,dy,dz]=UPPER_ASSEMBLY_TRANSFORM.translation;
    return {...s,x:s.x+dx,z:s.z+dz,y:s.y+dy,reviewOnly:true,assembly:'upper-assembly'};
  }
  return s;
}));
export const BUILDING_TOPOLOGY = freeze({
  measurementStatus:'unmeasured', axes:{east:'+x',south:'+z',up:'+y'},
  integrationReady:false,
  assembly:{id:'upper-assembly',spaces:UPPER_SPACE_IDS,transform:UPPER_ASSEMBLY_TRANSFORM,north:-14,south:18,reference:'approved combined upper image',measurementStatus:'unmeasured'},
  joins:[{a:'attic-parts',sideA:'east',b:'attic-racks',sideB:'west',plane:-5,span:[0,18]},
    {a:'office',sideA:'east',b:'attic-racks',sideB:'west',plane:-5,span:[-14,0]},
    {a:'office',sideA:'west',b:'attic-parts',sideB:'inner-east',plane:-13,span:[-14,0]},
    {a:'office',sideA:'south',b:'attic-parts',sideB:'inner-north',plane:0,span:[-13,-5]}],
  unresolvedJoins:[{a:'attic-racks',b:'house-attic',reference:'blue'},{a:'office',b:'house-attic',reference:'yellow'}],
  unresolvedReason:'The approved common rear edge places the office beside attic B; its house connection cannot simultaneously use the previously assumed fixed-house side joins. No integrated placement is asserted.',
  gates:[{id:'gate-3',wall:'west',x:-17,z:-5.2},{id:'gate-2',wall:'west',x:-17,z:6.2},{id:'gate-1',wall:'west',x:-17,z:14.8}],
  sign:{gate:'gate-1',wall:'west',x:-17,z:14.8},
  entryRoute:{source:'Sites d75100dc + Toni 2026-10-21',gate:'gate-3',enter:[-14.8,-5.2],turn:'left/north',interveningRoom:'workshop',door:[-14.8,-10],secondRoom:'table-room',table:[-13.1,-11.85],approximateWalkMetres:6,distanceNotSurveyed:true,triangleDoor:[-17,-11.85]},
  trianglePolygon:[[-22,-10],[-17,-17],[-17,-10]],
  houseStair:{id:'house-shared-stair',source:'d8a3552:stair',x:4.2,z:2,w:1,d:3.4,instances:1},
  floorLevels:{'house-ground':0,'house-platform':1.6,'house-attic':3.2},
  inventorySeeded:false,
});
export function getSpace(id) { return SPACE_MANIFEST.find(s=>s.id===id)||null; }
const inRect=(x,z,r)=>x>=r.x-r.w/2-1e-8&&x<=r.x+r.w/2+1e-8&&z>=r.z-r.d/2-1e-8&&z<=r.z+r.d/2+1e-8;
export function hasBuildingFloor(id,x,z,radius=0) {
  const s=getSpace(id);if(!s||![x,z,radius].every(Number.isFinite)||radius<0)return false;
  if(s.floorPolygon){
    const p=s.floorPolygon;let pos=false,neg=false,minDistance=Infinity;
    for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],cross=dx*(z-a[1])-dz*(x-a[0]);if(cross>1e-8)pos=true;if(cross< -1e-8)neg=true;minDistance=Math.min(minDistance,Math.abs(cross)/Math.hypot(dx,dz));}
    return !(pos&&neg)&&minDistance+1e-8>=radius;
  }
  if(!radius)return s.floorRects.some(r=>inRect(x,z,r));
  // Exact disk containment in a rectangle union, including the house's L/seams.
  // Partition its bounding box at floor edges; any uncovered intersecting cell
  // means part of the actual tire footprint would be unsupported.
  const xs=[x-radius,x+radius],zs=[z-radius,z+radius];
  for(const r of s.floorRects){for(const edge of [r.x-r.w/2,r.x+r.w/2])if(edge>x-radius&&edge<x+radius)xs.push(edge);for(const edge of [r.z-r.d/2,r.z+r.d/2])if(edge>z-radius&&edge<z+radius)zs.push(edge);}
  xs.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
  for(let i=0;i<xs.length-1;i++)for(let j=0;j<zs.length-1;j++){
    const cx=(xs[i]+xs[i+1])/2,cz=(zs[j]+zs[j+1])/2;
    if(s.floorRects.some(r=>inRect(cx,cz,r)))continue;
    const dx=x-Math.max(xs[i],Math.min(x,xs[i+1])),dz=z-Math.max(zs[j],Math.min(z,zs[j+1]));
    if(dx*dx+dz*dz<radius*radius-1e-10)return false;
  }
  return true;
}
export function getSpaceBounds(id) {
  const s=getSpace(id); if(!s)return null;
  const w=s.rotationY?s.depth:s.width,d=s.rotationY?s.width:s.depth;return {min:[s.x-w/2,s.y,s.z-d/2],max:[s.x+w/2,s.y+3.4,s.z+d/2],center:[s.x,s.y,s.z],unmeasured:true};
}
export function mapAreaPoint(spaceId,area,x,z,radius=0) {
  const s=getSpace(spaceId),w=Number(area?.width),d=Number(area?.depth);
  if(!s?.inventory||!(w>0&&d>0)||![x,z,w,d,radius].every(Number.isFinite)||radius<0)return null;
  const sx=s.width/w,sz=s.depth/d,lx=x*sx,lz=z*sz;
  const footprint=radius*Math.min(sx,sz);
  if(!hasBuildingFloor(spaceId,lx,lz,footprint))return null;
  const p=s.platform,onPlatform=p&&inRect(lx,lz,p),dy=onPlatform?p.rise:0;
  if(p&&footprint>0){
    const left=p.x-p.w/2,right=p.x+p.w/2,north=p.z-p.d/2,south=p.z+p.d/2;
    if(onPlatform&&Math.min(lx-left,right-lx,lz-north,south-lz)+1e-8<footprint)return null;
    const dx=lx-Math.max(left,Math.min(lx,right)),dz=lz-Math.max(north,Math.min(lz,south));
    if(!onPlatform&&dx*dx+dz*dz<footprint*footprint-1e-10)return null;
  }
  return {x:s.x+(s.rotationY?lz:lx),y:s.y+dy,z:s.z+(s.rotationY?-lx:lz),radiusScale:Math.min(sx,sz),unmeasured:true};
}
export function unmapAreaPoint(spaceId,area,worldX,worldZ) {
  const s=getSpace(spaceId),w=Number(area?.width),d=Number(area?.depth);
  if(!s?.inventory||!(w>0&&d>0)||![worldX,worldZ,w,d].every(Number.isFinite))return null;
  const x=s.rotationY?-(worldZ-s.z):worldX-s.x,z=s.rotationY?worldX-s.x:worldZ-s.z;if(!hasBuildingFloor(spaceId,x,z))return null;
  return {x:x*w/s.width,z:z*d/s.depth};
}

export function createBuilding(THREE, options={}) {
  if(!THREE?.Group)throw new TypeError('createBuilding requires THREE');
  const owned=new Set(), keep=value=>{owned.add(value);options.keep?.(value);options.resources?.add(value);return value;};
  const root=new THREE.Group();root.name='ASC Tyre Hotel · prostorna studija';root.userData={layer:'architecture',unmeasured:true,inventory:false};
  const upperAssembly=new THREE.Group();upperAssembly.name='Dva potkrovlja i ured · spoj s kućom nepotvrđen';upperAssembly.userData={assemblyId:'upper-assembly',reviewOnly:true,integrationReady:false};upperAssembly.position.set(...UPPER_ASSEMBLY_TRANSFORM.translation);root.add(upperAssembly);
  const rooms=new Map(),targets=[],wallMeshes=[],roofMeshes=[],roofStructure=[],reviewFrontWalls=[],batches=new Map(),surfaces=options.surfaces||{};
  const material=(color,props={})=>keep(new THREE.MeshStandardMaterial({color,roughness:.76,...props}));
  const m={
    stone:material(0xbfb3a4,{...surfaces.stone,roughness:.94,bumpScale:.04}), concrete:material(0xb8b8b1,{...surfaces.concrete,roughness:.93,bumpScale:.025}),
    plaster:material(0xd9d5cb,{roughness:.87}),wood:material(0xb9976b,{...surfaces.wood,roughness:.67,bumpScale:.015}),woodDark:material(0x755437,{...surfaces.wood,roughness:.7}),
    dark:material(0x24282c,{metalness:.56,roughness:.45}),black:material(0x14171a,{roughness:.68}),white:material(0xe6e8e5,{metalness:.32,roughness:.45}),
    orange:material(0xc25524,{metalness:.5,roughness:.5}), yellow:material(0xcda31b,{metalness:.52,roughness:.48}),roof:material(0x323a40,{...surfaces.roof,metalness:.65,roughness:.5,side:THREE.DoubleSide}),
    chrome:material(0x9ca5aa,{metalness:.82,roughness:.25}),screen:material(0x17252f,{metalness:.15,roughness:.34}),glass:material(0x96a5ab,{transparent:true,opacity:.16,roughness:.1,depthWrite:false}),
    redEdge:material(0x6e1111,{emissive:0xb51818,emissiveIntensity:.38,roughness:.65}),
  };
  const g={box:keep(new THREE.BoxGeometry(1,1,1)),cylinder:keep(new THREE.CylinderGeometry(1,1,1,16)),sphere:keep(new THREE.SphereGeometry(1,12,8))};
  const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),euler=new THREE.Euler(),vec=new THREE.Vector3(),scale=new THREE.Vector3();
  function room(s){const group=new THREE.Group();group.name=s.name;group.userData={spaceId:s.id,roomId:s.id,inventory:false,unmeasured:true,reviewOnly:!!s.reviewOnly};(UPPER_SPACE_IDS.includes(s.id)?upperAssembly:root).add(group);rooms.set(s.id,group);return group;}
  for(const s of SPACE_MANIFEST)room(s);
  const exterior=new THREE.Group();exterior.name='Vanjski zidovi i tri zapadna ulaza';root.add(exterior);
  const architecture=new THREE.Group();architecture.name='Jedno postojeće stubište';root.add(architecture);
  function object(parent,geo,mat,position,size,rotation=[0,0,0],name='',separate=false){
    if(separate){const o=new THREE.Mesh(geo,mat);o.position.set(...position);o.scale.set(...size);o.rotation.set(...rotation);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    const key=parent.uuid+geo.uuid+mat.uuid;let b=batches.get(key);if(!b){b={parent,geo,mat,matrices:[],names:[]};batches.set(key,b);}
    matrix.compose(vec.set(...position),quat.setFromEuler(euler.set(...rotation)),scale.set(...size));b.matrices.push(matrix.clone());b.names.push(name);return null;
  }
  const box=(p,x,y,z,w,h,d,mat=m.stone,name='',separate=false)=>object(p,g.box,mat,[x,y,z],[w,h,d],[0,0,0],name,separate);
  function wall(p,x,z,w,d,y,h=2.65,mat=m.stone,flags={}){
    const clone=keep(mat.clone());const o=box(p,x,y+h/2,z,w,h,d,clone,'Zid',true);o.userData={spaceId:p.userData.spaceId,kind:'wall',baseOpacity:clone.opacity};wallMeshes.push(o);
    const cap=box(p,x,y+h+.012,z,w+.015,.025,d+.015,m.dark,'Rub zida',!!flags.reviewFront);
    if(flags.reviewFront){o.userData.reviewCutaway={side:'south',height:.5,baseY:y,fullHeight:h};reviewFrontWalls.push({wall:o,cap,position:o.position.clone(),scale:o.scale.clone()});}
    return o;
  }
  function beam(p,a,b,width,mat=m.dark){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());const o=new THREE.Mesh(g.box,mat);o.position.copy(A).add(B).multiplyScalar(.5);o.quaternion.copy(q);o.scale.set(width,A.distanceTo(B),width);o.castShadow=true;p.add(o);return o;}
  function floor(p,s,r,mat){box(p,s.x+r.x,s.y-.095,s.z+r.z,r.w,.19,r.d,mat,'Pod');const hit=new THREE.Mesh(keep(new THREE.PlaneGeometry(r.w,r.d)),pickMaterial);hit.rotation.x=-Math.PI/2;hit.position.set(s.x+r.x,s.y+.012,s.z+r.z);hit.userData={spaceId:s.id,roomId:s.id,inventory:false};hit.name=s.name+' · odabir poda';p.add(hit);targets.push(hit);}
  function roof(p,points,name='Krov'){const geo=keep(new THREE.BufferGeometry());geo.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();const mat=keep(m.roof.clone());const o=new THREE.Mesh(geo,mat);o.name=name;o.userData={spaceId:p.userData.spaceId,kind:'roof'};o.castShadow=true;o.receiveShadow=true;p.add(o);roofMeshes.push(o);return o;}
  const pickMaterial=keep(new THREE.MeshBasicMaterial({transparent:true,opacity:0,colorWrite:false,depthWrite:false,side:THREE.DoubleSide}));
  for(const s of LOCAL_SPACES){const p=rooms.get(s.id);for(const r of s.floorRects)floor(p,s,r,s.id==='house-ground'?m.concrete:s.id==='office'?m.plaster:s.id==='attic-parts'?m.concrete:m.wood);}
  // Ground-floor outline and west gates ported from Sites d75100dc.
  // Physical plan frame: x=u, z=v-10; no rotation of the actual building.
  box(exterior,-1.5,-.23,1,31.7,.35,36.7,m.concrete,'Temelj');
  const gateRanges=BUILDING_TOPOLOGY.gates.map(gate=>[gate.z-2.9,gate.z+2.9]);let cursor=-10;
  for(const [a,b]of gateRanges){if(a>cursor)wall(exterior,-17,(cursor+a)/2,.3,a-cursor,0,4.2,m.dark);cursor=b;}
  if(cursor<19)wall(exterior,-17,(cursor+19)/2,.3,19-cursor,0,4.2,m.dark);
  // Grey panel facade from supplied street reference, with three door openings.
  box(exterior,-17,3.55,4.5,.34,1.3,29,m.dark,'Siva panelna fasada');
  for(let z=-9.5;z<19;z+=2.4)box(exterior,-17.18,3.55,z,.016,1.28,.018,m.chrome,'Spoj fasadnih panela');
  for(const gate of BUILDING_TOPOLOGY.gates){
    box(exterior,-16.985,1.35,gate.z,.12,2.68,5.72,m.dark,gate.id);
    for(let i=0;i<10;i++)box(exterior,-17.055,.16+i*.265,gate.z,.025,.035,5.69,m.chrome,'Spoj sekcija vrata');
    for(const dz of [-2.96,2.96])box(exterior,-17.16,1.55,gate.z+dz,.22,3.1,.16,m.dark,'Okvir vrata');
    box(exterior,-17.17,3.12,gate.z,.05,.038,5.94,m.redEdge,'Ambijentalni crveni rub');
    for(const dz of [-1.8,-.6,.6,1.8])box(exterior,-17.07,2.18,gate.z+dz,.03,.37,.8,m.screen,'Zatamnjeno staklo vrata');
  }
  // The sign uses the supplied ASC silhouette, never retyped substitute letters.
  // Material colour is overridden after texture sampling, preserving its alpha.
  let signGlow=null;
  if(options.logoTexture||(options.logoUrl&&typeof document!=='undefined')){
    const texture=options.logoTexture||keep(new THREE.TextureLoader().load(options.logoUrl,()=>options.onChange?.()));
    texture.colorSpace=THREE.SRGBColorSpace;
    const signGeo=keep(new THREE.PlaneGeometry(5.7,5.7*92/488));
    const black=keep(new THREE.MeshPhysicalMaterial({map:texture,color:0xffffff,metalness:.66,roughness:.17,clearcoat:1,clearcoatRoughness:.12,alphaTest:.08,transparent:true,depthWrite:false}));
    black.userData.offlineColor=[.009,.009,.009];
    black.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb = vec3(0.009);');};
    black.customProgramCacheKey=()=> 'asc-supplied-logo-black-1';
    signGlow=keep(new THREE.MeshBasicMaterial({map:texture,color:0xffffff,transparent:true,opacity:.36,depthWrite:false,toneMapped:false}));
    signGlow.userData.offlineColor=[.8,.012,.01];
    signGlow.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n diffuseColor.rgb = vec3(0.8, 0.012, 0.01);');};
    signGlow.customProgramCacheKey=()=> 'asc-supplied-logo-red-1';
    const halo=new THREE.Mesh(signGeo,signGlow);halo.name='ASC · crveno pozadinsko svjetlo';halo.rotation.y=-Math.PI/2;halo.position.set(-17.185,3.57,14.8);halo.scale.set(1.045,1.12,1);exterior.add(halo);
    const sign=new THREE.Mesh(signGeo,black);sign.name='ASC · izvorni logotip, sjajno crni';sign.rotation.y=-Math.PI/2;sign.position.set(-17.22,3.57,14.8);sign.castShadow=true;exterior.add(sign);
  }
  wall(exterior,-1.5,19,31,.3,0,4.2);wall(exterior,14,9.5,.3,19,0,4.2);
  // Existing house: recovered floor unions, no invented floor infill or stock.
  const hg=rooms.get('house-ground'),ha=rooms.get('house-attic');
  wall(hg,4.05,-14.04,8.1,.13,0,.46);wall(hg,9.76,-14.04,.58,.13,0,.46);wall(hg,-.06,-7,.13,14,0,.46);
  for(const [z,d]of [[-12.88,2.25],[-7.67,2],[-1.5,3]])wall(hg,10.06,z,.13,d,0,.46);
  // One shared flight at original x/z. It is NOT repeated in each level group.
  const st=BUILDING_TOPOLOGY.houseStair;architecture.userData={kind:'stair',stairId:st.id,instances:1};
  for(let i=0;i<15;i++){const t=(i+.5)/15;box(architecture,5+st.x,3.2*(1-t)-.04,-7+st.z-st.d/2+t*st.d,st.w,.08,st.d/15+.025,m.chrome,'Gazište');}
  for(const dx of [-st.w*.41,st.w*.41]){beam(architecture,[5+st.x+dx,3.2,-7+st.z-st.d/2],[5+st.x+dx,0,-7+st.z+st.d/2],.085,m.dark);beam(architecture,[5+st.x+dx,4.08,-7+st.z-st.d/2],[5+st.x+dx,.88,-7+st.z+st.d/2],.035,m.dark);for(let i=0;i<4;i++){const t=i/3;beam(architecture,[5+st.x+dx,3.2*(1-t),-7+st.z-st.d/2+t*st.d],[5+st.x+dx,3.2*(1-t)+.88,-7+st.z-st.d/2+t*st.d],.028,m.dark);}}
  function houseRoof(x0,x1,z0,z1){const h=x=>3.32+(x+5)*1.48;return roof(ha,[[x0+5,h(x0),z0-7],[x1+5,h(x1),z0-7],[x1+5,h(x1),z1-7],[x0+5,h(x0),z1-7]],'Postojeći strmi zapadni krov');}
  houseRoof(-5,-2.25,-7,-5.75);houseRoof(-5,-4.72,-5.75,7);
  box(ha,10,3.22,-7,.065,.1,14,m.woodDark,'Istočni rub potkrovlja');
  // A: white shelving attic wraps the office's WEST and SOUTH walls.
  const a=rooms.get('attic-parts'),ay=3.2;
  wall(a,-12,2,.24,32,ay,2.6);
  // The open entrance at the corridor's far end is directly visible in the
  // supplied reference. Opening/leaf dimensions remain explicitly unmeasured.
  const corridorEntrance=new THREE.Group();corridorEntrance.name='A · ulaz na kraju prolaza';corridorEntrance.userData={spaceId:'attic-parts',kind:'corridor-entrance',unmeasured:true,opening:{xMin:-10.8,xMax:-9.2,z:-14,height:2.2}};a.add(corridorEntrance);
  wall(corridorEntrance,-11.4,-14,1.2,.24,ay,2.6);wall(corridorEntrance,-8.6,-14,1.2,.24,ay,2.6);wall(corridorEntrance,-10,-14,1.6,.24,ay+2.2,.4);
  for(const x of [-10.765,-9.235])box(corridorEntrance,x,ay+1.1,-13.86,.07,2.2,.08,m.woodDark,'Dovratnik');
  box(corridorEntrance,-10,ay+2.17,-13.86,1.6,.06,.08,m.woodDark,'Nadvoj dovratnika');
  const corridorDoor=new THREE.Group();corridorDoor.name='A · otvorena drvena vrata';corridorDoor.userData={kind:'door',open:true,unmeasured:true};corridorDoor.position.set(-9.27,ay,-13.83);corridorDoor.rotation.y=1.1;corridorEntrance.add(corridorDoor);
  box(corridorDoor,-.73,1.075,0,1.46,2.15,.055,m.woodDark,'Krilo vrata');box(corridorDoor,-1.29,1.02,.057,.18,.035,.045,m.chrome,'Kvaka');
  wall(a,-8,-7,.18,14,ay,2.65,m.plaster);wall(a,-4,0,8,.18,ay,2.65,m.plaster);wall(a,0,9,.22,18,ay,2.65);wall(a,-6,18,12,.22,ay,2.65,m.stone,{reviewFront:true});
  roof(a,[[-12.2,ay+2.2,-14.2],[-8.6,ay+4.4,-14.2],[-8.6,ay+4.4,18.2],[-12.2,ay+2.2,18.2]],'Zapadna krovna kosina A');
  for(let z=-13;z<18;z+=2.2)roofStructure.push(beam(a,[-12.05,ay+2.23,z],[-8.65,ay+4.34,z],.09,m.woodDark));
  function shelving(parent,x,z,y,width=2.15,depth=.85,height=2.1,rotation=0,white=false){
    const p=new THREE.Group();p.position.set(x,y,z);p.rotation.y=rotation;parent.add(p);const steel=white?m.white:m.dark;
    for(const px of [-width/2,width/2])for(const pz of [-depth/2,depth/2])box(p,px,height/2,pz,.06,height,.06,steel,'Stup regala');
    for(let i=0;i<4;i++){const sy=.12+i*(height-.18)/3;for(const pz of [-depth/2,depth/2])box(p,0,sy,pz,width,.075,.06,white?m.white:m.orange,'Poprečni nosač');if(white)box(p,0,sy-.035,0,width,.035,depth,m.white,'Bijela polica');}
    if(!white){beam(p,[-width/2,.15,depth/2],[width/2,height-.1,depth/2],.028,steel);}
  }
  for(let z=-12.4;z<=16.5;z+=2.4)shelving(a,-11.2,z,ay,2.25,.85,2.05,Math.PI/2,true);
  for(const x of [-10.5,-8.25,-6,-3.75,-1.5])shelving(a,x,17.25,ay,2.2,.85,2.05,0,true);
  for(let x=-6.7;x<-.7;x+=2.2)shelving(a,x,.65,ay,2.1,.85,2.05,0,true);
  // B: two rear transverse rack banks, two side banks, two front paired banks.
  // Correct the former B-only depth error as one longitudinal reconstruction
  // of its complete existing fixture group. Relative fixture positions/order
  // are preserved; no independent rack/furniture moves or new fixtures.
  const b=new THREE.Group(),by=3.2;b.name='B · zajednički prednji i stražnji rub';b.userData={spaceId:'attic-racks',kind:'reference-depth-reconstruction',unmeasured:true};b.scale.z=rackReferenceDepth;b.position.z=-14;rooms.get('attic-racks').add(b);
  wall(b,5,0,10,.2,by,2.7);wall(b,10,9,.24,18,by,2.7);wall(b,5,18,10,.24,by,2.7,m.stone,{reviewFront:true});
  roof(b,[[10.2,by+2.2,-.2],[6.6,by+4.4,-.2],[6.6,by+4.4,18.2],[10.2,by+2.2,18.2]],'Istočna krovna kosina B');
  for(let z=.5;z<18;z+=2.2)roofStructure.push(beam(b,[10.05,by+2.23,z],[6.65,by+4.34,z],.09,m.woodDark));
  box(b,5,by+.58,5.5,8.2,1.16,9.4,m.dark,'Platforma · okvir');box(b,5,by+1.18,5.5,8.2,.12,9.4,m.wood,'Platforma · drveni pod');
  for(let x=1;x<9;x+=.3)box(b,x,by+1.245,5.5,.012,.006,9.4,m.woodDark,'Spoj dasaka');
  const platformHit=new THREE.Mesh(keep(new THREE.PlaneGeometry(8.2,9.4)),pickMaterial);platformHit.rotation.x=-Math.PI/2;platformHit.position.set(5,by+1.27,5.5);platformHit.userData={spaceId:'attic-racks',roomId:'attic-racks',inventory:false};b.add(platformHit);targets.push(platformHit);
  for(const z of [1.45,3.05])for(const x of [2.1,4.5,6.9])shelving(b,x,z,by+1.25,2.3,.85,2.15,0,false);
  for(const x of [1.55,8.45])for(const z of [5.3,7.7])shelving(b,x,z,by+1.25,2.3,.85,2.15,Math.PI/2,false);
  for(const x of [2.4,3.5,6.0,7.1])shelving(b,x,14.5,by,4.25,.82,2.15,Math.PI/2,false);
  const steps=new THREE.Group();steps.name='Kratke stube platforme B';steps.userData={kind:'platform-steps',notHouseStair:true};b.add(steps);
  for(let i=0;i<6;i++)box(steps,5,by+(6-i)*.2-.1,10.4+i*.3,1.5,.2,.31,m.wood,'Stuba platforme');
  for(const x of [4.2,5.8]){beam(steps,[x,by+2.05,10.2],[x,by+.85,12.2],.045,m.dark);for(const z of [10.2,12.2])beam(steps,[x,by+(z===10.2?1.2:0),z],[x,by+(z===10.2?2.05:.85),z],.04,m.dark);}
  box(b,.7,by+.12,16.6,1.15,.24,1.6,m.yellow,'Malo teretno dizalo');for(const x of [.16,1.24])box(b,x,by+1.1,17.3,.11,2.2,.12,m.yellow,'Vodilica dizala');box(b,.7,by+1.8,17.3,1.1,.1,.14,m.yellow);
  // Office: desk with rounded end, back-to-back monitors, two swivel chairs.
  const o=rooms.get('office'),oy=3.2;wall(o,-4,-14,8,.18,oy,2.65,m.plaster);wall(o,0,-7,.18,14,oy,2.65,m.plaster);
  box(o,-6.55,oy+1.1,-13.86,1.32,2.2,.08,m.woodDark,'Ured · vrata');box(o,-5.98,oy+1.03,-13.79,.18,.035,.05,m.chrome,'Kvaka');
  box(o,-3.1,oy+.87,-13.35,4.8,1.74,.8,m.wood,'Ured · vitrina');
  for(const x of [-4.7,-3.2]){box(o,x,oy+1,-12.93,1.35,1.28,.025,m.glass,'Staklena vrata vitrine');for(const y of [.55,1.1])box(o,x,oy+y,-13.35,1.35,.025,.75,m.woodDark,'Polica vitrine');}
  // A true curved tabletop instead of a raster furniture placeholder.
  const deskShape=new THREE.Shape();deskShape.moveTo(-1.05,2.4);deskShape.lineTo(1.05,2.4);deskShape.lineTo(1.05,-1.5);deskShape.absarc(0,-1.5,1.05,0,Math.PI,true);deskShape.closePath();
  const deskGeo=keep(new THREE.ExtrudeGeometry(deskShape,{depth:.12,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:3,steps:1,curveSegments:20}));deskGeo.rotateX(Math.PI/2);
  const desk=new THREE.Mesh(deskGeo,m.wood);desk.position.set(-4,oy+.84,-7);desk.castShadow=true;desk.receiveShadow=true;o.add(desk);
  box(o,-4,oy+.39,-5.6,1.8,.78,.7,m.woodDark,'Podnožje stola');box(o,-4,oy+.39,-8.3,1.5,.78,.6,m.woodDark,'Podnožje stola');
  for(const dx of [-.045,.045]){box(o,-4+dx,oy+1.38,-6.6,.055,.67,1.1,m.black,'Monitor');box(o,-4+dx*1.7,oy+1.38,-6.6,.012,.57,.98,m.screen,'Zaslon');}box(o,-4,oy+1,-6.6,.08,.3,.1,m.chrome,'Stalak monitora');
  for(const x of [-4.7,-3.3])box(o,x,oy+.93,-6.7,.35,.028,.8,m.dark,'Tipkovnica');
  function chair(x,z,rotation){const c=new THREE.Group();c.position.set(x,oy,z);c.rotation.y=rotation;o.add(c);box(c,0,.46,0,.65,.12,.64,m.black,'Sjedalo');box(c,0,.91,.28,.65,.78,.09,m.dark,'Naslon');object(c,g.cylinder,m.chrome,[0,.22,0],[.055,.44,.055]);for(let i=0;i<5;i++){const t=i*Math.PI*2/5;beam(c,[0,.11,0],[Math.cos(t)*.39,.11,Math.sin(t)*.39],.045,m.chrome);object(c,g.sphere,m.black,[Math.cos(t)*.39,.07,Math.sin(t)*.39],[.075,.075,.075]);}for(const x of [-.36,.36])box(c,x,.69,0,.07,.06,.5,m.dark,'Područka');}
  chair(-5.65,-6.6,-Math.PI/2);chair(-2.35,-6.6,Math.PI/2);
  // Original ground workshop, large first room, second table room and triangle.
  // Preserve the physical route: gate 3 -> left/north through the large room ->
  // table-room door -> triangle door in the table room's left/west wall.
  const workshop=rooms.get('workshop'),tableRoom=rooms.get('table-room'),triangle=rooms.get('triangular-store'),reception=rooms.get('reception');
  wall(tableRoom,-8.5,-17,17,.22,0,2.8);wall(tableRoom,0,-13.5,.22,7,0,2.8);
  // The source sketch's table-room south opening, now a visible small door.
  wall(tableRoom,-16.2,-10,1.6,.22,0,2.8);wall(tableRoom,-7.1,-10,14.2,.22,0,2.8);
  box(tableRoom,-14.8,2.55,-10,1.2,.5,.23,m.stone,'Nadvratnik sobe sa stolom');
  const tableDoor=box(tableRoom,-15.35,1.05,-10.47,.07,2.1,1.05,m.woodDark,'Otvorena vrata druge sobe',true);tableDoor.userData.route='gate3-table-room';
  // West wall stops either side of the small doorway to the covered triangle.
  wall(tableRoom,-17,-14.725,.22,4.55,0,2.8);wall(tableRoom,-17,-10.675,.22,1.35,0,2.8);
  box(tableRoom,-17,2.45,-11.85,.23,.7,1.2,m.stone,'Nadvratnik trokutastog skladišta');
  const triangleDoor=box(tableRoom,-17.45,1.05,-12.4,.95,2.1,.07,m.woodDark,'Otvorena vrata trokutastog skladišta',true);triangleDoor.userData.route='table-room-triangle';
  const table=BUILDING_TOPOLOGY.entryRoute.table;
  box(tableRoom,table[0],.82,table[1],1.7,.12,3.5,m.wood,'Stol · izvorni položaj');
  for(const dx of [-.65,.65])for(const dz of [-1.45,1.45])box(tableRoom,table[0]+dx,.4,table[1]+dz,.07,.8,.07,m.dark,'Noga stola');
  for(const dx of [-1.18,1.18])for(const dz of [-1.25,0,1.25]){box(tableRoom,table[0]+dx,.47,table[1]+dz,.56,.1,.55,m.dark,'Stolica');box(tableRoom,table[0]+dx+Math.sign(dx)*.24,.85,table[1]+dz,.08,.7,.55,m.dark,'Naslon stolice');for(const sx of [-.2,.2])for(const sz of [-.2,.2])box(tableRoom,table[0]+dx+sx,.22,table[1]+dz+sz,.045,.44,.045,m.chrome);}
  // True triangular plan; its angled exterior follows the site's boundary.
  const triangleShape=new THREE.Shape();triangleShape.moveTo(-22,10);triangleShape.lineTo(-17,17);triangleShape.lineTo(-17,10);triangleShape.closePath();
  const triangleGeo=keep(new THREE.ShapeGeometry(triangleShape));const triangleFloor=new THREE.Mesh(triangleGeo,m.concrete);triangleFloor.rotation.x=-Math.PI/2;triangleFloor.receiveShadow=true;triangle.add(triangleFloor);
  const triangleHit=new THREE.Mesh(triangleGeo,pickMaterial);triangleHit.rotation.x=-Math.PI/2;triangleHit.position.y=.015;triangleHit.userData={spaceId:'triangular-store',roomId:'triangular-store',inventory:false};triangle.add(triangleHit);targets.push(triangleHit);
  const diagonal=new THREE.Group();diagonal.userData.spaceId='triangular-store';triangle.add(diagonal);diagonal.position.set(-19.5,0,-13.5);diagonal.rotation.y=-Math.atan2(-7,5);wall(diagonal,0,0,Math.hypot(5,7),.22,0,2.8);
  wall(triangle,-19.5,-10,5,.22,0,2.8);
  const trRoof=keep(new THREE.BufferGeometry());trRoof.setAttribute('position',new THREE.Float32BufferAttribute([-22,2.5,-10,-17,3.1,-17,-17,3.1,-10],3));trRoof.setIndex([0,1,2]);trRoof.computeVertexNormals();const trRoofMesh=new THREE.Mesh(trRoof,keep(m.roof.clone()));trRoofMesh.userData={spaceId:'triangular-store',kind:'roof'};trRoofMesh.name='Pokriveno trokutasto skladište';triangle.add(trRoofMesh);roofMeshes.push(trRoofMesh);
  // Recovered first-room connection to the house and original workshop divider.
  wall(workshop,0,-4, .22,8,0,1.4);wall(workshop,0,-9.775,.22,.45,0,1.4);
  wall(workshop,7,0,14,.22,0,1.4);wall(workshop,-10.5,0,13,.22,0,1.4);wall(workshop,-11.35,3,11.3,.22,0,1.4);
  // This original flight reaches the separate new-attic floor; it is not the
  // single house stair, which remains one object in its own architecture group.
  const originalFlight=new THREE.Group();originalFlight.name='Izvorne stube radionice prema potkrovlju';originalFlight.userData.kind='workshop-attic-stair';workshop.add(originalFlight);
  for(let i=0;i<17;i++){const h=.45+(i+1)*(4.2-.45)/17;box(originalFlight,-4.7-(i+.5)*.66,h/2,1.5,.68,h,1.3,m.stone,'Kamena stuba');}
  function machine(x,z){box(workshop,x,.55,z,.8,1.1,.75,m.orange,'Radionički stroj');box(workshop,x,1.15,z,.9,.1,.8,m.black);box(workshop,x,1.6,z+.22,.16,.9,.15,m.dark);object(workshop,g.cylinder,m.chrome,[x,1.25,z],[.3,.12,.3]);}
  for(const x of [-15,-12.7,-10.4])machine(x,4.1);for(const x of [-5,-2.6])machine(x,-8.5);for(const z of [3,13,16])machine(13.1,z);
  for(const [x,z,heading]of [[-10,-4.9,0],[5.4,8,-Math.PI/2],[11,8,-Math.PI/2]])for(const side of [-1.5,1.5]){const px=x-side*Math.sin(heading),pz=z+side*Math.cos(heading);box(workshop,px,1.6,pz,.22,3.2,.28,m.dark,'Izvorna servisna dizalica');box(workshop,px,.06,pz,.8,.12,.9,m.dark);}
  // Existing glass reception is retained at its source position.
  for(const [x,z,w,d]of [[-5.7,5.15,.045,5.3],[-1.35,9,6.1,.045],[1.7,5.75,.045,6.5]]){box(reception,x,1.35,z,w,2.7,d,m.glass,'Staklena recepcija');}
  box(reception,-1.4,.58,6.4,4.6,1.16,1,m.orange,'Pult recepcije');box(reception,-1.4,1.2,6.4,4.9,.12,1.2,m.dark);box(reception,.45,.58,5.2,1,1.16,1.5,m.orange);box(reception,.45,1.2,5.2,1.2,.12,1.7,m.dark);box(reception,-1,1.53,6.2,.85,.5,.07,m.black,'Monitor recepcije');
  // Source house local x/z are a display frame; this rigid quarter-turn restores
  // their physical orientation in the original ground-floor plan, unchanged shapes.
  for(const id of ['house-ground','house-platform','house-attic']){const group=rooms.get(id);group.rotation.y=Math.PI/2;group.position.x=14;}
  architecture.rotation.y=Math.PI/2;architecture.position.x=14;
  // Consolidate repeated fixtures to keep GPU draw calls low on phones/tablets.
  for(const batch of batches.values()){const mesh=new THREE.InstancedMesh(batch.geo,batch.mat,batch.matrices.length);batch.matrices.forEach((v,i)=>mesh.setMatrixAt(i,v));mesh.instanceMatrix.needsUpdate=true;mesh.name=batch.names.find(Boolean)||'Arhitektonski elementi';mesh.userData={inventory:false,spaceId:batch.parent.userData.spaceId};mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();batch.parent.add(mesh);}
  const roomTransforms=Object.fromEntries(SPACE_MANIFEST.map(s=>[s.id,{x:s.x,y:s.y,z:s.z,width:s.width,depth:s.depth,rotationY:s.rotationY||0,floorRects:s.floorRects,voidRects:s.voidRects}]));
  let currentView='all';
  function setView(id='all'){
    currentView=id;const source=id==='all'||id==='building'||id==='exterior',upper=id==='upper-assembly'||id==='upper-review';
    root.visible=source||upper||rooms.has(id);upperAssembly.visible=upper||UPPER_SPACE_IDS.includes(id);
    for(const [key,group]of rooms)group.visible=(source&&!UPPER_SPACE_IDS.includes(key))||(upper&&UPPER_SPACE_IDS.includes(key))||key===id;
    exterior.visible=source;architecture.visible=source||id.startsWith('house-');
  }
  function setCutaway(mode='open'){
    const closed=mode==='closed'||mode==='exterior',shell=mode==='shell',review=mode==='review',opaqueWalls=closed||review;
    for(const mesh of roofStructure)mesh.visible=closed||shell;
    for(const mesh of roofMeshes){mesh.visible=closed||shell;mesh.material.transparent=!closed;mesh.material.opacity=closed?1:.13;mesh.material.depthWrite=closed;}
    for(const mesh of wallMeshes){const contextual=mesh.parent===exterior;mesh.material.transparent=!opaqueWalls;mesh.material.opacity=opaqueWalls?1:contextual ? .32 : shell ? .24 : .14;mesh.material.depthWrite=opaqueWalls;}
    for(const front of reviewFrontWalls){front.wall.position.copy(front.position);front.wall.scale.copy(front.scale);front.cap.visible=!review;if(review){front.wall.scale.y=.5;front.wall.position.y=front.wall.userData.reviewCutaway.baseY+.25;}}
  }
  setCutaway('open');
  setView('all');
  return {root,group:root,rooms,upperAssembly,upperSpaceIds:UPPER_SPACE_IDS,targets,floorMeshes:targets,roofMeshes,roofs:roofMeshes,roofStructure,reviewFrontWalls,wallMeshes,walls:wallMeshes,roomTransforms,bounds:{min:[-23,-.5,-17.5],max:[14.5,9,19.5]},
    setView,setCutaway,getPlacement:mapAreaPoint,mapAreaPoint,unmapAreaPoint,getSpaceBounds,
    update(seconds=0,reducedMotion=false){if(signGlow)signGlow.opacity=reducedMotion ? .36 : .32+.16*(.5+.5*Math.sin(seconds*Math.PI*2/6.4));},
    dispose(){root.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();});if(!options.keep&&!options.resources)for(const resource of owned)resource.dispose();root.removeFromParent();}
  };
}
