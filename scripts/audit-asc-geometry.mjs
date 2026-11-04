/** Read-only drawing audit. No database, inventory projection or mesh mutation.
 * Values are schematic drawing units, never metres or surveyed clearances.
 */
import { pathToFileURL } from 'node:url';
import {
  SPACE_MANIFEST, BUILDING_TOPOLOGY, DIMENSIONS_UNMEASURED,
  UPPER_ASSEMBLY_TRANSFORM, UPPER_SPACE_IDS, getSpace,
} from '../app/warehouse-preview/building.js';

const clean = n => Math.round(n * 1e10) / 1e10 || 0;
const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const rectangle = r => [
  [r.x-r.w/2,r.z-r.d/2], [r.x+r.w/2,r.z-r.d/2],
  [r.x+r.w/2,r.z+r.d/2], [r.x-r.w/2,r.z+r.d/2],
];

export function worldPoint(space, [x, z]) {
  const c = Math.cos(space.rotationY || 0), s = Math.sin(space.rotationY || 0);
  return [clean(space.x + x*c + z*s), clean(space.z - x*s + z*c)];
}

/** Actual solid floor union, excluding the empty portions of a room's bbox. */
export function worldFloorPolygons(space) {
  const local = space.floorPolygon ? [space.floorPolygon] : space.floorRects.map(rectangle);
  return local.map(p => p.map(point => worldPoint(space, point)));
}

export function polygonBounds(polygons) {
  const points = polygons.flat();
  if (!points.length) return null;
  return {x:[Math.min(...points.map(p=>p[0])), Math.max(...points.map(p=>p[0]))],
    z:[Math.min(...points.map(p=>p[1])), Math.max(...points.map(p=>p[1]))]};
}

const signedArea = p => p.reduce((sum, a, i) => {
  const b = p[(i+1)%p.length]; return sum + a[0]*b[1]-b[0]*a[1];
}, 0)/2;

/** Convex clipping: every canonical floor piece is a rectangle or triangle. */
export function clipConvex(subject, clip) {
  let output = subject;
  const orientation = Math.sign(signedArea(clip));
  for (let i=0; i<clip.length && output.length; i++) {
    const a=clip[i], b=clip[(i+1)%clip.length], input=output; output=[];
    for (let j=0; j<input.length; j++) {
      const p=input[j], q=input[(j+1)%input.length];
      const dp=orientation*cross(a,b,p), dq=orientation*cross(a,b,q);
      if (dp>=0) output.push(p);
      if ((dp<0&&dq>0)||(dp>0&&dq<0)) {
        const t=dp/(dp-dq); output.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
      }
    }
  }
  return output.map(p=>p.map(clean));
}

function intervalsAt(polygons, x) {
  const intervals=[];
  for (const polygon of polygons) {
    const zs=[];
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i], b=polygon[(i+1)%polygon.length];
      if ((a[0]<x&&b[0]>x)||(b[0]<x&&a[0]>x))
        zs.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));
    }
    zs.sort((a,b)=>a-b);
    for(let i=0;i+1<zs.length;i+=2) intervals.push([zs[i],zs[i+1]]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  const union=[];
  for(const interval of intervals) {
    const last=union.at(-1);
    if(last&&interval[0]<=last[1]) last[1]=Math.max(last[1],interval[1]);
    else union.push([...interval]);
  }
  return union;
}

/** Union area avoids double counting when floor rectangles overlap.
 * Sweep events include edge crossings, so interval lengths are linear within
 * each slab and its midpoint integral is exact up to floating-point rounding.
 */
export function polygonUnionArea(polygons) {
  const edges=polygons.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]]));
  const events=polygons.flat().map(p=>p[0]);
  for(let i=0;i<edges.length;i++) for(let j=i+1;j<edges.length;j++) {
    const [a,b]=edges[i], [c,d]=edges[j];
    const rx=b[0]-a[0], rz=b[1]-a[1], sx=d[0]-c[0], sz=d[1]-c[1];
    const det=rx*sz-rz*sx;
    if(Math.abs(det)<1e-12) continue;
    const t=((c[0]-a[0])*sz-(c[1]-a[1])*sx)/det;
    const u=((c[0]-a[0])*rz-(c[1]-a[1])*rx)/det;
    if(t>0&&t<1&&u>0&&u<1) events.push(a[0]+t*rx);
  }
  const xs=[...new Set(events.map(clean))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++) {
    const length=intervalsAt(polygons,(xs[i]+xs[i+1])/2).reduce((sum,[a,b])=>sum+b-a,0);
    area+=(xs[i+1]-xs[i])*length;
  }
  return clean(area);
}

export function floorPlanIntersection(a, b) {
  const polygons=worldFloorPolygons(a).flatMap(pa=>worldFloorPolygons(b)
    .map(pb=>clipConvex(pa,pb)).filter(p=>p.length>=3&&Math.abs(signedArea(p))>1e-10));
  return {polygons, bounds:polygonBounds(polygons), area:polygonUnionArea(polygons)};
}

export function auditGeometry() {
  const rack=getSpace('attic-racks'), office=getSpace('office'), house=getSpace('house-attic');
  const bounds=id=>polygonBounds(worldFloorPolygons(getSpace(id)));
  const houseBounds=bounds(house.id), officeBounds=bounds(office.id), rackBounds=bounds(rack.id);
  const delta=clean(rack.y-house.y);
  return {
    schemaVersion:1,
    source:'app/warehouse-preview/building.js',
    units:'schematic drawing units; area in squared drawing units; not metres',
    dimensionsUnmeasured:DIMENSIONS_UNMEASURED,
    integrationReady:BUILDING_TOPOLOGY.integrationReady,
    inventorySeeded:BUILDING_TOPOLOGY.inventorySeeded,
    axes:BUILDING_TOPOLOGY.axes,
    upperAssemblyTransform:UPPER_ASSEMBLY_TRANSFORM,
    spaces:SPACE_MANIFEST.map(s=>({id:s.id,inventory:s.inventory,reviewOnly:!!s.reviewOnly,
      origin:[s.x,s.y,s.z],rotationY:s.rotationY||0,localEnvelope:[s.width,s.depth],
      floorPolygons:worldFloorPolygons(s),bounds:bounds(s.id),baseElevation:s.y,
      ...(s.platform?{platform:{floorPolygons:[rectangle(s.platform).map(p=>worldPoint(s,p))],
        rise:s.platform.rise,topElevation:clean(s.y+s.platform.rise)}}:{})})),
    confirmedModelJoins:BUILDING_TOPOLOGY.joins.map(join=>({...join,
      status:'owner-constrained/model-consistent; dimensions unmeasured',
      endpoints:join.sideA==='north'||join.sideA==='south'
        ? join.span.map(x=>[x,join.plane]) : join.span.map(z=>[join.plane,z]),
      baseElevations:[getSpace(join.a).y,getSpace(join.b).y],
    })),
    unresolvedJoins:BUILDING_TOPOLOGY.unresolvedJoins,
    conflicts:{
      rackHouseFloorPlan:{...floorPlanIntersection(rack,house),
        interpretation:'Plan overlap only. Base floors differ; this is not proof of coincident slabs or a surveyed collision.'},
      upperMinusHouseAtticBaseElevation:delta,
      baseFloorsCoincident:delta===0,
      officeEastToHouseWest:{officePlane:officeBounds.x[1],housePlane:houseBounds.x[0],gap:clean(houseBounds.x[0]-officeBounds.x[1]),
        officeSpan:officeBounds.z,houseSpan:houseBounds.z,
        caveat:'Comparison to the assumed western house envelope; the yellow-reference target wall is not surveyed.'},
      rackNorthToHouseNorth:{rackPlane:rackBounds.z[0],housePlane:houseBounds.z[0],offset:clean(houseBounds.z[0]-rackBounds.z[0]),
        rackSpan:rackBounds.x,houseSpan:houseBounds.x,
        caveat:'Comparison to the assumed northern house envelope, not an identification of the blue-reference side wall.'},
    },
    commonUpperEdges:UPPER_SPACE_IDS.slice(0,2).map(id=>({id,north:bounds(id).z[0],south:bounds(id).z[1]})),
    floorLevels:Object.fromEntries(SPACE_MANIFEST.map(s=>[s.id,s.y])),
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(auditGeometry(),null,2)+'\n');
